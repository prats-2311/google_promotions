"""The /tour_book path on the same service: the campaign-level executive
document. Rendering is pure Jinja over the payload the BFF assembles --
these tests cover the path routing, the derived campaign stats, and the
same autoescape guarantee the delight card has."""

import json
from unittest.mock import MagicMock

import delight_card_renderer_main as main


def _fake_request(payload, path="/tour_book"):
    req = MagicMock()
    req.get_json.return_value = payload
    req.path = path
    return req


def _payload(**overrides):
    p = {
        "campaign": {
            "campaign_id": "camp-1",
            "title": "Nova Horizon",
            "campaign_type": "film_promo_tour",
            "genre": "sci-fi action",
            "talent_roster": ["Lead actor"],
        },
        "generated_at": "2026-09-08",
        "insights": [],
        "cities": [
            {
                "city_id": "mumbai",
                "city_name": "Mumbai",
                "stop_date": "2026-08-10",
                "sequence_order": 1,
                "enthusiasm_score": 92,
                "tier": "Tier 1",
                "grounding_check_passed": True,
                "demographics": {"population": 20000000},
            },
            {
                "city_id": "london",
                "city_name": "London",
                "stop_date": "2026-08-13",
                "sequence_order": 2,
                "enthusiasm_score": 78,
                "tier": "Tier 2",
                "grounding_check_passed": True,
                "demographics": {"population": 9000000},
            },
        ],
    }
    p.update(overrides)
    return p


def test_tour_book_path_routes_and_uploads_to_tour_books(mock_storage_client, monkeypatch):
    captured = {}
    monkeypatch.setattr(main, "_upload_html", lambda html, path: captured.update(path=path) or "https://x/tb.html")
    res = main.render_delight_card(_fake_request(_payload()))
    body = json.loads(res.get_data())
    assert body["tour_book_url"] == "https://x/tb.html"
    assert captured["path"] == "tour-books/camp-1.html"


def test_tour_book_renders_all_cities_and_campaign_stats():
    html = main._render_tour_book(_payload())
    assert "Mumbai" in html and "London" in html
    assert "Nova Horizon" in html
    # avg of 92 and 78, tier-1 count, and the compact population label
    assert "85" in html
    assert "1/2" in html
    assert "20M" in html
    # per-city accents flow through
    assert main._ACCENT_BY_CITY["mumbai"] in html


def test_tour_book_escapes_html_in_payload():
    p = _payload()
    p["campaign"]["title"] = "<script>alert(1)</script>"
    html = main._render_tour_book(p)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_delight_card_path_still_routes_to_card(mock_storage_client):
    res = main.render_delight_card(_fake_request({"brief_id": "b1", "city_id": "mumbai"}, path="/"))
    body = json.loads(res.get_data())
    assert "delight_card_url" in body and "tour_book_url" not in body


def test_fmt_compact():
    assert main._fmt_compact(20000000) == "20M"
    assert main._fmt_compact(12500000) == "12.5M"
    assert main._fmt_compact(85000) == "85K"
    assert main._fmt_compact(None) == "—"


def test_tour_book_embeds_entrance_sting_when_present():
    p = _payload()
    p["cities"][0]["sting_url"] = "https://x/sting.wav"
    p["cities"][0]["delight"] = {"local_phrases": [], "crowd_moment_suggestions": [], "music_or_remix_ideas": ["a sting"]}
    html = main._render_tour_book(p)
    assert '<audio controls preload="none" src="https://x/sting.wav">' in html


def test_tour_book_embeds_phrase_pronunciation_audio_when_present():
    """Each local phrase with a synthesized pronunciation clip gets its own
    inline player -- same artifact-parity rule as the entrance sting."""
    p = _payload()
    p["cities"][0]["delight"] = {
        "local_phrases": [
            {"phrase": "Namaste Mumbai!", "phonetic": "nuh-mas-tay", "meaning": "Hello, Mumbai!",
             "audio_url": "https://x/namaste.wav"},
            {"phrase": "Kya haal hai?", "meaning": "How are you?"},
        ],
        "crowd_moment_suggestions": [],
        "music_or_remix_ideas": [],
    }
    html = main._render_tour_book(p)
    assert 'preload="none" src="https://x/namaste.wav">' in html
    # the phrase without audio renders fine and gains no player
    assert html.count("<audio") == 1


def test_itinerary_venue_cell_prefers_extracted_venue_name_over_url():
    p = _payload()
    p["cities"][0]["venue_url"] = "https://grokipedia.com/page/whatever"
    p["cities"][0]["venue"] = {"venue_name": "The O2 Arena", "capacity": "20,000"}
    html = main._render_tour_book(p)
    assert '<a href="https://grokipedia.com/page/whatever">The O2 Arena</a>' in html


def test_chapter_logistics_section_leads_with_the_venue_name():
    p = _payload()
    p["cities"][0]["venue"] = {"venue_name": "Shanmukhananda Hall", "capacity": "3,000 seats"}
    html = main._render_tour_book(p)
    assert "<b>Venue:</b> Shanmukhananda Hall" in html
