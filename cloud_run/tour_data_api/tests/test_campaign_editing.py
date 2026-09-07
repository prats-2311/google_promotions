"""Full campaign editing, post-creation: an ongoing campaign's title, genre,
campaign_type, talent_roster, and stops can all change after it's created,
not just at creation time. An UPDATE/DELETE would hit BigQuery's streaming-
buffer limitation on a just-inserted row (see bigquery/CLAUDE.md), so every
edit here is a new row, not a mutation -- the same insert-only "latest
revision wins" pattern city_briefs already uses at read time
(QUALIFY ROW_NUMBER() ... ORDER BY updated_at DESC = 1)."""

from unittest.mock import MagicMock

import tour_data_api_main as main


def _campaign_row(**overrides):
    row = {
        "campaign_id": "c1",
        "title": "The Odyssey",
        "campaign_type": "film_promo_tour",
        "genre": "scifi",
        "talent_roster": ["Artist X"],
        "status": "active",
        "selected_metrics": [],
        "created_at": main.datetime.datetime(2026, 8, 1, tzinfo=main.datetime.timezone.utc),
    }
    row.update(overrides)
    return row


def test_update_campaign_requires_campaign_id(client):
    res = client.post("/update_campaign", json={"title": "New Title"})
    assert res.status_code == 400


def test_update_campaign_404s_when_campaign_does_not_exist(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.post("/update_campaign", json={"campaign_id": "nope", "title": "New Title"})
    assert res.status_code == 404


def test_update_campaign_merges_partial_fields_onto_current_state(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [_campaign_row()]
    mock_bq.insert_rows_json.return_value = []

    res = client.post("/update_campaign", json={"campaign_id": "c1", "genre": "synth-pop"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["title"] == "The Odyssey"  # unchanged field carried forward
    assert body["genre"] == "synth-pop"  # changed field applied

    args, _ = mock_bq.insert_rows_json.call_args
    inserted_row = args[1][0]
    assert inserted_row["campaign_id"] == "c1"
    assert inserted_row["title"] == "The Odyssey"
    assert inserted_row["genre"] == "synth-pop"
    assert inserted_row["created_at"] == "2026-08-01T00:00:00+00:00"  # original creation time preserved
    assert inserted_row["updated_at"] != inserted_row["created_at"]  # a fresh revision timestamp


def test_update_campaign_insert_failure_returns_500(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [_campaign_row()]
    mock_bq.insert_rows_json.return_value = [{"errors": ["boom"]}]
    res = client.post("/update_campaign", json={"campaign_id": "c1", "genre": "synth-pop"})
    assert res.status_code == 500


def test_remove_campaign_stop_requires_fields(client):
    res = client.post("/remove_campaign_stop", json={"campaign_id": "c1"})
    assert res.status_code == 400


def test_remove_campaign_stop_inserts_a_removal_marker_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/remove_campaign_stop", json={"campaign_id": "c1", "city_id": "tokyo"})

    assert res.status_code == 200
    args, _ = mock_bq.insert_rows_json.call_args
    inserted_row = args[1][0]
    assert inserted_row["campaign_id"] == "c1"
    assert inserted_row["city_id"] == "tokyo"
    assert inserted_row["removed"] is True


def test_remove_campaign_stop_insert_failure_returns_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"errors": ["boom"]}]
    res = client.post("/remove_campaign_stop", json={"campaign_id": "c1", "city_id": "tokyo"})
    assert res.status_code == 500
