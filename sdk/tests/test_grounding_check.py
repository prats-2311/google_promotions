"""Regression tests for sdk/grounding_check.py.

Two real bugs were found and fixed in this module during the project (see
project memory / bigquery-CLAUDE.md history): (1) topics_to_avoid was being
scanned against itself, flagging a brief's correct compliance as a violation,
and (2) plain substring matching + re-serialized JSON keys caused false
positives ("direct" inside "directness"; a key like
"high_probability_fan_questions" leaking the substring "questions"). These
tests exist specifically to make sure neither regresses.
"""

import json

from grounding_check import check_grounding


def test_topics_to_avoid_is_never_scanned_against_itself():
    donts = ["Avoid political commentary on Indian politics or religion"]
    draft = json.dumps({
        "topics_to_lean_into": ["High-energy stage presence", "A warm Hindi greeting"],
        "topics_to_avoid": ["political commentary on Indian politics or religion"],
    })
    result = check_grounding(draft, donts)
    assert result["grounding_check_passed"] is True
    assert result["flags"] == []


def test_word_boundary_prevents_substring_false_positive():
    donts = ["Avoid being too direct with fans"]
    draft = json.dumps({
        "topics_to_lean_into": ["Speaking with warmth and directness"],
    })
    result = check_grounding(draft, donts)
    assert result["grounding_check_passed"] is True, (
        "'direct' matching inside 'directness' via substring containment was the original bug"
    )


def test_field_key_name_does_not_leak_into_scanned_text():
    donts = ["Avoid answering personal financial questions"]
    draft = json.dumps({
        "high_probability_fan_questions": ["What's your favorite local food?", "Any tour secrets?"],
    })
    result = check_grounding(draft, donts)
    assert result["grounding_check_passed"] is True, (
        "the key name 'high_probability_fan_questions' contains 'questions' and must not leak into the scan"
    )


def test_real_violation_is_still_detected():
    # This is a keyword-overlap backstop, not a semantic/fuzzy matcher (no
    # stemming or plural/singular normalization) — a real violation needs to
    # share most of the don't's own exact word forms, by design (the LLM's
    # own semantic judgment is meant to catch paraphrased violations this
    # backstop can't).
    donts = ["Avoid mocking or joking about accents"]
    draft = json.dumps({
        "topics_to_lean_into": ["A bit of mocking and joking about accents for comic effect"],
    })
    result = check_grounding(draft, donts)
    assert result["grounding_check_passed"] is False
    assert len(result["flags"]) == 1
    assert result["flags"][0]["rule"] == "Avoid mocking or joking about accents"


def test_empty_donts_list_always_passes():
    result = check_grounding(json.dumps({"topics_to_lean_into": ["anything at all"]}), [])
    assert result["grounding_check_passed"] is True
    assert result["flags"] == []


def test_unfamiliar_shape_falls_back_to_scanning_all_non_excluded_fields():
    donts = ["Avoid discussing rival artists"]
    draft = json.dumps({"some_unexpected_key": "Openly discussing rival artists on stage"})
    result = check_grounding(draft, donts)
    assert result["grounding_check_passed"] is False


def test_non_json_text_is_scanned_as_raw_string():
    donts = ["Avoid discussing rival artists"]
    result = check_grounding("Openly discussing rival artists on stage", donts)
    assert result["grounding_check_passed"] is False


def test_humor_boundaries_param_is_accepted_but_not_required_to_affect_result():
    result = check_grounding(json.dumps({"topics_to_lean_into": ["safe content"]}), [], humor_boundaries="dry wit only")
    assert result["grounding_check_passed"] is True
