"""POST /campaign_strategy_chat -- a Gemini-backed pre-fill assistant for the
New Campaign form. Deliberately NOT a new Playbook/agent (CLAUDE.md locks the
MVP at 5 agents); this is a direct Gemini call reusing _call_gemini_json
exactly like the live-search routes, purely advisory: it never writes
anything itself, the user still reviews/submits through the existing,
unmodified POST /campaigns path.
"""

import tour_data_api_main as main


def test_requires_messages_field(client):
    res = client.post("/campaign_strategy_chat", json={})
    assert res.status_code == 400


def test_requires_non_empty_messages_list(client):
    res = client.post("/campaign_strategy_chat", json={"messages": []})
    assert res.status_code == 400


def test_returns_reply_and_not_ready_when_gemini_needs_more_info(client, monkeypatch):
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "reply": "What genre is this tour?", "ready": False, "suggested_campaign": None,
    })
    res = client.post("/campaign_strategy_chat", json={
        "messages": [{"role": "user", "content": "I want to plan a tour"}]
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["ready"] is False
    assert body["suggested_campaign"] is None
    assert "genre" in body["reply"].lower()


def test_returns_suggested_campaign_when_ready(client, monkeypatch):
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "reply": "Here's what I've got — ready to review!",
        "ready": True,
        "suggested_campaign": {
            "title": "Neon Skyline",
            "campaign_type": "music_world_tour",
            "genre": "synth-pop",
            "talent_roster": ["Artist X"],
            "stops": [{"city_id": "tokyo", "stop_date": "2026-10-01"}],
        },
    })
    res = client.post("/campaign_strategy_chat", json={
        "messages": [{"role": "user", "content": "synth-pop tour, one stop in Tokyo Oct 1"}]
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["ready"] is True
    assert body["suggested_campaign"]["title"] == "Neon Skyline"
    assert body["suggested_campaign"]["stops"][0]["city_id"] == "tokyo"


def test_passes_strategy_text_into_the_prompt(client, monkeypatch):
    captured = {}

    def fake_gemini(prompt, schema):
        captured["prompt"] = prompt
        return {"reply": "ok", "ready": False, "suggested_campaign": None}

    monkeypatch.setattr(main, "_call_gemini_json", fake_gemini)
    res = client.post("/campaign_strategy_chat", json={
        "messages": [{"role": "user", "content": "here's my strategy doc"}],
        "strategy_text": "Focus on Gen-Z audiences in Southeast Asia.",
    })
    assert res.status_code == 200
    assert "Gen-Z audiences in Southeast Asia" in captured["prompt"]


def test_gemini_failure_returns_502(client, monkeypatch):
    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)
    res = client.post("/campaign_strategy_chat", json={
        "messages": [{"role": "user", "content": "hello"}]
    })
    assert res.status_code == 502


def test_only_supported_city_ids_are_offered_to_the_model(mock_parallel_client, monkeypatch):
    """Regression guard: the prompt must constrain suggestions to cities the
    rest of the system actually supports (POST /campaign_stops rejects
    anything else) -- never let the model suggest an unsupported city."""
    captured = {}

    def fake_gemini(prompt, schema):
        captured["prompt"] = prompt
        return {"reply": "ok", "ready": False, "suggested_campaign": None}

    monkeypatch.setattr(main, "_call_gemini_json", fake_gemini)
    import tour_data_api_main as m
    m.app.test_client().post("/campaign_strategy_chat", json={
        "messages": [{"role": "user", "content": "hello"}]
    })
    for city_id in main._SUPPORTED_CITY_IDS:
        assert city_id in captured["prompt"]
