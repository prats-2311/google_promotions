"""Functional (non-security) behavior of /live_city_demographics_search.

Mirrors test_live_culture_search.py exactly -- same mocking pattern, same
error-path coverage -- since this route follows the identical curated-first/
live-fallback-second shape, just for demographic facts (literacy, income,
population, top interests) instead of etiquette guidance.
"""

from unittest.mock import MagicMock

import tour_data_api_main as main
import parallel


def _mock_search_result(mock_parallel_client, results):
    mock_result = MagicMock()
    mock_result.results = results
    mock_parallel_client.search.return_value = mock_result


def _mock_excerpt(url="https://example.com", title="Example", excerpts=None):
    r = MagicMock()
    r.url = url
    r.title = title
    r.excerpts = excerpts or ["some excerpt text"]
    return r


def test_returns_low_confidence_notice_when_no_search_results(client, mock_parallel_client, monkeypatch):
    _mock_search_result(mock_parallel_client, [])
    res = client.post("/live_city_demographics_search", json={"city_name": "Nowhereville"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["confidence"] == "low"
    assert body["source"] == "parallel_live"
    assert body["top_interest_categories"] == []


def test_successful_synthesis_returns_city_demographics_compatible_shape(client, mock_parallel_client, monkeypatch):
    _mock_search_result(mock_parallel_client, [_mock_excerpt()])
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "literacy_rate": 98.0, "median_age": 35.0, "population": 9700000,
        "median_household_income_usd": 41000.0, "internet_penetration_rate": 91.0,
        "dominant_social_platforms": ["Instagram"], "top_interest_categories": ["live music"],
        "notable_public_holidays": ["National Day"], "confidence": "medium",
    })
    res = client.post("/live_city_demographics_search", json={"city_name": "Seoul"})
    assert res.status_code == 200
    body = res.get_json()
    for field in (
        "literacy_rate", "median_age", "population", "median_household_income_usd",
        "internet_penetration_rate", "dominant_social_platforms",
        "top_interest_categories", "notable_public_holidays",
    ):
        assert field in body
    assert body["source"] == "parallel_live"
    assert len(body["citations"]) == 1


def test_parallel_api_error_returns_502(client, mock_parallel_client):
    mock_parallel_client.search.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/live_city_demographics_search", json={"city_name": "Seoul"})
    assert res.status_code == 502


def test_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/live_city_demographics_search", json={"city_name": "Seoul"})
    assert res.status_code == 500


def test_gemini_synthesis_failure_returns_502(client, mock_parallel_client, monkeypatch):
    _mock_search_result(mock_parallel_client, [_mock_excerpt()])

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/live_city_demographics_search", json={"city_name": "Seoul"})
    assert res.status_code == 502


def test_search_queries_follow_best_practice_shape(mock_parallel_client, monkeypatch):
    """Same regression guard as live_culture_search's: 2-3 short keyword
    queries, never full sentences -- see cloud_run/tour_data_api/CLAUDE.md."""
    _mock_search_result(mock_parallel_client, [])
    main._demographics_search("Berlin", "Germany")
    _, kwargs = mock_parallel_client.search.call_args
    queries = kwargs["search_queries"]
    assert 2 <= len(queries) <= 3
    for q in queries:
        assert len(q.split()) <= 6, f"query looks like a sentence, not a keyword phrase: {q!r}"


def test_mode_is_not_derived_from_any_caller_input(mock_parallel_client, monkeypatch):
    """mode is a handler-side tuning lever, same rule as the other two live
    search routes -- never sourced from the request payload."""
    _mock_search_result(mock_parallel_client, [])
    main._demographics_search("Berlin", None)
    _, kwargs = mock_parallel_client.search.call_args
    assert kwargs["mode"] == "advanced"
