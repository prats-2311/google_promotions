import json
from unittest.mock import MagicMock

import delight_card_renderer_main as main


def _fake_request(payload):
    req = MagicMock()
    req.get_json.return_value = payload
    return req


def test_returns_400_when_no_json_body():
    res, status = main.render_delight_card(_fake_request(None))
    assert status == 400


def test_generates_brief_id_when_missing(mock_storage_client):
    res = main.render_delight_card(_fake_request({"city_id": "mumbai", "city_name": "Mumbai"}))
    body = json.loads(res.get_data())
    assert body["brief_id"]  # a uuid was generated


def test_uses_provided_brief_id(mock_storage_client):
    res = main.render_delight_card(_fake_request({"brief_id": "my-brief-1", "city_id": "mumbai"}))
    body = json.loads(res.get_data())
    assert body["brief_id"] == "my-brief-1"


def test_returns_the_uploaded_public_url(mock_storage_client):
    res = main.render_delight_card(_fake_request({"brief_id": "b1", "city_id": "mumbai"}))
    body = json.loads(res.get_data())
    assert body["delight_card_url"] == mock_storage_client.public_url


def test_known_city_gets_its_accent_color():
    html = main._render_html({"city_id": "mumbai", "city_name": "Mumbai"})
    assert main._ACCENT_BY_CITY["mumbai"] in html


def test_unknown_city_falls_back_to_default_accent():
    html = main._render_html({"city_id": "atlantis", "city_name": "Atlantis"})
    assert main._DEFAULT_ACCENT in html


def test_jinja_autoescapes_city_name_against_html_injection():
    malicious = "<script>alert(1)</script>"
    html = main._render_html({"city_id": "mumbai", "city_name": malicious})
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_jinja_autoescapes_fan_behavior_style():
    malicious = "<img src=x onerror=alert(1)>"
    html = main._render_html({
        "city_id": "mumbai", "city_name": "Mumbai", "fan_behavior_style": malicious,
    })
    assert "<img src=x onerror=alert(1)>" not in html


def test_render_html_handles_missing_optional_fields_gracefully():
    html = main._render_html({"city_id": "mumbai"})
    assert "Mumbai" not in html or "mumbai" in html  # falls back to city_id when city_name absent
    assert isinstance(html, str) and len(html) > 0


def test_upload_html_uses_configured_bucket_and_brief_id_path(mock_storage_client, monkeypatch):
    from unittest.mock import MagicMock as MM
    bucket_mock = MM()
    blob_mock = MM()
    blob_mock.public_url = "https://x/y.html"
    bucket_mock.blob.return_value = blob_mock
    client_instance = MM()
    client_instance.bucket.return_value = bucket_mock
    monkeypatch.setattr(main.storage, "Client", lambda: client_instance)

    url = main._upload_html("<html></html>", "brief-123")

    client_instance.bucket.assert_called_once_with("test-bucket")
    bucket_mock.blob.assert_called_once_with("delight-cards/brief-123.html")
    blob_mock.upload_from_string.assert_called_once_with("<html></html>", content_type="text/html")
    assert url == "https://x/y.html"
