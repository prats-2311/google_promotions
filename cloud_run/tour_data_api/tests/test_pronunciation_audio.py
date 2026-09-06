"""/synthesize_pronunciation: real Gemini TTS audio for local phrases, stored
in Cloud Storage. Each phrase is content-hashed to its blob path so a
repeated phrase (e.g. a common Mumbai greeting reused across campaigns)
skips re-synthesis and just returns the existing URL."""

from unittest.mock import MagicMock

import requests

import tour_data_api_main as main


def _fake_tts_response(pcm_b64: str = "AAAA", status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.raise_for_status.side_effect = None if status_code < 400 else requests.HTTPError(response=resp)
    resp.json.return_value = {
        "candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/L16;codec=pcm;rate=24000", "data": pcm_b64}}]}}]
    }
    return resp


def test_requires_nonempty_phrases(client):
    res = client.post("/synthesize_pronunciation", json={"phrases": []})
    assert res.status_code == 400


def test_synthesizes_and_uploads_new_phrase(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_tts_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = False
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/pronunciation-audio/abc123.wav"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/synthesize_pronunciation", json={"phrases": ["Namaste Mumbai!"]})

    assert res.status_code == 200
    body = res.get_json()
    assert body["audio"] == [{"phrase": "Namaste Mumbai!", "audio_url": mock_blob.public_url}]
    mock_blob.upload_from_string.assert_called_once()
    args, kwargs = mock_blob.upload_from_string.call_args
    assert kwargs.get("content_type") == "audio/wav" or (len(args) > 1 and args[1] == "audio/wav")


def test_skips_resynthesis_for_already_uploaded_phrase(client, mock_storage_client, monkeypatch):
    mock_post = MagicMock(return_value=_fake_tts_response())
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = True
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/pronunciation-audio/existing.wav"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/synthesize_pronunciation", json={"phrases": ["Namaste Mumbai!"]})

    assert res.status_code == 200
    assert res.get_json()["audio"] == [{"phrase": "Namaste Mumbai!", "audio_url": mock_blob.public_url}]
    mock_post.assert_not_called()
    mock_blob.upload_from_string.assert_not_called()


def test_one_phrase_failing_does_not_block_the_others(client, mock_storage_client, monkeypatch):
    good = _fake_tts_response()
    bad = MagicMock()
    bad.status_code = 500
    bad.raise_for_status.side_effect = requests.HTTPError("tts failed", response=bad)
    mock_post = MagicMock(side_effect=[bad, good])
    monkeypatch.setattr(main.requests, "post", mock_post)

    mock_blob = MagicMock()
    mock_blob.exists.return_value = False
    mock_blob.public_url = "https://storage.googleapis.com/test-fake-bucket/pronunciation-audio/ok.wav"
    mock_storage_client.bucket.return_value.blob.return_value = mock_blob

    res = client.post("/synthesize_pronunciation", json={"phrases": ["Bad Phrase", "Good Phrase"]})

    assert res.status_code == 200
    audio = res.get_json()["audio"]
    assert audio[0]["phrase"] == "Bad Phrase"
    assert audio[0]["audio_url"] is None
    assert audio[1] == {"phrase": "Good Phrase", "audio_url": mock_blob.public_url}


def test_missing_bucket_configured_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "_storage_client", None)
    res = client.post("/synthesize_pronunciation", json={"phrases": ["Namaste Mumbai!"]})
    assert res.status_code == 500


def test_pcm_to_wav_produces_a_valid_wav_header():
    wav_bytes = main._pcm_to_wav_bytes(b"\x00\x01" * 100, sample_rate=24000)
    assert wav_bytes[:4] == b"RIFF"
    assert wav_bytes[8:12] == b"WAVE"
