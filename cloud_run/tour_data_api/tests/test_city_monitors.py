"""Continuous grounding via Parallel's real Monitor API: /city_monitors
(idempotent create-or-fetch), /trigger_city_monitor (force an immediate
check), /city_monitor_events (read back whatever drift Parallel has found
so far). Verified live against the real API before writing this: create ->
trigger -> events resolves in ~60-90s with real cited results."""

from unittest.mock import MagicMock

import parallel

import tour_data_api_main as main


def test_create_requires_fields(client):
    res = client.post("/city_monitors", json={"campaign_id": "c1"})
    assert res.status_code == 400


def test_create_returns_existing_monitor_without_calling_parallel(client, mock_bq, mock_parallel_client):
    mock_row = MagicMock()
    mock_row.__getitem__.side_effect = lambda k: {"monitor_id": "monitor_existing123"}[k]
    mock_bq.query.return_value.result.return_value = [mock_row]

    res = client.post("/city_monitors", json={"campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai"})

    assert res.status_code == 200
    body = res.get_json()
    assert body == {"monitor_id": "monitor_existing123", "created": False}
    mock_parallel_client.monitor.create.assert_not_called()


def test_create_calls_parallel_and_inserts_when_none_exists(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    created = MagicMock()
    created.monitor_id = "monitor_new456"
    mock_parallel_client.monitor.create.return_value = created

    res = client.post("/city_monitors", json={"campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai"})

    assert res.status_code == 200
    body = res.get_json()
    assert body == {"monitor_id": "monitor_new456", "created": True}
    _, kwargs = mock_parallel_client.monitor.create.call_args
    assert kwargs["type"] == "event_stream"
    assert "Mumbai" in kwargs["settings"]["query"]
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["monitor_id"] == "monitor_new456"


def test_create_parallel_error_returns_502(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = []
    mock_parallel_client.monitor.create.side_effect = parallel.APIConnectionError(request=MagicMock())
    res = client.post("/city_monitors", json={"campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai"})
    assert res.status_code == 502


def test_create_missing_parallel_client_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_parallel_client", None)
    res = client.post("/city_monitors", json={"campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai"})
    assert res.status_code == 500


def test_trigger_requires_monitor_id(client):
    res = client.post("/trigger_city_monitor", json={})
    assert res.status_code == 400


def test_trigger_calls_parallel(client, mock_parallel_client):
    res = client.post("/trigger_city_monitor", json={"monitor_id": "monitor_123"})
    assert res.status_code == 200
    assert res.get_json()["status"] == "triggered"
    mock_parallel_client.monitor.trigger.assert_called_once_with("monitor_123")


def test_events_requires_monitor_id(client):
    res = client.get("/city_monitor_events")
    assert res.status_code == 400


def test_events_returns_parsed_events(client, mock_parallel_client):
    fake_event = MagicMock()
    fake_event.model_dump.return_value = {
        "event_date": "2026-09-06",
        "output": {
            "basis": [
                {
                    "reasoning": "Real cited finding about the city.",
                    "citations": [{"url": "https://example.com", "title": "Example", "excerpts": ["..."]}],
                }
            ]
        },
    }
    fake_result = MagicMock()
    fake_result.events = [fake_event]
    mock_parallel_client.monitor.events.return_value = fake_result

    res = client.get("/city_monitor_events?monitor_id=monitor_123")

    assert res.status_code == 200
    events = res.get_json()["events"]
    assert events == [{
        "event_date": "2026-09-06",
        "summary": "Real cited finding about the city.",
        "citations": [{"url": "https://example.com", "title": "Example"}],
    }]


def test_events_returns_empty_list_when_none_found_yet(client, mock_parallel_client):
    fake_result = MagicMock()
    fake_result.events = []
    mock_parallel_client.monitor.events.return_value = fake_result
    res = client.get("/city_monitor_events?monitor_id=monitor_123")
    assert res.status_code == 200
    assert res.get_json()["events"] == []


def test_create_defaults_to_cultural_monitor_type(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    created = MagicMock()
    created.monitor_id = "monitor_cultural1"
    mock_parallel_client.monitor.create.return_value = created

    res = client.post("/city_monitors", json={"campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai"})

    assert res.status_code == 200
    _, kwargs = mock_parallel_client.monitor.create.call_args
    assert "cultural" in kwargs["settings"]["query"]
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["monitor_type"] == "cultural"


def test_create_safety_monitor_type_uses_a_different_query(client, mock_bq, mock_parallel_client):
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    created = MagicMock()
    created.monitor_id = "monitor_safety1"
    mock_parallel_client.monitor.create.return_value = created

    res = client.post("/city_monitors", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai", "monitor_type": "safety",
    })

    assert res.status_code == 200
    _, kwargs = mock_parallel_client.monitor.create.call_args
    assert "safety" in kwargs["settings"]["query"]
    inserted_row = mock_bq.insert_rows_json.call_args[0][1][0]
    assert inserted_row["monitor_type"] == "safety"


def test_create_rejects_invalid_monitor_type(client):
    res = client.post("/city_monitors", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai", "monitor_type": "bogus",
    })
    assert res.status_code == 400


def test_create_existing_lookup_is_scoped_by_monitor_type(client, mock_bq, mock_parallel_client):
    """A cultural monitor already existing for this campaign+city must not
    leak into a safety-monitor lookup -- they're independent monitors, so
    the existence check has to filter on monitor_type too."""
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    created = MagicMock()
    created.monitor_id = "monitor_safety2"
    mock_parallel_client.monitor.create.return_value = created

    res = client.post("/city_monitors", json={
        "campaign_id": "c1", "city_id": "mumbai", "city_name": "Mumbai", "monitor_type": "safety",
    })

    assert res.status_code == 200
    assert res.get_json()["created"] is True
    sql_arg = mock_bq.query.call_args[0][0]
    assert "monitor_type" in sql_arg
    job_config = mock_bq.query.call_args.kwargs["job_config"]
    param_names = {p.name for p in job_config.query_parameters}
    assert "monitor_type" in param_names
