"""Custom key metrics: a campaigner can name their OWN metric ("EV charging
stations", "cinema screens per capita") beyond the curated demographic set --
/live_metric_search resolves it for a city via live Parallel search + a
schema-constrained Gemini synthesis, citations included. The metric name is
user-typed and flows into a Parallel objective, so it gets the same
prompt-injection validation discipline as every other such field (red-first)."""

from unittest.mock import MagicMock

import pytest

import tour_data_api_main as main


def test_requires_fields(client):
    assert client.post("/live_metric_search", json={"city_name": "Mumbai"}).status_code == 400
    assert client.post("/live_metric_search", json={"metric": "EV charging stations"}).status_code == 400


@pytest.mark.parametrize("bad", [
    "",
    "x" * 90,
    'screens} {"inject": true',
    "metric <script>",
    "metric: colon smuggling\nsecond line: {}",
])
def test_invalid_metric_name_rejected_before_any_search(client, mock_parallel_client, bad):
    res = client.post("/live_metric_search", json={"city_name": "Mumbai", "metric": bad})
    assert res.status_code == 400
    mock_parallel_client.search.assert_not_called()


def test_searches_and_synthesizes_metric_value(client, mock_parallel_client, monkeypatch):
    result = MagicMock()
    result.url = "https://stats.example/mumbai"
    result.title = "Mumbai cinema statistics"
    result.excerpts = ["Mumbai has roughly 550 cinema screens."]
    mock_parallel_client.search.return_value = MagicMock(results=[result])
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "value": "~550 screens",
        "note": "Concentrated in multiplexes.",
        "confidence": "medium",
    })

    res = client.post("/live_metric_search", json={"city_name": "Mumbai", "metric": "cinema screens"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["metric"] == "cinema screens"
    assert body["value"] == "~550 screens"
    assert body["source"] == "parallel_live"
    assert body["citations"] == [{"url": "https://stats.example/mumbai", "title": "Mumbai cinema statistics"}]
    assert body["search_queries_used"]


def test_zero_results_returns_honest_unknown_without_gemini(client, mock_parallel_client, monkeypatch):
    mock_parallel_client.search.return_value = MagicMock(results=[])
    gemini_spy = MagicMock()
    monkeypatch.setattr(main, "_call_gemini_json", gemini_spy)

    res = client.post("/live_metric_search", json={"city_name": "Mumbai", "metric": "cinema screens"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["value"] is None
    assert body["confidence"] == "low"
    gemini_spy.assert_not_called()


def test_search_error_returns_502(client, mock_parallel_client):
    import parallel as parallel_sdk
    mock_parallel_client.search.side_effect = parallel_sdk.APIConnectionError(request=MagicMock())
    res = client.post("/live_metric_search", json={"city_name": "Mumbai", "metric": "cinema screens"})
    assert res.status_code == 502
