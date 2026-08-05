"""Loaded via importlib under a unique sys.modules key
("delight_card_renderer_main"), never plain "main" — cloud_run/tour_data_api
also has a main.py, and pytest loads every conftest.py across the whole
session up front, so two services both registering themselves as
sys.modules["main"] would collide (whichever conftest runs last silently
wins for every test file, regardless of directory). Test files here import
this as `delight_card_renderer_main as main`.
"""

import importlib.util
import os
import sys

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _SERVICE_DIR)
os.environ.setdefault("DELIGHT_CARD_BUCKET", "test-bucket")

import pytest

_spec = importlib.util.spec_from_file_location("delight_card_renderer_main", os.path.join(_SERVICE_DIR, "main.py"))
main = importlib.util.module_from_spec(_spec)
sys.modules["delight_card_renderer_main"] = main
_spec.loader.exec_module(main)


@pytest.fixture(autouse=True)
def _flask_app_context():
    # render_delight_card calls Flask's jsonify(), which needs an active app
    # context — functions_framework only provides one when run via its CLI,
    # not when the decorated function is called directly like this.
    import flask
    app = flask.Flask(__name__)
    with app.app_context():
        yield


@pytest.fixture
def mock_storage_client(monkeypatch):
    from unittest.mock import MagicMock

    mock_client_cls = MagicMock()
    mock_blob = MagicMock()
    mock_blob.public_url = "https://storage.googleapis.com/test-bucket/delight-cards/fake.html"
    mock_client_cls.return_value.bucket.return_value.blob.return_value = mock_blob
    monkeypatch.setattr(main.storage, "Client", mock_client_cls)
    return mock_blob
