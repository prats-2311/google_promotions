"""Each MCP tool is a thin wrapper around one tour_data_api route -- the
@mcp.tool() decorator registers the function into the MCP tool registry but
returns the original callable unchanged, so these are tested as plain
functions, bypassing the MCP transport layer entirely (same style as the
rest of this repo's Flask-route tests)."""

from unittest.mock import MagicMock

import agent_mcp_server_main as main


def _fake_response(json_body):
    resp = MagicMock()
    resp.json.return_value = json_body
    resp.raise_for_status.return_value = None
    return resp


def test_list_campaigns_calls_campaigns_list_route(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"campaigns": [{"campaign_id": "c1"}]}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    result = main.list_campaigns()

    assert result == {"campaigns": [{"campaign_id": "c1"}]}
    args, kwargs = mock_get.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/campaigns_list"
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_get_campaign_passes_campaign_id_param(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"campaign_id": "c1", "title": "My Tour"}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    result = main.get_campaign("c1")

    assert result["title"] == "My Tour"
    args, kwargs = mock_get.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/campaigns"
    assert kwargs["params"] == {"campaign_id": "c1"}


def test_get_campaign_stops_passes_campaign_id_param(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"stops": []}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_campaign_stops("c1")

    args, kwargs = mock_get.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/campaign_stops"
    assert kwargs["params"] == {"campaign_id": "c1"}


def test_get_culture_notes_passes_city_id_param(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"city_id": "tokyo"}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_culture_notes("tokyo")

    args, kwargs = mock_get.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/culture_notes"
    assert kwargs["params"] == {"city_id": "tokyo"}


def test_get_fan_signals_omits_optional_params_when_not_given(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_fan_signals("tokyo")

    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"city_id": "tokyo"}


def test_get_fan_signals_includes_optional_params_when_given(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_fan_signals("tokyo", genre="pop", artist_type="band")

    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"city_id": "tokyo", "genre": "pop", "artist_type": "band"}


def test_get_local_delight_passes_city_id_param(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"city_id": "tokyo"}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_local_delight("tokyo")

    args, kwargs = mock_get.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/local_delight"
    assert kwargs["params"] == {"city_id": "tokyo"}


def test_get_city_briefs_omits_city_id_when_not_given(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"briefs": []}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_city_briefs("c1")

    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"campaign_id": "c1"}


def test_get_city_briefs_includes_city_id_when_given(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_get = MagicMock(return_value=_fake_response({"briefs": []}))
    monkeypatch.setattr(main.requests, "get", mock_get)

    main.get_city_briefs("c1", city_id="tokyo")

    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"campaign_id": "c1", "city_id": "tokyo"}


def test_rank_cities_posts_cities_payload(monkeypatch):
    monkeypatch.setattr(main, "_identity_token", lambda audience: "fake-token")
    mock_post = MagicMock(return_value=_fake_response({"ranked": []}))
    monkeypatch.setattr(main.requests, "post", mock_post)

    cities = [{"city_id": "tokyo", "enthusiasm_score": 80}]
    result = main.rank_cities(cities)

    assert result == {"ranked": []}
    args, kwargs = mock_post.call_args
    assert args[0] == f"{main.TOUR_DATA_API}/rank_cities"
    assert kwargs["json"] == {"cities": cities}
    assert kwargs["headers"]["Authorization"] == "Bearer fake-token"


def test_all_read_tools_are_registered_with_the_mcp_server():
    tool_names = {t.name for t in main.mcp._tool_manager.list_tools()} if hasattr(main.mcp, "_tool_manager") else None
    if tool_names is None:
        import asyncio
        tool_names = {t.name for t in asyncio.run(main.mcp.list_tools())}
    assert tool_names == {
        "list_campaigns",
        "get_campaign",
        "get_campaign_stops",
        "get_culture_notes",
        "get_fan_signals",
        "get_local_delight",
        "get_city_briefs",
        "rank_cities",
    }
