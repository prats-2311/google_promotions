"""_live_culture_search_direct and _check_grounding_direct are the driver's
own 'code acts' bypass around the per-turn nested-tool-call budget — they
call tour_data_api directly over HTTP rather than through the conversational
Playbook path. Mock requests, don't hit the network."""

from unittest.mock import MagicMock, patch

import run_campaign


def test_live_culture_search_direct_posts_city_name_and_returns_json():
    fake_response = MagicMock()
    fake_response.json.return_value = {"source": "parallel_live", "confidence": "low"}
    with patch.object(run_campaign.requests, "post", return_value=fake_response) as mock_post:
        result = run_campaign._live_culture_search_direct("Berlin", "fake-token")

    assert result == {"source": "parallel_live", "confidence": "low"}
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"city_name": "Berlin"}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"
    fake_response.raise_for_status.assert_called_once()


def test_live_culture_search_direct_raises_on_http_error():
    fake_response = MagicMock()
    fake_response.raise_for_status.side_effect = run_campaign.requests.HTTPError("502")
    with patch.object(run_campaign.requests, "post", return_value=fake_response):
        try:
            run_campaign._live_culture_search_direct("Berlin", "fake-token")
            assert False, "expected HTTPError to propagate"
        except run_campaign.requests.HTTPError:
            pass


def test_check_grounding_direct_posts_expected_shape():
    fake_response = MagicMock()
    fake_response.json.return_value = {"grounding_check_passed": True, "grounding_check_notes": "ok"}
    with patch.object(run_campaign.requests, "post", return_value=fake_response) as mock_post:
        result = run_campaign._check_grounding_direct("{}", ["avoid politics"], "dry wit", "fake-token")

    assert result["grounding_check_passed"] is True
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"draft_brief_text": "{}", "donts": ["avoid politics"], "humor_boundaries": "dry wit"}
