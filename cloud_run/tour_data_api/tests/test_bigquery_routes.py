"""Every route here does a parameterized BigQuery query — these tests mock
main._bq.query(...).result() (plain dicts support the same r["field"] access
BigQuery Row objects do) and assert on the parameterization + response shape,
not on real BigQuery behavior.
"""

import datetime

import tour_data_api_main as main


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


# ---- /city_demographics ----

def test_city_demographics_requires_city_id(client):
    res = client.get("/city_demographics")
    assert res.status_code == 400


def test_city_demographics_404_when_no_row(client, mock_bq):
    _mock_query_result(mock_bq, [])
    res = client.get("/city_demographics?city_id=atlantis")
    assert res.status_code == 404


def test_city_demographics_returns_row_shape(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "literacy_rate": 89.2, "median_age": 28.4, "population": 20400000,
        "median_household_income_usd": 9800.0, "internet_penetration_rate": 62.0,
        "dominant_social_platforms": ["Instagram"], "top_interest_categories": ["cricket"],
        "notable_public_holidays": ["Diwali"],
    }])
    res = client.get("/city_demographics?city_id=mumbai")
    assert res.status_code == 200
    body = res.get_json()
    assert body["city_id"] == "mumbai"
    assert body["literacy_rate"] == 89.2
    assert body["top_interest_categories"] == ["cricket"]


def test_city_demographics_query_is_parameterized_not_string_formatted(client, mock_bq):
    _mock_query_result(mock_bq, [])
    client.get("/city_demographics?city_id=mumbai'; DROP TABLE city_demographics; --")
    sql_arg = mock_bq.query.call_args[0][0]
    assert "DROP TABLE" not in sql_arg
    assert "@city_id" in sql_arg


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
        "genre": "pop", "talent_roster": ["Artist X"], "status": "active", "selected_metrics": ["literacy_rate"],
    }])
    res = client.get("/campaigns?campaign_id=nova_horizon_2026")
    body = res.get_json()
    assert body["title"] == "Nova Horizon"
    assert body["selected_metrics"] == ["literacy_rate"]


# ---- /campaigns_list ----

def test_campaigns_list_returns_all_rows(client, mock_bq):
    _mock_query_result(mock_bq, [
        {"campaign_id": "nova_horizon_2026", "title": "Nova Horizon", "campaign_type": "film_promo_tour",
         "genre": "sci-fi action", "talent_roster": ["lead actor"], "status": "active", "selected_metrics": []},
        {"campaign_id": "second_2026", "title": "Second Campaign", "campaign_type": "music_world_tour",
         "genre": "pop", "talent_roster": [], "status": "active", "selected_metrics": ["population"]},
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
    assert inserted_row["selected_metrics"] == []


def test_campaigns_post_stores_selected_metrics(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/campaigns", json={
        "campaign_id": "c1", "title": "New Tour", "campaign_type": "film_promo_tour", "genre": "drama",
        "selected_metrics": ["literacy_rate", "top_interest_categories"],
    })
    assert res.status_code == 200
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["selected_metrics"] == ["literacy_rate", "top_interest_categories"]


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
        "sequence_order": 1, "event_format": "arena", "venue_url": None,
    }])
    res = client.get("/campaign_stops?campaign_id=nova_horizon_2026")
    stop = res.get_json()["stops"][0]
    assert stop["stop_date"] == "2026-09-01"


def test_campaign_stops_handles_null_stop_date(client, mock_bq):
    _mock_query_result(mock_bq, [{
        "city_id": "mumbai", "city_name": "Mumbai", "stop_date": None,
        "sequence_order": 1, "event_format": None, "venue_url": None,
    }])
    res = client.get("/campaign_stops?campaign_id=nova_horizon_2026")
    assert res.get_json()["stops"][0]["stop_date"] is None


# ---- /campaign_stops (POST) ----

def test_campaign_stops_post_requires_campaign_id_and_stops(client):
    res = client.post("/campaign_stops", json={"campaign_id": "c1"})
    assert res.status_code == 400
    res = client.post("/campaign_stops", json={"stops": [{"city_id": "mumbai"}]})
    assert res.status_code == 400


def _mock_known_city_ids(mock_bq, city_ids):
    _mock_query_result(mock_bq, [{"city_id": cid} for cid in city_ids])


def test_campaign_stops_post_rejects_unsupported_city(client, mock_bq):
    _mock_known_city_ids(mock_bq, ["mumbai", "london"])
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "atlantis", "stop_date": "2026-09-01", "sequence_order": 1}],
    })
    assert res.status_code == 400
    assert "atlantis" in res.get_json()["error"]


def test_campaign_stops_post_inserts_rows(client, mock_bq):
    _mock_known_city_ids(mock_bq, ["mumbai", "london"])
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
    _mock_known_city_ids(mock_bq, ["mumbai"])
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "mumbai", "stop_date": "2026-09-01", "sequence_order": 1}],
    })
    assert res.status_code == 500


def test_campaign_stops_post_defaults_sequence_order_when_omitted(client, mock_bq, monkeypatch):
    # The edit chat's add_stops only proposes city_id + stop_date, never a
    # sequence_order -- confirms a caller that omits it gets appended after
    # the campaign's current highest sequence_order, not a null that would
    # sort the new stop first at read time (QUALIFY ... ORDER BY sequence_order).
    _mock_known_city_ids(mock_bq, ["mumbai", "berlin"])
    mock_bq.insert_rows_json.return_value = []
    monkeypatch.setattr(
        main, "_get_current_stops",
        lambda campaign_id: [{"city_id": "mumbai", "sequence_order": 1}, {"city_id": "london", "sequence_order": 2}],
    )
    res = client.post("/campaign_stops", json={
        "campaign_id": "c1",
        "stops": [{"city_id": "berlin", "stop_date": "2026-11-10"}],
    })
    assert res.status_code == 200
    inserted_rows = mock_bq.insert_rows_json.call_args[0][1]
    assert inserted_rows[0]["sequence_order"] == 3


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
        "demographic_snapshot_json": '{"literacy_rate": 89.2}',
        "pronunciation_audio_json": '[{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]',
        "style_moodboard_url": "https://storage.googleapis.com/bucket/style-moodboards/abc.png",
        "venue_notes_json": '{"capacity": "12,000", "confidence": "medium"}',
    }])
    res = client.get("/city_briefs?campaign_id=c1")
    brief = res.get_json()["briefs"][0]
    assert brief["generated_at"] == "2026-07-28T12:00:00"
    assert brief["demographic_snapshot_json"] == '{"literacy_rate": 89.2}'
    assert brief["pronunciation_audio_json"] == '[{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]'
    assert brief["style_moodboard_url"] == "https://storage.googleapis.com/bucket/style-moodboards/abc.png"
    assert brief["venue_notes_json"] == '{"capacity": "12,000", "confidence": "medium"}'


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


def test_city_briefs_post_stores_demographic_snapshot(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
        "demographic_snapshot_json": '{"literacy_rate": 89.2}',
    })
    assert res.status_code == 200
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["demographic_snapshot_json"] == '{"literacy_rate": 89.2}'


def test_city_briefs_post_stores_pronunciation_audio(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
        "pronunciation_audio_json": '[{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]',
    })
    assert res.status_code == 200
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["pronunciation_audio_json"] == '[{"phrase": "Namaste!", "audio_url": "https://x/a.wav"}]'


def test_city_briefs_post_stores_style_moodboard_url(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
        "style_moodboard_url": "https://storage.googleapis.com/bucket/style-moodboards/abc.png",
    })
    assert res.status_code == 200
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["style_moodboard_url"] == "https://storage.googleapis.com/bucket/style-moodboards/abc.png"


def test_city_briefs_post_stores_venue_notes(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
        "venue_notes_json": '{"capacity": "12,000", "confidence": "medium"}',
    })
    assert res.status_code == 200
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["venue_notes_json"] == '{"capacity": "12,000", "confidence": "medium"}'


def test_city_briefs_post_surfaces_insert_errors_as_500(client, mock_bq):
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    res = client.post("/city_briefs", json={
        "brief_id": "b1", "campaign_id": "c1", "city_id": "mumbai", "status": "final",
    })
    assert res.status_code == 500
