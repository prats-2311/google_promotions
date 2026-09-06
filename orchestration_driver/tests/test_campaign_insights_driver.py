"""_synthesize_campaign_insights_step runs once at the end of run_campaign(),
after every stop has had its chance to finalize. A nice-to-have on top of
the core per-city pipeline -- any failure here must degrade gracefully,
never fail the whole campaign run."""

from unittest.mock import MagicMock, patch

import run_campaign


def _briefs_response(briefs):
    resp = MagicMock()
    resp.json.return_value = {"briefs": briefs}
    resp.raise_for_status.return_value = None
    return resp


def test_skips_when_fewer_than_two_finalized_briefs():
    with patch.object(run_campaign.requests, "get", return_value=_briefs_response([
        {"city_id": "mumbai", "status": "final", "culture_summary": "{}", "local_delight_summary": "{}", "talent_brief_json": "{}"},
    ])) as mock_get, \
         patch.object(run_campaign.requests, "post") as mock_post:
        run_campaign._synthesize_campaign_insights_step("c1", "fake-token", {"mumbai": "Mumbai"})

    mock_get.assert_called_once()
    mock_post.assert_not_called()


def test_synthesizes_and_inserts_for_two_or_more_finalized_briefs():
    briefs = [
        {"city_id": "mumbai", "status": "final", "culture_summary": "{}", "local_delight_summary": "{}", "talent_brief_json": "{}"},
        {"city_id": "tokyo", "status": "final", "culture_summary": "{}", "local_delight_summary": "{}", "talent_brief_json": "{}"},
    ]
    synth_resp = MagicMock()
    synth_resp.json.return_value = {"insights": [{"title": "x", "summary": "y", "severity": "advisory", "affected_cities": ["mumbai", "tokyo"]}]}
    synth_resp.raise_for_status.return_value = None
    insert_resp = MagicMock()
    insert_resp.raise_for_status.return_value = None

    with patch.object(run_campaign.requests, "get", return_value=_briefs_response(briefs)), \
         patch.object(run_campaign.requests, "post", side_effect=[synth_resp, insert_resp]) as mock_post:
        run_campaign._synthesize_campaign_insights_step("c1", "fake-token", {"mumbai": "Mumbai", "tokyo": "Tokyo"})

    assert mock_post.call_count == 2
    synth_call, insert_call = mock_post.call_args_list
    assert synth_call.args[0].endswith("/synthesize_campaign_insights")
    assert synth_call.kwargs["json"]["campaign_id"] == "c1"
    assert len(synth_call.kwargs["json"]["cities"]) == 2
    assert insert_call.args[0].endswith("/campaign_insights")
    assert insert_call.kwargs["json"]["campaign_id"] == "c1"


def test_ignores_pending_briefs_when_counting():
    briefs = [
        {"city_id": "mumbai", "status": "final", "culture_summary": "{}", "local_delight_summary": "{}", "talent_brief_json": "{}"},
        {"city_id": "tokyo", "status": "pending", "culture_summary": None, "local_delight_summary": None, "talent_brief_json": None},
    ]
    with patch.object(run_campaign.requests, "get", return_value=_briefs_response(briefs)), \
         patch.object(run_campaign.requests, "post") as mock_post:
        run_campaign._synthesize_campaign_insights_step("c1", "fake-token", {"mumbai": "Mumbai", "tokyo": "Tokyo"})

    mock_post.assert_not_called()


def test_failure_is_swallowed_not_raised():
    with patch.object(run_campaign.requests, "get", side_effect=RuntimeError("network down")):
        run_campaign._synthesize_campaign_insights_step("c1", "fake-token", {})
