"""Enterprise Agent Platform SDK tool: city ranking.

Callable by the Campaign Orchestrator playbook as `sdk_city_ranking`.
Backs the Compare Cities dashboard screen — ranks a campaign's cities by
strategic value (importance tier first, enthusiasm score as tiebreak).
"""

from __future__ import annotations

_TIER_ORDER = {"Tier 1": 0, "Tier 2": 1, "Tier 3": 2}


def rank_cities(city_records: list[dict]) -> list[dict]:
    ranked = sorted(
        city_records,
        key=lambda c: (
            _TIER_ORDER.get(c.get("city_importance_tier"), 3),
            -c.get("enthusiasm_score", 0),
        ),
    )
    for i, record in enumerate(ranked, start=1):
        record["strategic_rank"] = i
    return ranked
