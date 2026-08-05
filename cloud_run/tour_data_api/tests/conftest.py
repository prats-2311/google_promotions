"""Test harness for tour_data_api.

main.py constructs its BigQuery and Parallel clients at module-import time
(module-level singletons), so both must be patched *before* the module is
executed, or import itself fails outside a real GCP environment (no ADC).

Loaded via importlib under a unique sys.modules key ("tour_data_api_main"),
never plain "main" — cloud_run/delight_card_renderer also has a main.py, and
pytest loads every conftest.py across the whole session up front, so two
services both registering themselves as sys.modules["main"] would collide
(whichever conftest runs last silently wins for every test file, regardless
of directory). Test files here import this as `tour_data_api_main as main`.
"""

import importlib.util
import os
import sys
from unittest.mock import MagicMock, patch

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _SERVICE_DIR)
os.environ.setdefault("PARALLEL_API_KEY", "test-fake-key")
os.environ.setdefault("GCP_PROJECT", "test-project")

import pytest

with patch("google.cloud.bigquery.Client"), patch("parallel.Parallel"):
    _spec = importlib.util.spec_from_file_location("tour_data_api_main", os.path.join(_SERVICE_DIR, "main.py"))
    main = importlib.util.module_from_spec(_spec)
    sys.modules["tour_data_api_main"] = main
    _spec.loader.exec_module(main)


@pytest.fixture
def client():
    main.app.config["TESTING"] = True
    return main.app.test_client()


@pytest.fixture(autouse=True)
def mock_bq(monkeypatch):
    mock_client = MagicMock()
    mock_client.project = "test-project"
    monkeypatch.setattr(main, "_bq", mock_client)
    return mock_client


@pytest.fixture(autouse=True)
def mock_parallel_client(monkeypatch):
    mock_client = MagicMock()
    monkeypatch.setattr(main, "_parallel_client", mock_client)
    return mock_client


@pytest.fixture(autouse=True)
def mock_access_token(monkeypatch):
    monkeypatch.setattr(main, "_get_access_token", lambda: "fake-access-token")
