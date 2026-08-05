from enthusiasm_scoring import blend_enthusiasm_score, derive_importance_tier, score_fan_enthusiasm


def test_blend_without_live_signal_returns_base_score_rounded():
    assert blend_enthusiasm_score(87.34) == 87.3


def test_blend_with_live_signal_is_weighted_average():
    # default weight 0.3: (1-0.3)*80 + 0.3*100 = 86.0
    assert blend_enthusiasm_score(80.0, live_signal_score=100.0) == 86.0


def test_blend_respects_custom_weight():
    # weight 0.5: (1-0.5)*80 + 0.5*40 = 60.0
    assert blend_enthusiasm_score(80.0, live_signal_score=40.0, live_signal_weight=0.5) == 60.0


def test_blend_clamps_to_0_100_range():
    assert blend_enthusiasm_score(95.0, live_signal_score=200.0, live_signal_weight=0.9) == 100.0
    assert blend_enthusiasm_score(5.0, live_signal_score=-50.0, live_signal_weight=0.9) == 0.0


def test_derive_importance_tier_boundaries():
    assert derive_importance_tier(85) == "Tier 1"
    assert derive_importance_tier(84.9) == "Tier 2"
    assert derive_importance_tier(70) == "Tier 2"
    assert derive_importance_tier(69.9) == "Tier 3"
    assert derive_importance_tier(0) == "Tier 3"


def test_score_fan_enthusiasm_prefers_base_signal_tier_when_present():
    base_signal = {
        "enthusiasm_score": 60,
        "city_importance_tier": "Tier 1",
        "fan_behavior_style": "loud and expressive",
        "genre_affinity_notes": "strong pop following",
        "signal_basis": "historical attendance data",
    }
    result = score_fan_enthusiasm(base_signal)
    # 60 would derive Tier 3 on its own, but the curated base_signal's tier wins.
    assert result["city_importance_tier"] == "Tier 1"
    assert result["enthusiasm_score"] == 60.0
    assert result["used_live_signal"] is False


def test_score_fan_enthusiasm_derives_tier_when_base_signal_omits_it():
    base_signal = {"enthusiasm_score": 90, "fan_behavior_style": "energetic", "genre_affinity_notes": None, "signal_basis": None}
    result = score_fan_enthusiasm(base_signal)
    assert result["city_importance_tier"] == "Tier 1"


def test_score_fan_enthusiasm_flags_used_live_signal():
    base_signal = {"enthusiasm_score": 70, "fan_behavior_style": None, "genre_affinity_notes": None, "signal_basis": None}
    result = score_fan_enthusiasm(base_signal, live_signal_score=90)
    assert result["used_live_signal"] is True
    assert result["enthusiasm_score"] != 70.0
