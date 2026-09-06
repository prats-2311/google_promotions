"""/synthesize_campaign_insights (Gemini synthesis, no BigQuery write) and
/campaign_insights (GET latest row / POST insert) -- the cross-city pattern
synthesis step run once after every stop in a campaign has a final brief."""

from unittest.mock import MagicMock

import tour_data_api_main as main


def test_synthesize_requires_cities(client):
    res = client.post("/synthesize_campaign_insights", json={"campaign_id": "c1", "cities": []})
    assert res.status_code == 400


def test_synthesize_calls_gemini_and_returns_insights(client, monkeypatch):
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "insights": [
            {
                "title": "Football carries different weight across stops",
                "summary": "Safe bonding topic in São Paulo, more politically loaded in Tokyo given recent public comments.",
                "severity": "advisory",
                "affected_cities": ["sao_paulo", "tokyo"],
            }
        ]
    })
    res = client.post("/synthesize_campaign_insights", json={
        "campaign_id": "c1",
        "cities": [
            {"city_id": "sao_paulo", "city_name": "São Paulo", "culture_summary": "warm", "local_delight_summary": "{}", "talent_brief_json": "{}"},
            {"city_id": "tokyo", "city_name": "Tokyo", "culture_summary": "reserved", "local_delight_summary": "{}", "talent_brief_json": "{}"},
        ],
    })
    assert res.status_code == 200
    insights = res.get_json()["insights"]
    assert len(insights) == 1
    assert insights[0]["affected_cities"] == ["sao_paulo", "tokyo"]


def test_synthesize_gemini_failure_returns_502(client, monkeypatch):
    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/synthesize_campaign_insights", json={
        "campaign_id": "c1",
        "cities": [{"city_id": "mumbai", "city_name": "Mumbai", "culture_summary": "x", "local_delight_summary": "{}", "talent_brief_json": "{}"}],
    })
    assert res.status_code == 502


def test_campaign_insights_get_requires_campaign_id(client):
    res = client.get("/campaign_insights")
    assert res.status_code == 400


def test_campaign_insights_get_returns_latest_row(client, mock_bq):
    mock_row = MagicMock()
    mock_row.__getitem__.side_effect = lambda k: {
        "campaign_id": "c1",
        "generated_at": None,
        "insights_json": '[{"title": "x"}]',
    }[k]
    mock_bq.query.return_value.result.return_value = [mock_row]
    res = client.get("/campaign_insights?campaign_id=c1")
    assert res.status_code == 200
    assert res.get_json()["insights_json"] == '[{"title": "x"}]'


def test_campaign_insights_get_returns_null_when_none_generated_yet(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.get("/campaign_insights?campaign_id=c1")
    assert res.status_code == 200
    assert res.get_json()["insights_json"] is None


def test_campaign_insights_post_inserts_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/campaign_insights", json={
        "campaign_id": "c1", "insights_json": '[{"title": "x"}]',
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "inserted"


def test_campaign_insights_post_requires_campaign_id(client):
    res = client.post("/campaign_insights", json={"insights_json": "[]"})
    assert res.status_code == 400
