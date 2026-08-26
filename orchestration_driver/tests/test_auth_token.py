"""_auth_token replaces the old bare _gcloud_token: a Cloud Run Job container
has no gcloud CLI and no user credentials, only the job's attached service
account -- so the instance metadata server must be tried first, falling back
to an already-authenticated local gcloud session for local dev. Same
dual-path pattern as dashboard/server/index.js's getIdentityToken()."""

from unittest.mock import MagicMock, patch

import run_campaign


def _fake_urlopen_cm(body: bytes):
    fake_resp = MagicMock()
    fake_resp.read.return_value = body
    fake_cm = MagicMock()
    fake_cm.__enter__.return_value = fake_resp
    return fake_cm


def test_auth_token_access_uses_metadata_server_when_reachable():
    with patch.object(run_campaign.urllib.request, "urlopen", return_value=_fake_urlopen_cm(b'{"access_token": "meta-access-token"}')):
        token = run_campaign._auth_token("access")
    assert token == "meta-access-token"


def test_auth_token_identity_uses_metadata_server_when_reachable():
    with patch.object(run_campaign.urllib.request, "urlopen", return_value=_fake_urlopen_cm(b"meta-identity-token\n")) as mock_urlopen:
        token = run_campaign._auth_token("identity", audience="https://example.run.app")
    assert token == "meta-identity-token"
    request_arg = mock_urlopen.call_args[0][0]
    assert "audience=https" in request_arg.full_url


def test_auth_token_access_falls_back_to_gcloud_when_metadata_unreachable():
    with patch.object(run_campaign.urllib.request, "urlopen", side_effect=OSError("no metadata server")):
        with patch.object(run_campaign.subprocess, "check_output", return_value=b"gcloud-access-token\n") as mock_co:
            token = run_campaign._auth_token("access")
    assert token == "gcloud-access-token"
    assert mock_co.call_args[0][0] == ["gcloud", "auth", "print-access-token"]


def test_auth_token_identity_fallback_passes_audiences_flag():
    with patch.object(run_campaign.urllib.request, "urlopen", side_effect=OSError("no metadata server")):
        with patch.object(run_campaign.subprocess, "check_output", return_value=b"gcloud-identity-token\n") as mock_co:
            token = run_campaign._auth_token("identity", audience="https://x.run.app")
    assert token == "gcloud-identity-token"
    args = mock_co.call_args[0][0]
    assert args[:3] == ["gcloud", "auth", "print-identity-token"]
    assert "--audiences" in args
    assert "https://x.run.app" in args
