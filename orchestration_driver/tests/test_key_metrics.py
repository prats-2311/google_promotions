"""Selected key metrics (literacy, income, top interests, etc.) are fetched
once per campaign (campaigns.selected_metrics) and once per city stop --
curated tour_data_api lookup first, falling back to the live
Parallel-Search-grounded route for a city with no seeded row. Purely
deterministic, no playbook turn involved, mirroring the existing
_live_culture_search_direct pattern.
"""

from unittest.mock import MagicMock, patch

import run_campaign


def test_fetch_selected_metrics_returns_list_from_campaign():
    fake_response = MagicMock()
    fake_response.json.return_value = {"campaign_id": "c1", "selected_metrics": ["literacy_rate", "population"]}
    with patch.object(run_campaign.requests, "get", return_value=fake_response) as mock_get:
        metrics = run_campaign._fetch_selected_metrics("c1", "fake-token")
    assert metrics == ["literacy_rate", "population"]
    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"campaign_id": "c1"}


def test_fetch_selected_metrics_defaults_to_empty_list():
    fake_response = MagicMock()
    fake_response.json.return_value = {"campaign_id": "c1"}
    with patch.object(run_campaign.requests, "get", return_value=fake_response):
        assert run_campaign._fetch_selected_metrics("c1", "fake-token") == []


def test_fetch_key_metrics_returns_none_when_nothing_selected():
    with patch.object(run_campaign.requests, "get") as mock_get:
        result = run_campaign._fetch_key_metrics("mumbai", "Mumbai", [], "fake-token")
    assert result is None
    mock_get.assert_not_called()


def test_fetch_key_metrics_uses_curated_row_when_present():
    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {"city_id": "mumbai", "literacy_rate": 89.2}
    with patch.object(run_campaign.requests, "get", return_value=fake_response), \
         patch.object(run_campaign.requests, "post") as mock_post:
        result = run_campaign._fetch_key_metrics("mumbai", "Mumbai", ["literacy_rate"], "fake-token")
    assert result == {"city_id": "mumbai", "literacy_rate": 89.2}
    mock_post.assert_not_called()


def test_fetch_key_metrics_falls_back_to_live_search_on_404():
    fake_get_response = MagicMock()
    fake_get_response.status_code = 404
    fake_post_response = MagicMock()
    fake_post_response.json.return_value = {"city_id": "seoul", "source": "parallel_live", "confidence": "medium"}
    with patch.object(run_campaign.requests, "get", return_value=fake_get_response), \
         patch.object(run_campaign.requests, "post", return_value=fake_post_response) as mock_post:
        result = run_campaign._fetch_key_metrics("seoul", "Seoul", ["literacy_rate"], "fake-token")
    assert result["source"] == "parallel_live"
    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"city_name": "Seoul"}
