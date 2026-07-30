"""Enterprise Agent Platform SDK tool: enthusiasm scoring.

Callable by the Fan Enthusiasm Agent playbook as `sdk_enthusiasm_scoring`.
Blends the curated base signal from tour_intelligence.fan_signals with an
optional live signal (the stretch-goal single-city live data pull), and
derives a fallback importance tier when the Data Store record omits one.
"""

from __future__ import annotations


def blend_enthusiasm_score(
    base_score: float,
    live_signal_score: float | None = None,
    live_signal_weight: float = 0.3,
) -> float:
    if live_signal_score is None:
        return round(base_score, 1)
    blended = (1 - live_signal_weight) * base_score + live_signal_weight * live_signal_score
    return round(max(0.0, min(100.0, blended)), 1)


def derive_importance_tier(score: float) -> str:
    if score >= 85:
        return "Tier 1"
    if score >= 70:
        return "Tier 2"
    return "Tier 3"


def score_fan_enthusiasm(
    base_signal: dict,
    live_signal_score: float | None = None,
    live_signal_weight: float = 0.3,
) -> dict:
    final_score = blend_enthusiasm_score(
        base_signal["enthusiasm_score"], live_signal_score, live_signal_weight
    )
    return {
        "enthusiasm_score": final_score,
        "city_importance_tier": base_signal.get("city_importance_tier")
        or derive_importance_tier(final_score),
        "fan_behavior_style": base_signal.get("fan_behavior_style"),
        "genre_affinity_notes": base_signal.get("genre_affinity_notes"),
        "confidence_caveat": base_signal.get("signal_basis"),
        "used_live_signal": live_signal_score is not None,
    }
