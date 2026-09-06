"""/stop_safety_checklist: a planner-filled day-of-show safety/capacity
checklist -- explicitly NOT AI-synthesized, no Parallel/Gemini call
anywhere in this file. Pure BigQuery persistence, same insert-only/latest-
by-generated_at shape as /stop_outcomes."""


def test_get_requires_params(client):
    res = client.get("/stop_safety_checklist?campaign_id=c1")
    assert res.status_code == 400


def test_get_returns_latest(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [{
        "campaign_id": "c1", "city_id": "mumbai", "generated_at": None,
        "showstop_manager_assigned": True, "showstop_manager_name": "Jamie Rivera",
        "capacity_confirmed": True,
    }]
    res = client.get("/stop_safety_checklist?campaign_id=c1&city_id=mumbai")
    assert res.status_code == 200
    body = res.get_json()
    assert body["showstop_manager_name"] == "Jamie Rivera"
    assert body["showstop_manager_assigned"] is True
    assert body["capacity_confirmed"] is True


def test_get_returns_null_when_none_exist(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.get("/stop_safety_checklist?campaign_id=c1&city_id=mumbai")
    assert res.status_code == 200
    body = res.get_json()
    assert body["showstop_manager_assigned"] is None
    assert body["showstop_manager_name"] is None
    assert body["capacity_confirmed"] is None


def test_post_inserts_row(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/stop_safety_checklist", json={
        "campaign_id": "c1", "city_id": "mumbai",
        "showstop_manager_assigned": True, "showstop_manager_name": "Jamie Rivera",
        "capacity_confirmed": False,
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "inserted"


def test_post_requires_fields(client):
    res = client.post("/stop_safety_checklist", json={"campaign_id": "c1"})
    assert res.status_code == 400
