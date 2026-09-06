"""/bulk_add_cities: real Parallel Task API batch research for many new
cities at once, instead of N sequential live-search calls. /cities_list is
the data-driven replacement for the old hardcoded _SUPPORTED_CITY_IDS set --
a bulk-added city needs to actually become selectable, not just exist as a
row nobody can reach."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def test_bulk_add_requires_city_names(client):
    res = client.post("/bulk_add_cities", json={"city_names": []})
    assert res.status_code == 400


def test_bulk_add_creates_task_group_and_inserts_cities(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = []  # no existing cities
    mock_bq.insert_rows_json.return_value = []

    group = MagicMock()
    group.task_group_id = "tgrp_123"
    mock_parallel_client.task_group.create.return_value = group
    mock_parallel_client.task_group.add_runs.return_value = MagicMock(run_ids=["srun_1"])

    run = MagicMock()
    run.status = "completed"
    mock_parallel_client.task_run.retrieve.return_value = run
    result = MagicMock()
    result.model_dump.return_value = {
        "output": {"content": {"city_name": "Seoul", "country": "South Korea", "primary_language": "Korean", "timezone": "Asia/Seoul", "region": "Seoul"}}
    }
    mock_parallel_client.task_run.result.return_value = result

    res = client.post("/bulk_add_cities", json={"city_names": ["Seoul"]})

    assert res.status_code == 200
    body = res.get_json()
    assert body["added"] == ["seoul"]
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["city_id"] == "seoul"
    assert inserted_row["city_name"] == "Seoul"


def test_bulk_add_skips_cities_that_already_exist(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = [{"city_id": "mumbai"}]

    res = client.post("/bulk_add_cities", json={"city_names": ["Mumbai"]})

    assert res.status_code == 200
    body = res.get_json()
    assert body["skipped_existing"] == ["mumbai"]
    mock_parallel_client.task_group.create.assert_not_called()


def test_bulk_add_missing_parallel_client_returns_500(client, monkeypatch, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/bulk_add_cities", json={"city_names": ["Seoul"]})
    assert res.status_code == 500


def test_cities_list_returns_all_cities(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [{
        "city_id": "mumbai", "city_name": "Mumbai", "country": "India",
        "primary_language": "Hindi", "timezone": "Asia/Kolkata", "region": "Maharashtra",
    }]

    res = client.get("/cities_list")

    assert res.status_code == 200
    assert res.get_json()["cities"][0]["city_id"] == "mumbai"


def test_campaign_stops_post_validates_against_live_cities_table(client, mock_bq):
    """Replaces the old hardcoded _SUPPORTED_CITY_IDS check -- a bulk-added
    city must be accepted here without a code change."""
    mock_bq.query.return_value.result.return_value = [{"city_id": "seoul"}]
    mock_bq.insert_rows_json.return_value = []

    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "seoul", "stop_date": "2027-01-01", "sequence_order": 1}],
    })
    assert res.status_code == 200


def test_campaign_stops_post_rejects_city_not_in_cities_table(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "atlantis", "stop_date": "2027-01-01", "sequence_order": 1}],
    })
    assert res.status_code == 400
