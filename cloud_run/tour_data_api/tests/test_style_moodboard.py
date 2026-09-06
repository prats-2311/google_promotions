"""/generate_style_moodboard: a real Gemini image-generation call producing
an abstract, grounded style moodboard for a city stop -- reflecting real
culture/local-delight signals (palette, motifs, mood), never a generic
stock-photo aesthetic and never a real person's likeness. Stored in Cloud
Storage exactly like pronunciation audio: content-hashed so an unchanged
style brief for the same city skips re-generation."""

from unittest.mock import MagicMock

import requests

import tour_data_api_main as main


def _fake_image_response(png_b64: str = "AAAA", status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.raise_for_status.side_effect = None if status_code < 400 else requests.HTTPError(response=resp)
    resp.json.return_value = {
        "candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": png_b64}}]}}]
    }
    return resp


def test_requires_fields(client):
    res = client.post("/generate_style_moodboard", json={"city_id": "mumbai"})
    assert res.status_code == 400


def test_generates_and_uploads_new_moodboard(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_image_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = False
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/style-moodboards/abc123.png"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/generate_style_moodboard", json={
        "city_id": "mumbai", "city_name": "Mumbai", "style_notes": "warm saffron and marigold palette",
    })

    assert res.status_code == 200
    body = res.get_json()
    assert body == {"city_id": "mumbai", "moodboard_url": mock_blob.public_url}
    mock_blob.upload_from_string.assert_called_once()
    args, kwargs = mock_blob.upload_from_string.call_args
    assert kwargs.get("content_type") == "image/png" or (len(args) > 1 and args[1] == "image/png")
    # the grounded style_notes must actually reach the prompt, not a generic default
    _, gen_kwargs = mock_post.call_args
    prompt_text = gen_kwargs["json"]["contents"][0]["parts"][0]["text"]
    assert "warm saffron and marigold palette" in prompt_text


def test_skips_regeneration_for_unchanged_style_notes(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_image_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = True
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/style-moodboards/existing.png"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/generate_style_moodboard", json={
        "city_id": "mumbai", "city_name": "Mumbai", "style_notes": "warm saffron and marigold palette",
    })

    assert res.status_code == 200
    assert res.get_json()["moodboard_url"] == mock_blob.public_url
    mock_post.assert_not_called()
    mock_blob.upload_from_string.assert_not_called()


def test_gemini_error_returns_502(client, mock_storage_client, monkeypatch):
    bad = MagicMock()
    bad.status_code = 500
    bad.raise_for_status.side_effect = requests.HTTPError("image gen failed", response=bad)
    monkeypatch.setattr(main.requests, "post", MagicMock(return_value=bad))
    mock_storage_client.bucket.return_value.blob.return_value.exists.return_value = False

    res = client.post("/generate_style_moodboard", json={
        "city_id": "mumbai", "city_name": "Mumbai", "style_notes": "warm saffron and marigold palette",
    })
    assert res.status_code == 502


def test_missing_bucket_configured_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_storage_client", None)
    res = client.post("/generate_style_moodboard", json={
        "city_id": "mumbai", "city_name": "Mumbai", "style_notes": "warm saffron and marigold palette",
    })
    assert res.status_code == 500
