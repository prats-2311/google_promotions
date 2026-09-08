"""Server-backed assistant chat history: GET/POST /chat_session persists a
conversation's transcript + context per session_key so it survives across
devices (localStorage stays the fast first tier client-side). Insert-only
latest-wins rows, same streaming-buffer-safe pattern as campaigns."""

from unittest.mock import MagicMock

import tour_data_api_main as main


def _mock_query_result(mock_bq, rows):
    mock_bq.query.return_value.result.return_value = rows


def test_get_requires_session_key(client):
    res = client.get("/chat_session")
    assert res.status_code == 400


def test_get_returns_empty_session_when_none_saved(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/chat_session?session_key=edit:c1")
    assert res.status_code == 200
    body = res.get_json()
    assert body == {"session_key": "edit:c1", "messages": [], "context": None, "updated_at": None}


def test_get_returns_latest_saved_session(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "session_key": "edit:c1",
        "messages_json": '[{"role": "user", "content": "hi"}]',
        "context_json": '{"pending": true}',
        "updated_at": main.datetime.datetime(2026, 9, 9, tzinfo=main.datetime.timezone.utc),
    }])
    res = client.get("/chat_session?session_key=edit:c1")
    assert res.status_code == 200
    body = res.get_json()
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert body["context"] == {"pending": True}
    assert body["updated_at"] == "2026-09-09T00:00:00+00:00"


def test_get_tolerates_malformed_stored_json(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "session_key": "edit:c1",
        "messages_json": "not json{",
        "context_json": None,
        "updated_at": None,
    }])
    res = client.get("/chat_session?session_key=edit:c1")
    assert res.status_code == 200
    assert res.get_json()["messages"] == []


def test_post_requires_fields(client):
    assert client.post("/chat_session", json={"messages": []}).status_code == 400
    assert client.post("/chat_session", json={"session_key": "edit:c1"}).status_code == 400


def test_post_inserts_latest_wins_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/chat_session", json={
        "session_key": "edit:c1",
        "messages": [{"role": "user", "content": "rename it"}],
        "context": {"pending_changes": None},
    })
    assert res.status_code == 200
    args, _ = mock_bq.insert_rows_json.call_args
    row = args[1][0]
    assert row["session_key"] == "edit:c1"
    assert '"rename it"' in row["messages_json"]
    assert row["updated_at"]  # a fresh revision timestamp


def test_post_insert_failure_returns_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"errors": ["boom"]}]
    res = client.post("/chat_session", json={"session_key": "edit:c1", "messages": []})
    assert res.status_code == 500
