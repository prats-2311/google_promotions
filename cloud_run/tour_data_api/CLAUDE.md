# tour_data_api — conventions

Deterministic parameterized BigQuery lookups (never string-formatted SQL) + the live Parallel-Search-grounded fallback for unseeded cities + SDK scoring/grounding tool wrappers. Exposed as OpenAPI routes, consumed by Dialogflow CX Playbooks as a single "Tour Data API" Tool (see `/agent_builder/CLAUDE.md` for how that wiring works and its one sharp edge).

See `/cloud_run/CLAUDE.md` for shared conventions (deploy pattern, service accounts, auth between services, the `sdk_logic/` duplication caveat — read that first).

## Routes
`/culture_notes`, `/live_culture_search`, `/fan_signals`, `/local_delight`, `/live_local_delight_search`, `/campaigns`, `/campaign_stops`, `/city_briefs` (GET+POST), `/score_enthusiasm`, `/rank_cities`, `/check_grounding`. All routes and their request/response shapes are mirrored exactly in `/agent_builder/openapi/tour_data_api.yaml` — keep that file and this one in sync; it's what actually gets pushed into the live Dialogflow CX Tool resource.

`/live_local_delight_search` mirrors `/live_culture_search` exactly (same Parallel Search + Gemini synthesis pattern, same input validation) but for `local_delight`'s schema. One extra rule baked into its synthesis prompt: `beloved_icons.name` must never be a named real, living person — always a generic description ("a widely loved local musician, referenced generically"), matching the discipline the curated seed data already follows.

## Input validation — a real, tested security boundary
`city_name`/`country` on both live-search routes are interpolated directly into the Parallel `objective`/`search_queries` and the Gemini synthesis prompt — a prompt-injection surface (a caller could smuggle fake instructions via newlines, braces, or a wall of text). `_validate_place_name()` enforces: non-empty, ≤100 chars, letters (any script, via `str.isalpha()` — correctly handles "São Paulo") plus a small punctuation allowlist (`'.-, `) only — nothing else. Both fields are validated before either reaches Parallel or Gemini. See `tests/test_live_culture_search_security.py` for the TDD red→green history (these tests were written first, against the *vulnerable* code, to prove the gap was real before fixing it) — any new field that flows into a prompt needs the same treatment and the same kind of test.

## Parallel Search integration (`_parallel_search`, `/live_culture_search`)
- **Uses the official `parallel-web` SDK** (`from parallel import Parallel`), not raw REST. This isn't just style — the Parallel partner-track eligibility rule names three qualifying integration paths (official SDK, a supported framework integration, or a Grounding configuration); a hand-rolled `requests.post` against the same endpoint satisfies the spirit of "actively call the Search API at runtime" but not the letter of the rule. Don't revert to raw REST for this call even though the rest of this service uses plain `requests` for Vertex AI.
- Catch `parallel.APIError` (the SDK's base error class) around calls, not `requests.HTTPError`.
- `PARALLEL_API_KEY` comes from Secret Manager via `--set-secrets` at deploy time — never a plain env var, never committed. IAM-bound to only `tour-data-api-sa` (see the `parallel-api-key` secret's own ACL).
- `search_queries` must be 2-3 short (3-6 word) keyword phrases, diverse angles, never full sentences — this is Parallel's own documented best practice, confirmed by fetching their setup-prompt docs directly (2026-07-30). `objective` is the one field that should read like natural language.
- `mode` (`advanced`/`turbo`/`basic`) and other tuning params (`max_chars_total`, etc.) are handler-side only, hardcoded server-side (`mode="advanced"`) — deliberately **not** exposed in the OpenAPI schema the Playbook/model sees. Parallel's own docs note exposing these tends to hurt quality by giving the model knobs to fiddle with that it can't judge well.
- Response is reshaped to match `/culture_notes`'s exact schema (`etiquette_notes`, `greeting_style`, etc.) plus `source: "parallel_live"`, `confidence`, and `citations` — so downstream consumers (Culture Intelligence Playbook, `grounding_check`, the dashboard) never need to special-case a "live" source.
- Verified against Seoul, Berlin, Lagos, Nairobi (all unseeded) — real, cited, non-fabricated guidance each time, with an honest `confidence: "low"` when source material was thin rather than overclaiming.

## Gemini synthesis (`_call_gemini_json`, inside `/live_culture_search`)
- Direct REST to Vertex AI's `generateContent` endpoint (not the `google-genai` SDK) — deliberate, since this service otherwise avoids heavy SDK deps and this is the only Gemini call it makes.
- Auth: an OAuth2 **access token** from the Cloud Run metadata server (`.../service-accounts/default/token`, cloud-platform scope) — not the ID tokens used for service-to-service Cloud Run calls elsewhere. Google APIs need access tokens; Cloud Run→Cloud Run calls need audience-bound ID tokens. See `/cloud_run/CLAUDE.md`.
- Always uses `responseSchema` (schema-constrained JSON output), not free-text-then-parse — more reliable than the ad hoc JSON-extraction pattern in `orchestration_driver/run_campaign.py`.
- Model is `GEMINI_MODEL` env var (default `gemini-2.5-flash`), not hardcoded — change the env var, not the code, if the available model catalog shifts.
- Requires `tour-data-api-sa` to have project-level `roles/aiplatform.user` — unavoidable, Vertex AI model access isn't resource-scoped (same justification pattern as `roles/bigquery.jobUser`).

## IAM
`tour-data-api-sa` has a **custom minimal BigQuery role** (`projects/liifecalling-academy/roles/tourDataApiDataAccess`: `datasets.get`, `tables.get`, `tables.getData`, `tables.updateData` only — no schema create/delete/alter/export), applied via the dataset ACL, not a predefined broad role like `WRITER`. See the IAM hardening finding in project memory for why this replaced the original `WRITER` grant.
