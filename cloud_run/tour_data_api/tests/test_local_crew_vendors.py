"""/local_crew_vendors: real Parallel Search for the local production
ecosystem in a city -- staging/lighting/sound rental companies, catering,
and local labor/union requirements -- a city-level reference fact with no
curated seed data, purely on-demand (no BigQuery persistence, mirrors the
Cultural Drift Check / Post-Show Outcome on-demand pattern)."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def _fake_search_result(excerpt="Nairobi Staging Co. provides lighting and sound rental for live events."):
    r = MagicMock()
    r.url = "https://example.com/vendors"
    r.title = "Nairobi Event Production Guide"
    r.excerpts = [excerpt]
    result = MagicMock()
    result.results = [r]
    return result


def _default_synthesis(prompt=None, schema=None):
    return {
        "vendors": [{
            "name": "Nairobi Staging Co.",
            "category": "staging/lighting/sound rental",
            "note": "Provides lighting and sound rental for live events.",
            "source_url": "https://example.com/vendors",
        }],
        "labor_notes": None,
        "confidence": "medium",
    }


def test_requires_city_name(client):
    res = client.post("/local_crew_vendors", json={})
    assert res.status_code == 400


def test_rejects_invalid_city_name(client):
    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi; DROP TABLE cities"})
    assert res.status_code == 400


def test_discovers_and_synthesizes_vendor_list(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["source"] == "parallel_live"
    assert body["vendors"][0]["name"] == "Nairobi Staging Co."
    assert len(body["citations"]) == 1


def test_response_includes_the_real_search_queries_used(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})

    body = res.get_json()
    assert "search_queries_used" in body
    assert any("Nairobi" in q for q in body["search_queries_used"])


def test_returns_empty_list_when_no_search_results(client, mock_parallel_client):
    mock_result = MagicMock()
    mock_result.results = []
    mock_parallel_client.search.return_value = mock_result

    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["vendors"] == []


def test_search_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/local_crew_vendors", json={"city_name": "Nairobi"})
    assert res.status_code == 502
