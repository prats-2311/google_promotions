# Cloud Run services — shared conventions

Two services live here: `tour_data_api` (BigQuery + Parallel/Gemini fallback + SDK tool wrappers — see its own CLAUDE.md) and `delight_card_renderer` (renders the final HTML delight card). Both follow the same conventions:

## Deploy pattern
- Source-deployed via buildpacks, not a hand-written Dockerfile: `gcloud run deploy <service> --source=cloud_run/<dir> --region=us-central1 --project=liifecalling-academy --service-account=<dedicated-sa>`.
- **Every service needs an explicit `Procfile`.** Buildpack auto-detection has failed before ("Failed to find attribute 'app' in 'main'" for a Functions Framework target) — don't rely on auto-detection:
  - Plain Flask app: `web: gunicorn --bind :$PORT main:app`
  - Functions Framework: `web: functions-framework --target=<fn_name> --port=$PORT`
- Region is **us-central1** for all three services in this project (including the dashboard) — required, not just preferred: Gemini-backed Dialogflow CX Playbooks are only GA in `global, us, us-central1, us-east1, us-west1, europe-west1, europe-west4`.

## Service accounts
- Every service has its own dedicated SA (`tour-data-api-sa`, `delight-card-renderer-sa`, `dashboard-sa`) — never the default Compute Engine SA.
- Grant only what the service actually calls, resource-level (dataset ACL, per-secret IAM binding) over project-level wherever the API allows it. Project-level grants are only acceptable when the API genuinely has no resource-level equivalent (`roles/bigquery.jobUser`, `roles/aiplatform.user`) — document why when you add one of these.
- No downloadable static keys — `SYSTEM_MANAGED` only.

## Auth between services
- **Dialogflow CX Playbooks → these services**: OpenAPI Tool auth is `openApiSpec.authentication.serviceAgentAuthConfig: {serviceAgentAuth: "ID_TOKEN"}` (Dialogflow's own service agent, granted `roles/run.invoker` directly on the target Cloud Run service). NOT `serviceAccountAuthConfig` — Dialogflow rejects that for non-Google-API endpoints with "Service account authentication is only supported for Google APIs."
- **Dashboard BFF → tour_data_api**: fetches an ID token from the Cloud Run instance metadata server (`.../service-accounts/default/identity?audience=<target-url>`), falling back to `gcloud auth print-identity-token` when run locally where no metadata server exists. Same pattern reused in `orchestration_driver/run_campaign.py`.
- **tour_data_api → Vertex AI (Gemini)**: different token type — an OAuth2 **access** token (`.../service-accounts/default/token`, cloud-platform scope), not an ID token. Google APIs need access tokens; service-to-service Cloud Run calls need audience-bound ID tokens. Don't conflate the two.

## Testing
Both services have a pytest suite under `tests/` (e.g. `cloud_run/tour_data_api/tests/`). Run everything from the repo root with `./run_tests.sh` (needs `.venv` set up per `requirements-dev.txt` first) or scope to one service: `.venv/bin/pytest cloud_run/tour_data_api/tests/ -v`.

**Both services define a module named `main.py`.** Their conftest.py files load it via `importlib` under a *unique* `sys.modules` key (`tour_data_api_main`, `delight_card_renderer_main`) rather than a plain `import main` — pytest loads every conftest.py across the whole session up front, so two services both registering `sys.modules["main"]` would collide (whichever loads last silently wins for every test file, regardless of which directory is actually running). If you add a third Cloud Run service with its own `main.py`, follow the same pattern: unique sys.modules key in its conftest, `import <unique_name> as main` in its test files — never a bare `import main`.

`tour_data_api`'s `main.py` constructs its BigQuery and Parallel clients at module-import time (module-level singletons) — both must be patched (via `unittest.mock.patch`) *before* the module executes, or import itself fails outside a real GCP environment (no ADC). See that conftest.py for the pattern.

## Known duplication — a real maintenance wart, not a design choice
`cloud_run/tour_data_api/sdk_logic/` is a **manually-synced copy** of the canonical `/sdk` at the repo root (`enthusiasm_scoring.py`, `city_ranking.py`, `grounding_check.py`). Cloud Run source deploys only build the given source directory, so cross-directory imports don't work at deploy time. **If you fix a bug in `/sdk/*.py`, you must copy the same fix into `sdk_logic/*.py` and redeploy** — this has already caused a real bug (a `grounding_check.py` fix had to be applied twice). No automated sync exists yet; check both copies match before trusting a deploy.
