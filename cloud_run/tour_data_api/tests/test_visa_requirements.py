"""/visa_requirements: real Parallel Search for touring-artist visa category
and typical processing lead time for a nationality/destination-country
pair -- purely on-demand, no curated seed data. The stop_date-vs-lead-time
risk comparison itself happens client-side; this route only returns the
grounded fact."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def _fake_search_result(excerpt="P-1 visa average processing time is 11.5 months for touring musicians."):
    r = MagicMock()
    r.url = "https://example.com/visa-guide"
    r.title = "US Touring Visa Guide"
    r.excerpts = [excerpt]
    result = MagicMock()
    result.results = [r]
    return result


def _default_synthesis(prompt=None, schema=None):
    return {
        "visa_type": "P-1",
        "typical_lead_time_weeks": 50,
        "notes": "P-1 visa average processing time is 11.5 months for touring musicians.",
        "confidence": "medium",
    }


def test_requires_nationality_and_destination(client):
    res = client.post("/visa_requirements", json={"artist_nationality": "Canadian"})
    assert res.status_code == 400


def test_rejects_invalid_nationality(client):
    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian; DROP TABLE cities", "destination_country": "United States",
    })
    assert res.status_code == 400


def test_discovers_and_synthesizes_visa_info(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["source"] == "parallel_live"
    assert body["visa_type"] == "P-1"
    assert body["typical_lead_time_weeks"] == 50
    assert len(body["citations"]) == 1


def test_response_includes_the_real_search_queries_used(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })

    body = res.get_json()
    assert "search_queries_used" in body
    assert any("Canadian" in q for q in body["search_queries_used"])


def test_returns_low_confidence_when_no_search_results(client, mock_parallel_client):
    mock_result = MagicMock()
    mock_result.results = []
    mock_parallel_client.search.return_value = mock_result

    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["confidence"] == "low"
    assert body["visa_type"] is None


def test_search_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/visa_requirements", json={
        "artist_nationality": "Canadian", "destination_country": "United States",
    })
    assert res.status_code == 502
