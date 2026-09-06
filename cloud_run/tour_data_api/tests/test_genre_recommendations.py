"""/genre_recommendations: which cities have historically driven the
highest real enthusiasm for a genre, aggregated from actual finalized
city_briefs joined to their campaign's genre -- not the static fan_signals
seed table, real outcomes across past campaigns."""

from unittest.mock import MagicMock

import tour_data_api_main as main


def test_requires_genre(client):
    res = client.get("/genre_recommendations")
    assert res.status_code == 400


def test_returns_ranked_recommendations(client, mock_bq):
    row1 = MagicMock()
    row1.__getitem__.side_effect = lambda k: {"city_id": "mumbai", "avg_enthusiasm_score": 88.5, "sample_size": 3}[k]
    row2 = MagicMock()
    row2.__getitem__.side_effect = lambda k: {"city_id": "london", "avg_enthusiasm_score": 72.0, "sample_size": 1}[k]
    mock_bq.query.return_value.result.return_value = [row1, row2]

    res = client.get("/genre_recommendations?genre=indie-rock")

    assert res.status_code == 200
    body = res.get_json()
    assert body["genre"] == "indie-rock"
    assert body["recommendations"] == [
        {"city_id": "mumbai", "avg_enthusiasm_score": 88.5, "sample_size": 3},
        {"city_id": "london", "avg_enthusiasm_score": 72.0, "sample_size": 1},
    ]


def test_returns_empty_list_when_no_historical_data(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    res = client.get("/genre_recommendations?genre=obscure-genre")
    assert res.status_code == 200
    assert res.get_json()["recommendations"] == []


def test_query_filters_to_final_status_and_matching_genre(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    client.get("/genre_recommendations?genre=pop")
    sql_arg = mock_bq.query.call_args[0][0]
    assert "status = 'final'" in sql_arg
    assert "@genre" in sql_arg
