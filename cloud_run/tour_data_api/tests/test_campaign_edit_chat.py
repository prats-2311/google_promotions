"""/campaign_edit_chat: the conversational assistant, but scoped to an
already-existing, ongoing campaign instead of drafting a new one. Injects
the campaign's real current state (title/genre/stops) as prompt context so
the model reasons about a delta ("add Berlin", "drop Tokyo") rather than
starting from scratch, and returns proposed_changes as a partial diff the
frontend applies via /update_campaign, /campaign_stops, and
/remove_campaign_stop -- this route itself never writes anything."""

from unittest.mock import MagicMock

import tour_data_api_main as main


def _campaign_row(**overrides):
    row = {
        "campaign_id": "c1",
        "title": "The Odyssey",
        "campaign_type": "film_promo_tour",
        "genre": "scifi",
        "talent_roster": ["Artist X"],
        "status": "active",
        "selected_metrics": [],
        "created_at": main.datetime.datetime(2026, 8, 1, tzinfo=main.datetime.timezone.utc),
        "updated_at": main.datetime.datetime(2026, 8, 1, tzinfo=main.datetime.timezone.utc),
    }
    row.update(overrides)
    return row


def test_requires_campaign_id_and_messages(client):
    res = client.post("/campaign_edit_chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 400
    res = client.post("/campaign_edit_chat", json={"campaign_id": "c1"})
    assert res.status_code == 400


def test_404s_when_campaign_does_not_exist(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.post("/campaign_edit_chat", json={
        "campaign_id": "nope", "messages": [{"role": "user", "content": "add Tokyo"}]
    })
    assert res.status_code == 404


def test_prompt_includes_current_campaign_state_and_stops(mock_parallel_client, mock_bq, monkeypatch):
    """Regression guard: without the current state, the model can't reason
    about a delta -- it would just redraft the whole campaign from scratch,
    same failure mode the creation chat had before it was told about cities."""
    campaign_rows = [_campaign_row()]
    stop_rows = [{
        "city_id": "tokyo", "city_name": "Tokyo", "stop_date": None,
        "sequence_order": 1, "event_format": None, "venue_url": None,
    }]

    def fake_query(sql, params):
        if "campaign_stops" in sql:
            return stop_rows
        if "campaigns" in sql:
            return campaign_rows
        return []
    monkeypatch.setattr(main, "_query", fake_query)

    captured = {}

    def fake_gemini(prompt, schema):
        captured["prompt"] = prompt
        return {"reply": "ok", "ready_to_apply": False, "proposed_changes": None, "detected_title": None}

    monkeypatch.setattr(main, "_call_gemini_json", fake_gemini)
    import tour_data_api_main as m
    m.app.test_client().post("/campaign_edit_chat", json={
        "campaign_id": "c1", "messages": [{"role": "user", "content": "add Berlin too"}]
    })
    assert "The Odyssey" in captured["prompt"]
    assert "tokyo" in captured["prompt"].lower()


def test_returns_proposed_changes_when_ready(client, mock_bq, monkeypatch):
    monkeypatch.setattr(main, "_get_latest_campaign", lambda campaign_id: _campaign_row())
    monkeypatch.setattr(main, "_get_current_stops", lambda campaign_id: [])
    monkeypatch.setattr(main, "_all_city_summaries", lambda: [])
    monkeypatch.setattr(main, "_call_gemini_json", lambda prompt, schema: {
        "reply": "Added Berlin for you.",
        "ready_to_apply": True,
        "detected_title": None,
        "proposed_changes": {
            "title": None, "genre": None, "campaign_type": None, "talent_roster": None,
            "add_stops": [{"city_id": "berlin", "stop_date": "2026-11-01"}],
            "remove_stop_city_ids": [],
        },
    })

    res = client.post("/campaign_edit_chat", json={
        "campaign_id": "c1", "messages": [{"role": "user", "content": "add Berlin on Nov 1 2026"}]
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body["ready_to_apply"] is True
    assert body["proposed_changes"]["add_stops"][0]["city_id"] == "berlin"


def test_gemini_failure_returns_502(client, mock_bq, monkeypatch):
    monkeypatch.setattr(main, "_get_latest_campaign", lambda campaign_id: _campaign_row())
    monkeypatch.setattr(main, "_get_current_stops", lambda campaign_id: [])
    monkeypatch.setattr(main, "_all_city_summaries", lambda: [])

    def _raise(*a, **k):
        raise ValueError("bad schema response")
    monkeypatch.setattr(main, "_call_gemini_json", _raise)

    res = client.post("/campaign_edit_chat", json={
        "campaign_id": "c1", "messages": [{"role": "user", "content": "add Berlin"}]
    })
    assert res.status_code == 502
