# agent_mcp_server — conventions

A real Model Context Protocol server (official `mcp` Python SDK, `MCPServer` + streamable-http transport) exposing `tour_data_api`'s own read-only routes as tools any external MCP client can call — a coding agent in a terminal, another team's agent — not just our internal Dialogflow CX Playbooks. This is the "bidirectional MCP" half of the architecture: Culture Intelligence/Fan Enthusiasm/Local Delight already consume `tour_data_api` as their own internal tool layer; this service stands up the *same* tools as a server other agents build on, per `main.py`'s module docstring.

See `/cloud_run/CLAUDE.md` for shared conventions (deploy pattern, service accounts, testing). This service breaks from a couple of those defaults deliberately — see below.

## Tools exposed
`list_campaigns`, `get_campaign`, `get_campaign_stops`, `get_culture_notes`, `get_fan_signals`, `get_local_delight`, `get_city_briefs`, `rank_cities` — each a thin wrapper (`_get`/`_post`) around the identical `tour_data_api` route, no new logic. Every `@mcp.tool()`-decorated function stays directly callable as a plain Python function (the decorator registers it into the MCP tool registry but returns the function unchanged) — tests call these directly, bypassing the MCP transport layer entirely, same style as this repo's Flask-route tests.

## Deliberately narrower surface than tour_data_api
No `create_campaign`, no `city_briefs` POST, no live-search fan-out (`/live_culture_search` etc. — those cost real Parallel/Gemini calls per invocation and aren't something an arbitrary external caller should be able to trigger for free). Read-only, plus `rank_cities` (pure compute, no side effects). If a write tool is ever needed here, it needs its own explicit access-control review first — don't just add it because tour_data_api already has the route.

## Auth — two directions, both already-established patterns
- **External caller → this service**: deployed with `--no-allow-unauthenticated` (Cloud IAM-gated), the same mechanism already used for `tour_data_api` and `delight_card_renderer`. Verified live: an unauthenticated request gets a real `403`; a request with a valid identity token (e.g. `gcloud auth print-identity-token`, or another service's own identity token) gets a real `200`. This is the access-control step the blog post that inspired this pattern explicitly calls out as easy to skip once a server is reachable by a caller you don't control — don't skip it.
- **This service → tour_data_api**: `_identity_token()` is the same dual-path pattern as `dashboard/server/index.js`'s `getIdentityToken()` and `orchestration_driver/run_campaign.py`'s `_auth_token()` — Cloud Run instance metadata server first, falling back to local `gcloud auth print-identity-token --audiences=...` for local dev. **The local fallback needs a service-account-backed gcloud identity to work** — a plain user account hits `Invalid account type for --audiences. Requires valid service account` (confirmed while building this service). This doesn't affect production (the metadata-server path is what Cloud Run actually uses) but means this service's tools can't be locally smoke-tested end-to-end against the real tour_data_api without either an impersonated service account or just testing against the deployed revision instead.
- `agent-mcp-server-sa` has `roles/run.invoker` on `tour-data-api`, granted the same resource-level way as `dashboard-sa`/`orchestration-driver-sa` (`gcloud run services add-iam-policy-binding tour-data-api ...`), not a project-level grant.

## Deploy
Same buildpack source-deploy pattern as the other two services, but note the extra flag:
```
gcloud run deploy agent-mcp-server --source=cloud_run/agent_mcp_server --region=us-central1 \
  --project=liifecalling-academy --service-account=agent-mcp-server-sa@liifecalling-academy.iam.gserviceaccount.com \
  --no-allow-unauthenticated
```
Procfile runs `uvicorn main:app` (ASGI), not `gunicorn` — this service's `app` is `mcp.streamable_http_app(...)`, a Starlette app, not a Flask WSGI app like the other two services here. `stateless_http=True` is required, not optional: a stateful streamable-http session tied to one server process would break under Cloud Run's stateless autoscaling, which can route consecutive requests from the same client to different instances with no shared session state.

## Verifying it live
`gcloud run services proxy agent-mcp-server ...` requires installing the `cloud-run-proxy` gcloud component interactively — don't background that command blind, it'll hang on the install prompt. Simpler: get a bare identity token (`gcloud auth print-identity-token`, no `--audiences` needed for calling an IAM-gated Cloud Run service as a human) and either `curl` the `/mcp` endpoint directly, or drive a real `mcp.ClientSession` over `mcp.client.streamable_http.streamable_http_client(url, http_client=httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}))` — note this SDK version's context manager yields a 2-tuple `(read, write)`, not the 3-tuple some docs/examples show.
