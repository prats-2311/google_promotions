"""/discover_venues: real Parallel Search for actual candidate venues in a
city -- the campaign creator picks from a real, cited shortlist instead of
needing to already have a specific venue URL in hand. /extract_venue_info
is the deep-dive once one is chosen."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def _fake_search_result(excerpt="The O2 Arena, an 20,000-capacity indoor arena in Greenwich."):
    r = MagicMock()
    r.url = "https://example.com/venues"
    r.title = "London Venues Guide"
    r.excerpts = [excerpt]
    result = MagicMock()
    result.results = [r]
    return result


def test_requires_city_name(client):
    res = client.post("/discover_venues", json={})
    assert res.status_code == 400


def test_rejects_invalid_city_name(client):
    res = client.post("/discover_venues", json={"city_name": "London; DROP TABLE cities"})
    assert res.status_code == 400


def test_discovers_and_synthesizes_venue_list(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "venues": [{
            "name": "The O2 Arena",
            "venue_type": "indoor arena",
            "approx_capacity": "20,000",
            "source_url": "https://example.com/venues",
            "note": "Major indoor arena in Greenwich.",
        }],
    })

    res = client.post("/discover_venues", json={"city_name": "London"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["source"] == "parallel_live"
    assert body["venues"][0]["name"] == "The O2 Arena"
    assert len(body["citations"]) == 1


def test_returns_empty_list_when_no_search_results(client, mock_parallel_client):
    mock_result = MagicMock()
    mock_result.results = []
    mock_parallel_client.search.return_value = mock_result

    res = client.post("/discover_venues", json={"city_name": "London"})

    assert res.status_code == 200
    body = res.get_json()
    assert body["venues"] == []


def test_search_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/discover_venues", json={"city_name": "London"})
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/discover_venues", json={"city_name": "London"})
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/discover_venues", json={"city_name": "London"})
    assert res.status_code == 502


def test_capacity_and_format_hints_reach_the_search(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = _fake_search_result()
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {"venues": []})

    client.post("/discover_venues", json={
        "city_name": "London", "capacity_hint": "15,000+", "format_hint": "outdoor festival",
    })

    _, kwargs = mock_parallel_client.search.call_args
    assert "15,000+" in kwargs["objective"]
    assert "outdoor festival" in kwargs["objective"]
