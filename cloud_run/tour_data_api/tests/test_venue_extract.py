"""/extract_venue_info: real Parallel Extract against a specific venue URL,
synthesized (Gemini, schema-constrained) into structured venue notes --
distinct from city-level culture_notes, stop-specific logistics instead."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def _fake_extract_result(excerpt="Capacity: 5,000. Indoor arena."):
    result = MagicMock()
    r = MagicMock()
    r.url = "https://example.com/venue"
    r.title = "Example Venue"
    r.excerpts = [excerpt]
    result.results = [r]
    return result


def test_requires_urls(client):
    res = client.post("/extract_venue_info", json={"urls": []})
    assert res.status_code == 400


def test_extracts_and_synthesizes(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.extract.return_value = _fake_extract_result()
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "capacity": "5,000",
        "typical_event_format": "indoor arena show",
        "logistics_notes": "Standard load-in via rear dock.",
        "confidence": "medium",
    })

    res = client.post("/extract_venue_info", json={"urls": ["https://example.com/venue"]})

    assert res.status_code == 200
    body = res.get_json()
    assert body["capacity"] == "5,000"
    assert body["source"] == "parallel_extract"
    assert len(body["citations"]) == 1


def test_extract_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.extract.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/extract_venue_info", json={"urls": ["https://example.com/venue"]})
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/extract_venue_info", json={"urls": ["https://example.com/venue"]})
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.extract.return_value = _fake_extract_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/extract_venue_info", json={"urls": ["https://example.com/venue"]})
    assert res.status_code == 502
