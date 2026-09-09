"""Entrance-sting audio via Lyria: the Delight Card's "Entrance Cue" was a
text suggestion -- this turns it into a real, playable ~30s music clip,
generated from the same grounded signals (the cue idea + campaign genre),
content-hash cached in Cloud Storage exactly like pronunciation audio and
key art. The cue text is user-influenced and flows into a music prompt, so
it gets the same validation discipline as every such field (red-first)."""

from unittest.mock import MagicMock

import pytest

import tour_data_api_main as main


def _fake_lyria_response(b64="UklGRg==", status=200):
    resp = MagicMock()
    resp.status_code = status
    resp.raise_for_status.side_effect = None if status < 400 else main.requests.HTTPError(response=resp)
    resp.json.return_value = {"predictions": [{"bytesBase64Encoded": b64}]}
    return resp


def test_requires_fields(client):
    assert client.post("/generate_entrance_sting", json={"city_name": "Mumbai"}).status_code == 400
    assert client.post("/generate_entrance_sting", json={"sting_idea": "bollywood sting"}).status_code == 400


@pytest.mark.parametrize("bad", [
    'sting} {"inject": true',
    "sting <script>alert(1)</script>",
    "x" * 300,
])
def test_invalid_sting_idea_rejected(client, mock_storage_client, bad):
    res = client.post("/generate_entrance_sting", json={
        "city_id": "mumbai", "city_name": "Mumbai", "sting_idea": bad,
    })
    assert res.status_code == 400


def test_generates_uploads_and_traces(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_lyria_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = False
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/entrance-stings/abc.wav"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/generate_entrance_sting", json={
        "city_id": "mumbai", "city_name": "Mumbai",
        "sting_idea": "a brief Bollywood-style remix sting",
        "campaign_context": "sci-fi action film promo tour",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["sting_url"] == mock_blob.public_url
    trace = body["generation_trace"]
    assert trace["cached"] is False
    assert "Bollywood-style remix sting" in trace["prompt"]
    assert "sci-fi action film promo tour" in trace["prompt"]
    # the real Lyria prompt reached the model call
    _, kwargs = mock_post.call_args
    assert kwargs["json"]["instances"][0]["prompt"] == trace["prompt"]
    mock_blob.upload_from_string.assert_called_once()
    _, up_kwargs = mock_blob.upload_from_string.call_args
    assert up_kwargs.get("content_type") == "audio/wav"


def test_cached_sting_skips_generation(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_lyria_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = True
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/entrance-stings/existing.wav"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/generate_entrance_sting", json={
        "city_id": "mumbai", "city_name": "Mumbai", "sting_idea": "a brief sting",
    })
    assert res.status_code == 200
    assert res.get_json()["generation_trace"]["cached"] is True
    mock_post.assert_not_called()
    mock_blob.upload_from_string.assert_not_called()


def test_lyria_error_returns_502(client, mock_storage_client, monkeypatch):
    monkeypatch.setattr(main.requests, "post", MagicMock(return_value=_fake_lyria_response(status=500)))
    mock_blob = MagicMock()
    mock_blob.exists.return_value = False
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/generate_entrance_sting", json={
        "city_id": "mumbai", "city_name": "Mumbai", "sting_idea": "a brief sting",
    })
    assert res.status_code == 502


def test_em_dash_in_curated_cue_is_accepted():
    """Real curated cue text uses em dashes ("An understated entrance — avoid
    over-produced fanfare") -- typographic dashes carry no injection value
    and must pass. Found live as a 400 during pre-warm (2026-09-09)."""
    assert "understated" in main._validate_sting_idea("An understated entrance \u2014 avoid over-produced fanfare")
