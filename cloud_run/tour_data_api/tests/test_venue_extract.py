"""/extract_venue_info: real Parallel Extract against a specific venue URL,
plus a second Parallel Search for nearest airport/railway station, both
synthesized (Gemini, schema-constrained) into one structured venue-notes
blob -- distinct from city-level culture_notes, stop-specific logistics
instead."""

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


def _fake_commute_search_result(excerpt="Nearest airport: Heathrow, ~45 min by car."):
    r = MagicMock()
    r.url = "https://example.com/transit"
    r.title = "Getting there"
    r.excerpts = [excerpt]
    result = MagicMock()
    result.results = [r]
    return result


def _default_synthesis(prompt=None, schema=None):
    return {
        "capacity": "5,000",
        "typical_event_format": "indoor arena show",
        "logistics_notes": "Standard load-in via rear dock.",
        "technical_rider_notes": "Stage: 40x30ft. 400A power available. Rear loading dock, no forklift on site.",
        "customs_notes": "France requires an ATA Carnet for temporary import of touring equipment.",
        "nearest_airport": {"name": "Heathrow", "distance_or_travel_time": "~45 min by car"},
        "nearest_railway_station": {"name": "Wembley Central", "distance_or_travel_time": "10 min walk"},
        "confidence": "medium",
    }


def test_requires_urls(client):
    res = client.post("/extract_venue_info", json={"urls": [], "city_name": "London"})
    assert res.status_code == 400


def test_requires_city_name(client):
    res = client.post("/extract_venue_info", json={"urls": ["https://example.com/venue"]})
    assert res.status_code == 400


def test_rejects_invalid_city_name(client):
    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London; DROP TABLE cities",
    })
    assert res.status_code == 400


def test_extracts_and_synthesizes(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.extract.return_value = _fake_extract_result()
    mock_parallel_client.search.return_value = _fake_commute_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London", "country": "France",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["capacity"] == "5,000"
    assert body["source"] == "parallel_extract"
    assert body["nearest_airport"]["name"] == "Heathrow"
    assert body["nearest_railway_station"]["name"] == "Wembley Central"
    assert "40x30ft" in body["technical_rider_notes"]
    assert "ATA Carnet" in body["customs_notes"]
    assert len(body["citations"]) == 3


def test_commute_search_failure_degrades_gracefully(client, mock_parallel_client, monkeypatch):
    """A failed commute search must not block the (already-working) capacity
    and logistics extraction -- same graceful-degradation discipline as the
    driver's own nice-to-have steps."""
    mock_parallel_client.extract.return_value = _fake_extract_result()
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "capacity": "5,000", "typical_event_format": "indoor arena show",
        "logistics_notes": "Standard load-in via rear dock.",
        "nearest_airport": None, "nearest_railway_station": None, "confidence": "medium",
    })

    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["capacity"] == "5,000"
    assert body["nearest_airport"] is None


def test_venue_name_reaches_the_commute_search(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.extract.return_value = _fake_extract_result()
    mock_parallel_client.search.return_value = _fake_commute_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", _default_synthesis)

    client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London", "venue_name": "The O2 Arena",
    })

    _, kwargs = mock_parallel_client.search.call_args
    assert "The O2 Arena" in kwargs["objective"]


def test_extract_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.extract.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London",
    })
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London",
    })
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.extract.return_value = _fake_extract_result()
    mock_parallel_client.search.return_value = _fake_commute_search_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"], "city_name": "London",
    })
    assert res.status_code == 502


def test_extract_echoes_venue_name_into_response(client, mock_parallel_client, monkeypatch):
    """The chosen venue's display name would otherwise be lost the moment
    extraction runs -- downstream artifacts (tour book itinerary) need a
    human label, not a source URL."""
    monkeypatch.setattr(main, "_call_gemini_json", lambda *a, **k: _default_synthesis())
    res = client.post("/extract_venue_info", json={
        "urls": ["https://example.com/venue"],
        "city_name": "London",
        "venue_name": "The O2 Arena",
    })
    assert res.status_code == 200
    assert res.get_json()["venue_name"] == "The O2 Arena"
