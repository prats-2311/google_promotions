from run_campaign import _brief_sections, _known_context, _all_gathered, _next_step_prompt


def test_brief_sections_reads_canonical_key_names():
    result = _brief_sections('{"topics_to_lean_into": ["a"], "topics_to_avoid": ["b"], "high_probability_fan_questions": ["c"]}')
    assert result == {"lean_into": ["a"], "avoid": ["b"], "fan_questions": ["c"]}


def test_brief_sections_falls_back_to_shorter_key_names():
    result = _brief_sections('{"lean_into": ["a"], "avoid": ["b"], "fan_questions": ["c"]}')
    assert result == {"lean_into": ["a"], "avoid": ["b"], "fan_questions": ["c"]}


def test_brief_sections_handles_malformed_json_without_raising():
    result = _brief_sections("not json")
    assert result == {"lean_into": [], "avoid": [], "fan_questions": []}


def test_known_context_includes_culture_summary_when_present():
    ctx = _known_context({"culture_summary": "be polite"})
    assert "culture_summary: be polite" in ctx


def test_known_context_falls_back_to_raw_culture_notes():
    ctx = _known_context({"culture_notes": {"etiquette_notes": "x"}})
    assert "culture_notes (raw)" in ctx


def test_known_context_includes_enthusiasm_fields_together():
    ctx = _known_context({"enthusiasm_score": 90, "city_importance_tier": "Tier 1", "fan_behavior_style": "loud"})
    assert "enthusiasm_score: 90" in ctx
    assert "Tier 1" in ctx


def test_known_context_empty_when_nothing_collected():
    assert _known_context({}) == ""


def test_all_gathered_requires_all_three_pieces():
    assert not _all_gathered({})
    assert not _all_gathered({"culture_summary": "x"})
    assert not _all_gathered({"culture_summary": "x", "enthusiasm_score": 90})
    assert _all_gathered({"culture_summary": "x", "enthusiasm_score": 90, "local_delight": {"a": 1}})


def test_all_gathered_accepts_raw_culture_notes_as_alternative_to_summary():
    assert _all_gathered({"culture_notes": {"x": 1}, "enthusiasm_score": 90, "local_delight": {"a": 1}})


def test_next_step_prompt_asks_for_culture_first_when_nothing_gathered():
    prompt = _next_step_prompt("Mumbai", {})
    assert "Culture Intelligence Agent" in prompt


def test_next_step_prompt_asks_for_fan_enthusiasm_after_culture_gathered():
    prompt = _next_step_prompt("Mumbai", {"culture_summary": "x"})
    assert "Fan Enthusiasm Agent" in prompt


def test_next_step_prompt_asks_for_local_delight_last():
    prompt = _next_step_prompt("Mumbai", {"culture_summary": "x", "enthusiasm_score": 90})
    assert "Local Delight Agent" in prompt


def test_next_step_prompt_embeds_known_values_not_just_a_reference():
    prompt = _next_step_prompt("Mumbai", {"culture_summary": "some real synthesized text"})
    assert "some real synthesized text" in prompt


def test_next_step_prompt_forces_action_when_stuck():
    prompt = _next_step_prompt("Mumbai", {}, stuck_on=True)
    assert "actually invoke" in prompt
