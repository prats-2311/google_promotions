def test_score_enthusiasm_requires_base_signal(client):
    res = client.post("/score_enthusiasm", json={})
    assert res.status_code == 400


def test_score_enthusiasm_returns_blended_score(client):
    res = client.post("/score_enthusiasm", json={
        "base_signal": {"enthusiasm_score": 80, "city_importance_tier": "Tier 1"},
        "live_signal_score": 100,
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["used_live_signal"] is True


def test_rank_cities_requires_city_records(client):
    res = client.post("/rank_cities", json={})
    assert res.status_code == 400


def test_rank_cities_returns_ranked_list(client):
    res = client.post("/rank_cities", json={
        "city_records": [
            {"city_id": "a", "city_importance_tier": "Tier 2", "enthusiasm_score": 50},
            {"city_id": "b", "city_importance_tier": "Tier 1", "enthusiasm_score": 50},
        ],
    })
    ranked = res.get_json()["ranked"]
    assert ranked[0]["city_id"] == "b"


def test_check_grounding_requires_draft_and_donts(client):
    res = client.post("/check_grounding", json={"draft_brief_text": "{}"})
    assert res.status_code == 400


def test_check_grounding_passes_through_to_sdk_logic(client):
    res = client.post("/check_grounding", json={
        "draft_brief_text": '{"topics_to_lean_into": ["safe content"]}',
        "donts": ["Avoid politics"],
    })
    assert res.status_code == 200
    assert res.get_json()["grounding_check_passed"] is True
