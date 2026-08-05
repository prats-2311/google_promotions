"""Tests for the driver's response-parsing helpers — these are the pure
functions that pick real data (tool calls, playbook outputs) out of a
detectIntent response's actionTracingInfo."""

from run_campaign import _actions, _tool_output, _playbook_output, _passing_draft_brief, _extract_json_object


def _resp(actions):
    return {"queryResult": {"generativeInfo": {"actionTracingInfo": {"actions": actions}}}}


def test_actions_extracts_the_actions_list():
    resp = _resp([{"toolUse": {"action": "getCultureNotes"}}])
    assert _actions(resp) == [{"toolUse": {"action": "getCultureNotes"}}]


def test_actions_handles_missing_tracing_info_gracefully():
    assert _actions({"queryResult": {}}) == []
    assert _actions({}) == []


def test_tool_output_finds_the_named_tool_call():
    actions = [
        {"toolUse": {"action": "getCampaign", "outputActionParameters": {"200": {"genre": "pop"}}}},
        {"toolUse": {"action": "getCultureNotes", "outputActionParameters": {"200": {"etiquette_notes": "x"}}}},
    ]
    assert _tool_output(actions, "getCultureNotes") == {"etiquette_notes": "x"}


def test_tool_output_returns_none_when_action_not_present():
    assert _tool_output([{"toolUse": {"action": "getCampaign"}}], "getCultureNotes") is None


def test_tool_output_is_agnostic_about_error_vs_success_shape():
    """_tool_output's job is only to extract whatever's there — it does NOT
    decide whether a result represents success or failure. That decision is
    the caller's responsibility (see run_city's `if cn and "error" not in cn`
    check) — a caller that skips this check would wrongly treat an error
    response as valid gathered data, which is a real bug this project has
    already hit once."""
    actions = [{"toolUse": {"action": "getCultureNotes", "outputActionParameters": {"error": "no record"}}}]
    result = _tool_output(actions, "getCultureNotes")
    assert result == {"error": "no record"}
    assert "error" in result  # the caller must check this


def test_playbook_output_only_returns_ok_state_results():
    actions = [
        {"playbookInvocation": {"displayName": "Fan Enthusiasm Agent", "playbookState": "OUTPUT_STATE_FAILED", "playbookOutput": {"actionParameters": {"x": 1}}}},
    ]
    assert _playbook_output(actions, "Fan Enthusiasm Agent") is None


def test_playbook_output_returns_ok_results():
    actions = [
        {"playbookInvocation": {"displayName": "Fan Enthusiasm Agent", "playbookState": "OUTPUT_STATE_OK", "playbookOutput": {"actionParameters": {"enthusiasm_score": 90}}}},
    ]
    assert _playbook_output(actions, "Fan Enthusiasm Agent") == {"enthusiasm_score": 90}


def test_passing_draft_brief_returns_the_brief_that_passed():
    actions = [
        {"toolUse": {"action": "checkGrounding", "inputActionParameters": {"requestBody": {"draft_brief_text": "{\"a\": 1}"}}, "outputActionParameters": {"200": {"grounding_check_passed": True}}}},
    ]
    assert _passing_draft_brief(actions) == '{"a": 1}'


def test_passing_draft_brief_returns_none_when_check_failed():
    actions = [
        {"toolUse": {"action": "checkGrounding", "inputActionParameters": {"requestBody": {"draft_brief_text": "{}"}}, "outputActionParameters": {"200": {"grounding_check_passed": False}}}},
    ]
    assert _passing_draft_brief(actions) is None


def test_extract_json_object_pulls_object_out_of_surrounding_prose():
    text = 'Sure, here you go:\n{"topics_to_avoid": ["x"]}\nLet me know if you need more.'
    assert _extract_json_object(text) == {"topics_to_avoid": ["x"]}


def test_extract_json_object_returns_none_for_no_braces():
    assert _extract_json_object("no json here") is None


def test_extract_json_object_returns_none_for_malformed_json():
    assert _extract_json_object("{not valid json,,,}") is None
