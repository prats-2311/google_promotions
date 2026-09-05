"""Cities within a campaign are genuinely independent -- each runs its own
Dialogflow CX session with no shared state -- so run_campaign() dispatches
them concurrently instead of one-after-another. The intra-city agent handoff
inside run_city() stays sequential on purpose (real per-turn execution-budget
and session-navigation platform limits, documented in this module's
docstring); this only changes the *inter-city* dispatch layer."""

from unittest.mock import patch

import run_campaign


def _stop(city_id, city_name="City", stop_date="2027-01-01"):
    return {"city_id": city_id, "city_name": city_name, "stop_date": stop_date}


def test_run_city_safe_returns_result_on_success():
    with patch.object(run_campaign, "run_city", return_value="https://example.com/card.html"):
        city_id, url = run_campaign._run_city_safe(_stop("tokyo"), "camp1", "Title", [])
    assert city_id == "tokyo"
    assert url == "https://example.com/card.html"


def test_run_city_safe_isolates_an_exception_and_returns_none():
    """One city's unhandled exception must not propagate and take down
    concurrently-running sibling cities."""
    with patch.object(run_campaign, "run_city", side_effect=RuntimeError("boom")):
        city_id, url = run_campaign._run_city_safe(_stop("london"), "camp1", "Title", [])
    assert city_id == "london"
    assert url is None


def test_run_campaign_dispatches_every_stop_and_maps_results_by_city_id():
    stops = [_stop("tokyo"), _stop("london"), _stop("mumbai")]
    with patch.object(run_campaign, "_auth_token", return_value="fake-token"), \
         patch.object(run_campaign, "_fetch_campaign_title", return_value="My Tour"), \
         patch.object(run_campaign, "_fetch_campaign_stops", return_value=stops), \
         patch.object(run_campaign, "_fetch_selected_metrics", return_value=[]), \
         patch.object(run_campaign, "run_city", side_effect=lambda city_id, *a, **k: f"https://cards/{city_id}"):
        results = run_campaign.run_campaign("camp1")

    assert results == {
        "tokyo": "https://cards/tokyo",
        "london": "https://cards/london",
        "mumbai": "https://cards/mumbai",
    }


def test_run_campaign_one_city_failing_does_not_block_the_others():
    stops = [_stop("tokyo"), _stop("london")]

    def _side_effect(city_id, *a, **k):
        if city_id == "london":
            raise RuntimeError("simulated failure")
        return f"https://cards/{city_id}"

    with patch.object(run_campaign, "_auth_token", return_value="fake-token"), \
         patch.object(run_campaign, "_fetch_campaign_title", return_value="My Tour"), \
         patch.object(run_campaign, "_fetch_campaign_stops", return_value=stops), \
         patch.object(run_campaign, "_fetch_selected_metrics", return_value=[]), \
         patch.object(run_campaign, "run_city", side_effect=_side_effect):
        results = run_campaign.run_campaign("camp1")

    assert results == {"tokyo": "https://cards/tokyo", "london": None}


def test_run_campaign_returns_empty_dict_for_no_stops():
    with patch.object(run_campaign, "_auth_token", return_value="fake-token"), \
         patch.object(run_campaign, "_fetch_campaign_title", return_value="Empty Tour"), \
         patch.object(run_campaign, "_fetch_campaign_stops", return_value=[]), \
         patch.object(run_campaign, "_fetch_selected_metrics", return_value=[]):
        results = run_campaign.run_campaign("camp1")
    assert results == {}


def test_max_workers_is_capped_by_max_concurrent_cities_env(monkeypatch):
    stops = [_stop(f"city{i}") for i in range(5)]
    monkeypatch.setattr(run_campaign, "MAX_CONCURRENT_CITIES", 2)
    captured = {}
    real_executor_cls = run_campaign.ThreadPoolExecutor

    class _RecordingExecutor(real_executor_cls):
        def __init__(self, max_workers=None, *a, **k):
            captured["max_workers"] = max_workers
            super().__init__(max_workers=max_workers, *a, **k)

    with patch.object(run_campaign, "_auth_token", return_value="fake-token"), \
         patch.object(run_campaign, "_fetch_campaign_title", return_value="Big Tour"), \
         patch.object(run_campaign, "_fetch_campaign_stops", return_value=stops), \
         patch.object(run_campaign, "_fetch_selected_metrics", return_value=[]), \
         patch.object(run_campaign, "run_city", side_effect=lambda city_id, *a, **k: city_id), \
         patch.object(run_campaign, "ThreadPoolExecutor", _RecordingExecutor):
        run_campaign.run_campaign("camp1")

    assert captured["max_workers"] == 2
