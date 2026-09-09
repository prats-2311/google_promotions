"""_call_gemini_json's same-bar fallback: a transient failure on the primary
model retries, then falls back to a second model -- but both the primary and
fallback paths are forced through the identical post-decode validation gate
before a result is accepted. See cloud_run/tour_data_api/CLAUDE.md."""

from unittest.mock import MagicMock

import requests

import tour_data_api_main as main

_SCHEMA = {
    "type": "object",
    "properties": {"etiquette_notes": {"type": "string"}},
    "required": ["etiquette_notes"],
}


def _fake_response(status_code=200, text="ok", json_body=None):
    resp = MagicMock()
    resp.status_code = status_code
    if status_code >= 400:
        err = requests.HTTPError(text, response=resp)
        resp.raise_for_status.side_effect = err
    else:
        resp.raise_for_status.side_effect = None
    resp.json.return_value = json_body or {}
    return resp


def _gemini_payload(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_primary_model_success_first_try_never_touches_fallback(monkeypatch):
    good = _fake_response(200, json_body=_gemini_payload('{"etiquette_notes": "be polite"}'))
    mock_post = MagicMock(return_value=good)
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    result = main._call_gemini_json("prompt", _SCHEMA)

    assert result == {"etiquette_notes": "be polite"}
    assert mock_post.call_count == 1
    assert main._GEMINI_MODEL in mock_post.call_args[0][0]


def test_transient_503_falls_back_to_second_model_and_succeeds(monkeypatch):
    overloaded = _fake_response(503, text="model overloaded")
    good = _fake_response(200, json_body=_gemini_payload('{"etiquette_notes": "be polite"}'))
    mock_post = MagicMock(side_effect=[overloaded, overloaded, good])
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    result = main._call_gemini_json("prompt", _SCHEMA)

    assert result == {"etiquette_notes": "be polite"}
    urls_called = [c[0][0] for c in mock_post.call_args_list]
    assert main._GEMINI_MODEL in urls_called[0]
    assert main._GEMINI_FALLBACK_MODEL in urls_called[-1]


def test_non_retryable_400_raises_immediately_without_trying_fallback(monkeypatch):
    bad_request = _fake_response(400, text="invalid schema")
    mock_post = MagicMock(return_value=bad_request)
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    try:
        main._call_gemini_json("prompt", _SCHEMA)
        assert False, "expected HTTPError"
    except requests.HTTPError:
        pass
    assert mock_post.call_count == 1


def test_fallback_model_response_still_must_clear_the_same_validation_bar(monkeypatch):
    """A fallback model returning syntactically-valid JSON that's missing a
    required field must be rejected exactly like the primary model would be
    -- the fallback doesn't get a lower bar just because it's the backup."""
    overloaded = _fake_response(503, text="model overloaded")
    incomplete = _fake_response(200, json_body=_gemini_payload("{}"))
    mock_post = MagicMock(side_effect=[overloaded, overloaded, incomplete])
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    try:
        main._call_gemini_json("prompt", _SCHEMA)
        assert False, "expected ValueError for missing required field"
    except ValueError as e:
        assert "etiquette_notes" in str(e)


def test_all_attempts_exhausted_raises_last_error(monkeypatch):
    overloaded = _fake_response(503, text="model overloaded")
    mock_post = MagicMock(return_value=overloaded)
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    try:
        main._call_gemini_json("prompt", _SCHEMA)
        assert False, "expected HTTPError"
    except requests.HTTPError:
        pass
    assert mock_post.call_count == 3


def test_read_timeout_on_primary_skips_straight_to_fallback(monkeypatch):
    """A network read timeout means the primary model just burned its full
    timeout budget -- retrying the same model would double the latency for a
    caller already waiting. Go straight to the fallback instead. Live
    regression 2026-09-09: Vertex global-endpoint slowness turned every
    /discover_venues into an uncaught Timeout -> 500."""
    good = _fake_response(200, json_body=_gemini_payload('{"etiquette_notes": "be polite"}'))
    mock_post = MagicMock(side_effect=[requests.Timeout("read timed out"), good])
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    result = main._call_gemini_json("prompt", _SCHEMA)

    assert result == {"etiquette_notes": "be polite"}
    assert mock_post.call_count == 2  # no second primary attempt
    urls_called = [c[0][0] for c in mock_post.call_args_list]
    assert main._GEMINI_MODEL in urls_called[0]
    assert main._GEMINI_FALLBACK_MODEL in urls_called[1]


def test_timeout_on_both_models_raises_the_timeout(monkeypatch):
    mock_post = MagicMock(side_effect=requests.Timeout("read timed out"))
    monkeypatch.setattr(main.requests, "post", mock_post)
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)

    try:
        main._call_gemini_json("prompt", _SCHEMA)
        raised = False
    except requests.Timeout:
        raised = True

    assert raised
    assert mock_post.call_count == 2  # one attempt per model, no wasted retry
