"""_detect_intent retries a transient 429/503 from the Playbooks API before
giving up -- a real, observed failure mode under load, distinct from the
per-turn execution-budget limitation documented in run_campaign.py's module
docstring (that one needs a session reset, not a retry)."""

from unittest.mock import MagicMock, patch

import run_campaign


def _fake_response(ok=True, status_code=200, json_body=None, text=""):
    resp = MagicMock()
    resp.ok = ok
    resp.status_code = status_code
    resp.text = text
    resp.json.return_value = json_body or {}
    if not ok:
        resp.raise_for_status.side_effect = run_campaign.requests.HTTPError(text, response=resp)
    return resp


def test_success_on_first_try_makes_exactly_one_call():
    good = _fake_response(ok=True, json_body={"queryResult": {}})
    with patch.object(run_campaign.requests, "post", return_value=good) as mock_post:
        with patch.object(run_campaign.time, "sleep") as mock_sleep:
            result = run_campaign._detect_intent("session-1", "hello", "fake-token")

    assert result == {"queryResult": {}}
    assert mock_post.call_count == 1
    mock_sleep.assert_not_called()


def test_transient_503_retries_and_succeeds():
    overloaded = _fake_response(ok=False, status_code=503, text="overloaded")
    good = _fake_response(ok=True, json_body={"queryResult": {"ok": True}})
    with patch.object(run_campaign.requests, "post", side_effect=[overloaded, good]) as mock_post:
        with patch.object(run_campaign.time, "sleep") as mock_sleep:
            result = run_campaign._detect_intent("session-1", "hello", "fake-token")

    assert result == {"queryResult": {"ok": True}}
    assert mock_post.call_count == 2
    mock_sleep.assert_called_once()


def test_non_retryable_error_raises_immediately():
    bad = _fake_response(ok=False, status_code=400, text="bad request")
    with patch.object(run_campaign.requests, "post", return_value=bad) as mock_post:
        with patch.object(run_campaign.time, "sleep") as mock_sleep:
            try:
                run_campaign._detect_intent("session-1", "hello", "fake-token")
                assert False, "expected HTTPError"
            except run_campaign.requests.HTTPError:
                pass

    assert mock_post.call_count == 1
    mock_sleep.assert_not_called()


def test_exhausting_all_retries_raises_the_last_error():
    overloaded = _fake_response(ok=False, status_code=503, text="still overloaded")
    with patch.object(run_campaign.requests, "post", return_value=overloaded) as mock_post:
        with patch.object(run_campaign.time, "sleep"):
            try:
                run_campaign._detect_intent("session-1", "hello", "fake-token")
                assert False, "expected HTTPError"
            except run_campaign.requests.HTTPError:
                pass

    assert mock_post.call_count == run_campaign._DETECT_INTENT_MAX_ATTEMPTS
