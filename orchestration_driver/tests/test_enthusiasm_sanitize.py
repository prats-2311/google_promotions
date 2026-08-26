"""The Fan Enthusiasm Agent playbook's own instructions say to "return a
low-confidence default" when no curated fan_signals row exists, but never
pin down what that default IS on the real 0-100 scale -- observed live in
production: the model returned 0.2 for an unseeded genre/city combo, clearly
a 0-1-scale guess. _sanitize_enthusiasm_score is the deterministic code-side
clamp that replaces implausible values rather than trusting the model's
numeric judgment.
"""

import run_campaign


def test_normal_score_passes_through_unchanged():
    assert run_campaign._sanitize_enthusiasm_score(72) == 72.0


def test_normal_float_score_passes_through_rounded():
    assert run_campaign._sanitize_enthusiasm_score(91.27) == 91.3


def test_score_of_zero_replaced_with_default():
    assert run_campaign._sanitize_enthusiasm_score(0) == run_campaign._LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE


def test_tiny_decimal_score_replaced_with_default():
    """The real observed bug -- a 0-1-scale guess like 0.2 instead of 0-100."""
    assert run_campaign._sanitize_enthusiasm_score(0.2) == run_campaign._LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE


def test_score_above_100_replaced_with_default():
    assert run_campaign._sanitize_enthusiasm_score(150) == run_campaign._LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE


def test_none_score_replaced_with_default():
    assert run_campaign._sanitize_enthusiasm_score(None) == run_campaign._LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE


def test_non_numeric_score_replaced_with_default():
    assert run_campaign._sanitize_enthusiasm_score("not a number") == run_campaign._LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE


def test_score_of_exactly_one_is_the_plausibility_floor():
    assert run_campaign._sanitize_enthusiasm_score(1.0) == 1.0
