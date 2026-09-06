"""_synthesize_pronunciation_audio is a nice-to-have on top of the core
brief -- a failure here must never block brief finalization, only degrade
gracefully to no audio."""

from unittest.mock import MagicMock, patch

import run_campaign


def test_returns_none_for_empty_phrases():
    assert run_campaign._synthesize_pronunciation_audio([], "fake-token") is None


def test_posts_phrases_and_returns_audio_list():
    fake_response = MagicMock()
    fake_response.json.return_value = {"audio": [{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]}
    with patch.object(run_campaign.requests, "post", return_value=fake_response) as mock_post:
        result = run_campaign._synthesize_pronunciation_audio(["Namaste!"], "fake-token")

    assert result == [{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"phrases": ["Namaste!"]}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_http_error_degrades_to_none_instead_of_raising():
    fake_response = MagicMock()
    fake_response.raise_for_status.side_effect = run_campaign.requests.HTTPError("502")
    with patch.object(run_campaign.requests, "post", return_value=fake_response):
        result = run_campaign._synthesize_pronunciation_audio(["Namaste!"], "fake-token")

    assert result is None
