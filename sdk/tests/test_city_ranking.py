from city_ranking import rank_cities


def test_ranks_by_tier_first():
    records = [
        {"city_id": "a", "city_importance_tier": "Tier 3", "enthusiasm_score": 99},
        {"city_id": "b", "city_importance_tier": "Tier 1", "enthusiasm_score": 1},
    ]
    ranked = rank_cities(records)
    assert [r["city_id"] for r in ranked] == ["b", "a"]


def test_uses_enthusiasm_score_as_tiebreak_within_a_tier():
    records = [
        {"city_id": "low", "city_importance_tier": "Tier 1", "enthusiasm_score": 70},
        {"city_id": "high", "city_importance_tier": "Tier 1", "enthusiasm_score": 95},
    ]
    ranked = rank_cities(records)
    assert [r["city_id"] for r in ranked] == ["high", "low"]


def test_unknown_or_missing_tier_sorts_last():
    records = [
        {"city_id": "unknown_tier", "city_importance_tier": "Something Else", "enthusiasm_score": 100},
        {"city_id": "tier3", "city_importance_tier": "Tier 3", "enthusiasm_score": 1},
    ]
    ranked = rank_cities(records)
    assert ranked[0]["city_id"] == "tier3"
    assert ranked[1]["city_id"] == "unknown_tier"


def test_assigns_sequential_strategic_rank_starting_at_1():
    records = [
        {"city_id": "a", "city_importance_tier": "Tier 2", "enthusiasm_score": 50},
        {"city_id": "b", "city_importance_tier": "Tier 1", "enthusiasm_score": 50},
        {"city_id": "c", "city_importance_tier": "Tier 3", "enthusiasm_score": 50},
    ]
    ranked = rank_cities(records)
    assert [r["strategic_rank"] for r in ranked] == [1, 2, 3]


def test_missing_enthusiasm_score_defaults_to_zero_not_an_error():
    records = [{"city_id": "a", "city_importance_tier": "Tier 1"}]
    ranked = rank_cities(records)
    assert ranked[0]["strategic_rank"] == 1
