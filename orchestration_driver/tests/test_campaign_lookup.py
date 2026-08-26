"""The driver used to hardcode CAMPAIGN_TITLE = "Nova Horizon" and a fixed
4-city list in __main__ -- meaning it could only ever correctly process the
original seeded campaign. These helpers fetch the real campaign title and
real stops from tour_data_api so the driver works for any campaign_id, and
_brief_already_final now checks via HTTP (tour_data_api's /city_briefs)
instead of shelling out to the bq CLI, which doesn't exist in a Cloud Run
Job container.
"""

from unittest.mock import MagicMock, patch

import run_campaign


def test_fetch_campaign_title_returns_title_field():
    fake_response = MagicMock()
    fake_response.json.return_value = {"campaign_id": "c1", "title": "Random Tour"}
    with patch.object(run_campaign.requests, "get", return_value=fake_response) as mock_get:
        title = run_campaign._fetch_campaign_title("c1", "fake-token")
    assert title == "Random Tour"
    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"campaign_id": "c1"}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_fetch_campaign_stops_returns_stops_list():
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "stops": [
            {"city_id": "london", "city_name": "London", "stop_date": "2026-08-17", "sequence_order": 1},
            {"city_id": "mumbai", "city_name": "Mumbai", "stop_date": "2026-08-18", "sequence_order": 2},
        ]
    }
    with patch.object(run_campaign.requests, "get", return_value=fake_response):
        stops = run_campaign._fetch_campaign_stops("c1", "fake-token")
    assert len(stops) == 2
    assert stops[0]["city_id"] == "london"
    assert stops[1]["city_id"] == "mumbai"


def test_brief_already_final_true_when_a_final_brief_exists():
    fake_response = MagicMock()
    fake_response.json.return_value = {"briefs": [{"status": "final"}]}
    with patch.object(run_campaign.requests, "get", return_value=fake_response):
        assert run_campaign._brief_already_final("c1", "mumbai", "fake-token") is True


def test_brief_already_final_false_when_no_briefs():
    fake_response = MagicMock()
    fake_response.json.return_value = {"briefs": []}
    with patch.object(run_campaign.requests, "get", return_value=fake_response):
        assert run_campaign._brief_already_final("c1", "mumbai", "fake-token") is False


def test_brief_already_final_false_when_brief_exists_but_not_final():
    fake_response = MagicMock()
    fake_response.json.return_value = {"briefs": [{"status": "draft"}]}
    with patch.object(run_campaign.requests, "get", return_value=fake_response):
        assert run_campaign._brief_already_final("c1", "mumbai", "fake-token") is False
