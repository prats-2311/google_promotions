"""_fetch_venue_notes calls tour_data_api's Parallel-Extract-backed
/extract_venue_info for the venue URL a campaign creator supplied -- a
nice-to-have on top of the core brief, never allowed to block it. A failure
degrades gracefully to no venue notes, same shape as pronunciation audio and
the style moodboard."""

from unittest.mock import MagicMock, patch

import run_campaign


def test_posts_venue_url_and_returns_json_string():
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "source": "parallel_extract", "capacity": "12,000", "typical_event_format": "seated",
        "logistics_notes": "load-in via loading dock B", "confidence": "medium", "citations": [],
    }
    with patch.object(run_campaign.requests, "post", return_value=fake_response) as mock_post:
        result = run_campaign._fetch_venue_notes("https://venue.example.com", "Mumbai", "fake-token")

    assert result is not None
    assert '"capacity": "12,000"' in result
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"urls": ["https://venue.example.com"], "city_name": "Mumbai"}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_http_error_degrades_to_none_instead_of_raising():
    fake_response = MagicMock()
    fake_response.raise_for_status.side_effect = run_campaign.requests.HTTPError("502")
    with patch.object(run_campaign.requests, "post", return_value=fake_response):
        result = run_campaign._fetch_venue_notes("https://venue.example.com", "Mumbai", "fake-token")

    assert result is None
