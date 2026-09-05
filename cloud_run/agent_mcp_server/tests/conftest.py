"""Test harness for agent_mcp_server.

Loaded via importlib under a unique sys.modules key ("agent_mcp_server_main"),
never plain "main" -- tour_data_api and delight_card_renderer also each
define their own main.py, and pytest loads every conftest.py across the
whole session up front, so multiple services registering themselves as
sys.modules["main"] would collide (whichever conftest runs last silently
wins for every test file, regardless of directory). Test files here import
this as `agent_mcp_server_main as main`.
"""

import importlib.util
import os
import sys

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _SERVICE_DIR)

_spec = importlib.util.spec_from_file_location("agent_mcp_server_main", os.path.join(_SERVICE_DIR, "main.py"))
main = importlib.util.module_from_spec(_spec)
sys.modules["agent_mcp_server_main"] = main
_spec.loader.exec_module(main)
