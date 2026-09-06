"""Post-tour retrospective: /synthesize_stop_outcome runs a real live search
for actual press/fan reaction after a stop's date has passed and synthesizes
a real outcome record -- distinct from city_briefs.enthusiasm_score, which
is only ever a pre-show *prediction*. /stop_outcomes stores/reads it."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def test_synthesize_requires_fields(client):
    res = client.post("/synthesize_stop_outcome", json={"campaign_id": "c1"})
    assert res.status_code == 400


def test_synthesize_returns_low_confidence_when_no_results(client, mock_parallel_client):
    mock_result = MagicMock()
    mock_result.results = []
    mock_parallel_client.search.return_value = mock_result

    res = client.post("/synthesize_stop_outcome", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai",
        "campaign_title": "Nova Horizon", "stop_date": "2026-01-01",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["confidence"] == "low"
    assert body["source"] == "parallel_live"


def test_synthesize_and_returns_outcome(client, mock_parallel_client, monkeypatch):
    r = MagicMock()
    r.url = "https://example.com/review"
    r.title = "Review"
    r.excerpts = ["The show drew a huge crowd and rave reviews."]
    mock_result = MagicMock()
    mock_result.results = [r]
    mock_parallel_client.search.return_value = mock_result

    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "outcome_summary": "Sold-out show with strong local press coverage.",
        "sentiment": "positive",
        "confidence": "medium",
    })

    res = client.post("/synthesize_stop_outcome", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai",
        "campaign_title": "Nova Horizon", "stop_date": "2026-01-01",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["sentiment"] == "positive"
    assert len(body["citations"]) == 1


def test_synthesize_parallel_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/synthesize_stop_outcome", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai",
        "campaign_title": "Nova Horizon", "stop_date": "2026-01-01",
    })
    assert res.status_code == 502


def test_stop_outcomes_get_requires_params(client):
    res = client.get("/stop_outcomes?campaign_id=c1")
    assert res.status_code == 400


def test_stop_outcomes_get_returns_latest(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [{
        "campaign_id": "c1", "city_id": "mumbai", "generated_at": None,
        "outcome_json": '{"sentiment": "positive"}',
    }]
    res = client.get("/stop_outcomes?campaign_id=c1&city_id=mumbai")
    assert res.status_code == 200
    assert res.get_json()["outcome_json"] == '{"sentiment": "positive"}'


def test_stop_outcomes_get_returns_null_when_none_exist(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.get("/stop_outcomes?campaign_id=c1&city_id=mumbai")
    assert res.status_code == 200
    assert res.get_json()["outcome_json"] is None


def test_stop_outcomes_post_inserts_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/stop_outcomes", json={
        "campaign_id": "c1", "city_id": "mumbai", "outcome_json": '{"sentiment": "positive"}',
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "inserted"


def test_stop_outcomes_post_requires_fields(client):
    res = client.post("/stop_outcomes", json={"campaign_id": "c1"})
    assert res.status_code == 400
