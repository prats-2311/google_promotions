"""Every route here does a parameterized BigQuery query — these tests mock
main._bq.query(...).result() (plain dicts support the same r["field"] access
BigQuery Row objects do) and assert on the parameterization + response shape,
not on real BigQuery behavior.
"""

import datetime


def _mock_query_result(mock_bq, rows):
    mock_bq.query.return_value.result.return_value = rows


# ---- /culture_notes ----

def test_culture_notes_requires_city_id(client):
    res = client.get("/culture_notes")
    assert res.status_code == 400


def test_culture_notes_404_when_no_row(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/culture_notes?city_id=atlantis")
    assert res.status_code == 404


def test_culture_notes_returns_row_shape(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "etiquette_notes": "x", "greeting_style": "y",
        "media_behavior_notes": "z", "fan_interaction_style": "w",
        "dos": ["a"], "donts": ["b"], "humor_boundaries": "c",
    }])
    res = client.get("/culture_notes?city_id=mumbai")
    assert res.status_code == 200
    body = res.get_json()
    assert body["city_id"] == "mumbai"
    assert body["dos"] == ["a"]
    assert body["donts"] == ["b"]


def test_culture_notes_query_is_parameterized_not_string_formatted(client, mock_bq):
    _mock_query_result(mock_bq, [])
    client.get("/culture_notes?city_id=mumbai'; DROP TABLE culture_notes; --")
    sql_arg = mock_bq.query.call_args[0][0]
    assert "DROP TABLE" not in sql_arg
    assert "@city_id" in sql_arg


# ---- /fan_signals ----

def test_fan_signals_requires_all_three_params(client):
    res = client.get("/fan_signals?city_id=mumbai")
    assert res.status_code == 400


def test_fan_signals_404_when_no_match(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/fan_signals?city_id=mumbai&genre=pop&artist_type=musician")
    assert res.status_code == 404


def test_fan_signals_returns_row_shape(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "genre": "pop", "artist_type": "musician",
        "enthusiasm_score": 91.2, "fan_behavior_style": "loud", "city_importance_tier": "Tier 1",
        "genre_affinity_notes": "n", "signal_basis": "b",
    }])
    res = client.get("/fan_signals?city_id=mumbai&genre=pop&artist_type=musician")
    assert res.status_code == 200
    assert res.get_json()["enthusiasm_score"] == 91.2


# ---- /local_delight ----

def test_local_delight_requires_city_id(client):
    res = client.get("/local_delight")
    assert res.status_code == 400


def test_local_delight_404_when_no_row(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/local_delight?city_id=atlantis")
    assert res.status_code == 404


def test_local_delight_returns_nested_structs(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai",
        "local_phrases": [{"phrase": "Namaste", "phonetic": "nuh-mas-tay", "meaning": "hello", "usage_context": "opener"}],
        "cultural_references": ["Bollywood"],
        "beloved_icons": [{"name": "a veteran actor", "domain": "film", "reference_note": "note"}],
        "crowd_moment_suggestions": ["chant"],
        "music_or_remix_ideas": ["remix"],
    }])
    res = client.get("/local_delight?city_id=mumbai")
    body = res.get_json()
    assert body["local_phrases"][0]["phrase"] == "Namaste"
    assert body["beloved_icons"][0]["domain"] == "film"


# ---- /campaigns ----

def test_campaigns_requires_campaign_id(client):
    res = client.get("/campaigns")
    assert res.status_code == 400


def test_campaigns_404_when_no_row(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/campaigns?campaign_id=nope")
    assert res.status_code == 404


def test_campaigns_returns_row_shape(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "campaign_id": "nova_horizon_2026", "title": "Nova Horizon", "campaign_type": "music_world_tour",
        "genre": "pop", "talent_roster": ["Artist X"], "status": "active",
    }])
    res = client.get("/campaigns?campaign_id=nova_horizon_2026")
    assert res.get_json()["title"] == "Nova Horizon"


# ---- /campaigns_list ----

def test_campaigns_list_returns_all_rows(client, mock_bq):
    _mock_query_result(mock_bq, [
        {"campaign_id": "nova_horizon_2026", "title": "Nova Horizon", "campaign_type": "film_promo_tour",
         "genre": "sci-fi action", "talent_roster": ["lead actor"], "status": "active"},
        {"campaign_id": "second_2026", "title": "Second Campaign", "campaign_type": "music_world_tour",
         "genre": "pop", "talent_roster": [], "status": "active"},
    ])
    res = client.get("/campaigns_list")
    assert res.status_code == 200
    campaigns = res.get_json()["campaigns"]
    assert len(campaigns) == 2
    assert campaigns[0]["campaign_id"] == "nova_horizon_2026"


def test_campaigns_list_orders_by_created_at_desc(client, mock_bq):
    _mock_query_result(mock_bq, [])
    client.get("/campaigns_list")
    sql_arg = mock_bq.query.call_args[0][0]
    assert "ORDER BY created_at DESC" in sql_arg


# ---- /campaigns (POST) ----

def test_campaigns_post_requires_required_fields(client):
    res = client.post("/campaigns", json={"campaign_id": "c1"})
    assert res.status_code == 400


def test_campaigns_post_inserts_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/campaigns", json={
        "campaign_id": "c1", "title": "New Tour", "campaign_type": "film_promo_tour", "genre": "drama",
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "inserted"
    mock_bq.insert_rows_json.assert_called_once()
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["status"] == "active"
    assert inserted_row["talent_roster"] == []


def test_campaigns_post_surfaces_insert_errors_as_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    res = client.post("/campaigns", json={
        "campaign_id": "c1", "title": "New Tour", "campaign_type": "film_promo_tour", "genre": "drama",
    })
    assert res.status_code == 500


# ---- /campaign_stops ----

def test_campaign_stops_requires_campaign_id(client):
    res = client.get("/campaign_stops")
    assert res.status_code == 400


def test_campaign_stops_formats_stop_date_as_iso(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "city_name": "Mumbai", "stop_date": datetime.date(2026, 9, 1),
        "sequence_order": 1, "event_format": "arena",
    }])
    res = client.get("/campaign_stops?campaign_id=nova_horizon_2026")
    stop = res.get_json()["stops"][0]
    assert stop["stop_date"] == "2026-09-01"


def test_campaign_stops_handles_null_stop_date(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "city_name": "Mumbai", "stop_date": None,
        "sequence_order": 1, "event_format": None,
    }])
    res = client.get("/campaign_stops?campaign_id=nova_horizon_2026")
    assert res.get_json()["stops"][0]["stop_date"] is None


# ---- /campaign_stops (POST) ----

def test_campaign_stops_post_requires_campaign_id_and_stops(client):
    res = client.post("/campaign_stops", json={"campaign_id": "c1"})
    assert res.status_code == 400
    res = client.post("/campaign_stops", json={"stops": [{"city_id": "mumbai"}]})
    assert res.status_code == 400


def test_campaign_stops_post_rejects_unsupported_city(client):
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "atlantis", "stop_date": "2026-09-01", "sequence_order": 1}],
    })
    assert res.status_code == 400
    assert "atlantis" in res.get_json()["error"]


def test_campaign_stops_post_inserts_rows(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [
            {"city_id": "mumbai", "stop_date": "2026-09-01", "sequence_order": 1},
            {"city_id": "london", "stop_date": "2026-09-05", "sequence_order": 2},
        ],
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "inserted"
    assert body["count"] == 2
    inserted_rows = mock_bq.insert_rows_json.call_args[0][1]
    assert len(inserted_rows) == 2
    assert inserted_rows[0]["city_id"] == "mumbai"


def test_campaign_stops_post_surfaces_insert_errors_as_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "mumbai", "stop_date": "2026-09-01", "sequence_order": 1}],
    })
    assert res.status_code == 500


# ---- /city_briefs (GET) ----

def test_city_briefs_get_requires_campaign_id(client):
    res = client.get("/city_briefs")
    assert res.status_code == 400


def test_city_briefs_get_formats_generated_at_as_iso(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai",
        "generated_at": datetime.datetime(2026, 7, 28, 12, 0, 0), "status": "final",
        "enthusiasm_score": 90, "culture_summary": "s", "local_delight_summary": "d",
        "talent_brief_json": "{}", "grounding_check_passed": True,
        "grounding_check_notes": "ok", "delight_card_url": "https://x",
    }])
    res = client.get("/city_briefs?campaign_id=c1")
    brief = res.get_json()["briefs"][0]
    assert brief["generated_at"] == "2026-07-28T12:00:00"


def test_city_briefs_get_optional_city_id_adds_filter(client, mock_bq):
    _mock_query_result(mock_bq, [])
    client.get("/city_briefs?campaign_id=c1&city_id=mumbai")
    sql_arg = mock_bq.query.call_args[0][0]
    assert "@city_id" in sql_arg
    assert "QUALIFY ROW_NUMBER()" in sql_arg


# ---- /city_briefs (POST) ----

def test_city_briefs_post_requires_required_fields(client):
    res = client.post("/city_briefs", json={"brief_id": "b1"})
    assert res.status_code == 400


def test_city_briefs_post_inserts_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "inserted"
    mock_bq.insert_rows_json.assert_called_once()


def test_city_briefs_post_surfaces_insert_errors_as_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
    })
    assert res.status_code == 500
