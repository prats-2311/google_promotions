"""/seasonal_weather_risk: real Parallel Search for the typical seasonal
weather risk (monsoon, hurricane season, extreme heat, etc.) in a city
during a given month/date, for touring/large outdoor event contingency
planning -- purely on-demand, no curated seed data."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def _fake_search_result(excerpt="Mumbai's monsoon season (June-September) brings heavy rainfall and flooding risk."):
    r = MagicMock()
    r.url = "https://example.com/weather"
    r.title = "Mumbai Seasonal Weather Guide"
    r.excerpts = [excerpt]
    result = MagicMock()
    result.results = [r]
    return result


def _default_synthesis(prompt=None, schema=None):
    return {
        "risk_level": "high",
        "notes": "Mumbai's monsoon season (June-September) brings heavy rainfall and flooding risk.",
        "confidence": "medium",
    }


def test_requires_city_name_and_month(client):
    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai"})
    assert res.status_code == 400


def test_rejects_invalid_city_name(client):
    res = client.post("/seasonal_weather_risk", json={
        "city_name": "Mumbai; DROP TABLE cities", "month_or_date": "July",
    })
    assert res.status_code == 400


def test_discovers_and_synthesizes_weather_risk(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["source"] == "parallel_live"
    assert body["risk_level"] == "high"
    assert len(body["citations"]) == 1


def test_response_includes_the_real_search_queries_used(client, mock_parallel_client, monkeypatch):
    """The UI shows this while/after the search so the user sees what was
    actually searched for, not just a spinner -- must be the real queries
    sent to Parallel, not a frontend-guessed approximation."""
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})

    body = res.get_json()
    assert "search_queries_used" in body
    assert any("Mumbai" in q for q in body["search_queries_used"])
    assert any("July" in q for q in body["search_queries_used"])


def test_returns_low_confidence_when_no_search_results(client, mock_parallel_client):
    mock_result = MagicMock()
    mock_result.results = []
    mock_parallel_client.search.return_value = mock_result

    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["confidence"] == "low"
    assert body["risk_level"] is None


def test_search_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/seasonal_weather_risk", json={"city_name": "Mumbai", "month_or_date": "July"})
    assert res.status_code == 502
