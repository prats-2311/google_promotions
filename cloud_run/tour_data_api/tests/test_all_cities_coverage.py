"""Cross-city coverage: test_bigquery_routes.py only ever exercised mumbai
row shapes. These parametrize the same 3 GET routes across all 5 supported
cities using fixtures.py, to catch bugs specific to a single city's data
(non-ASCII city names, empty-array fields, etc.) that a mumbai-only fixture
never would.
"""

import pytest

from fixtures import SUPPORTED_CITY_IDS, culture_notes_row, fan_signals_row, local_delight_row


def _mock_query_result(mock_bq, rows):
    mock_bq.query.return_value.result.return_value = rows


@pytest.mark.parametrize("city_id", SUPPORTED_CITY_IDS)
def test_culture_notes_returns_row_shape_for_every_city(client, mock_bq, city_id):
    _mock_query_result(mock_bq, [culture_notes_row(city_id)])
    res = client.get(f"/culture_notes?city_id={city_id}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["city_id"] == city_id
    assert body["dos"] and body["donts"]


@pytest.mark.parametrize("city_id", SUPPORTED_CITY_IDS)
def test_fan_signals_returns_row_shape_for_every_city(client, mock_bq, city_id):
    _mock_query_result(mock_bq, [fan_signals_row(city_id, genre="pop", artist_type="musician")])
    res = client.get(f"/fan_signals?city_id={city_id}&genre=pop&artist_type=musician")
    assert res.status_code == 200
    body = res.get_json()
    assert body["city_id"] == city_id
    assert 0 <= body["enthusiasm_score"] <= 100


@pytest.mark.parametrize("city_id", SUPPORTED_CITY_IDS)
def test_local_delight_returns_row_shape_for_every_city(client, mock_bq, city_id):
    _mock_query_result(mock_bq, [local_delight_row(city_id)])
    res = client.get(f"/local_delight?city_id={city_id}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["city_id"] == city_id
    assert body["local_phrases"] and body["beloved_icons"]
    for icon in body["beloved_icons"]:
        assert set(icon.keys()) == {"name", "domain", "reference_note"}
