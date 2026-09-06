"""_style_notes_from_collected builds a grounded style prompt from real
gathered data only; _generate_style_moodboard is a nice-to-have on top of
the core brief -- a failure here must never block brief finalization, only
degrade gracefully to no moodboard, same shape as pronunciation audio."""

from unittest.mock import MagicMock, patch

import run_campaign


def test_style_notes_none_when_nothing_gathered():
    assert run_campaign._style_notes_from_collected({}) is None


def test_style_notes_combines_greeting_style_and_local_delight_signals():
    collected = {
        "culture_notes": {"greeting_style": "A warm folded-hands namaste"},
        "local_delight": {
            "cultural_references": ["Bollywood", "Holi festival colors"],
            "crowd_moment_suggestions": ["a synchronized chant", "confetti burst"],
        },
    }
    notes = run_campaign._style_notes_from_collected(collected)
    assert "A warm folded-hands namaste" in notes
    assert "Bollywood" in notes
    assert "a synchronized chant" in notes


def test_generate_style_moodboard_posts_and_returns_url():
    fake_response = MagicMock()
    fake_response.json.return_value = {"city_id": "mumbai", "moodboard_url": "https://x/moodboard.png"}
    with patch.object(run_campaign.requests, "post", return_value=fake_response) as mock_post:
        result = run_campaign._generate_style_moodboard("mumbai", "Mumbai", "warm saffron palette", "fake-token")

    assert result == "https://x/moodboard.png"
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"city_id": "mumbai", "city_name": "Mumbai", "style_notes": "warm saffron palette"}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_generate_style_moodboard_http_error_degrades_to_none():
    fake_response = MagicMock()
    fake_response.raise_for_status.side_effect = run_campaign.requests.HTTPError("502")
    with patch.object(run_campaign.requests, "post", return_value=fake_response):
        result = run_campaign._generate_style_moodboard("mumbai", "Mumbai", "warm saffron palette", "fake-token")

    assert result is None
