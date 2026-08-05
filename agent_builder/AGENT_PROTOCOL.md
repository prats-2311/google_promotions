# Agent Protocol — how the 5 agents actually talk to each other

This is the single, binding reference for inter-agent communication in the Agentic Tour & Promotion Intelligence OS: exact contracts, who can call whom, function-calling conventions, error semantics, and the trust boundary. Previously this information only existed scattered across 5 Playbook YAML files, an OpenAPI spec, and narrative CLAUDE.md notes — this consolidates it. It reflects what's actually enforced (by the live Playbooks and by the test suite in `cloud_run/tour_data_api/tests/`), not an aspirational design. If this doc and a live Playbook definition ever disagree, re-fetch the live definition (`GET .../agents/{agent}/playbooks`) — it's the source of truth; this file is a snapshot that should be updated when the Playbooks change.

## The five agents and their contracts

### Culture Intelligence Agent
- **In:** `city_id` (string), `city_name` (string — human-readable, used only for the live-search fallback), `mode` (`"generate"` | `"grounding_check"`), `draft_brief` (string, JSON — required only when `mode="grounding_check"`)
- **Out:** `culture_summary` (string), `grounding_check_passed` (boolean), `grounding_check_notes` (string)
- **Tools it calls:** `getCultureNotes`, `liveCultureSearch` (fallback only), `checkGrounding` (grounding_check mode only) — all on the shared `Tour Data API` tool
- **Invoked by:** Campaign Orchestrator (`mode="generate"`), Talent Prep Agent (`mode="grounding_check"` — the two-way handoff)
- **Can invoke:** nothing (leaf agent for playbook references, though it calls tools directly)

### Fan Enthusiasm Agent
- **In:** `city_id`, `genre`, `artist_type` (`"musician"` | `"film_cast"`)
- **Out:** `enthusiasm_score` (number), `city_importance_tier` (string), `fan_behavior_style` (string), `genre_affinity_notes` (string), `confidence_caveat` (string), `used_live_signal` (boolean)
- **Tools it calls:** `getFanSignals`, `scoreEnthusiasm`
- **Invoked by:** Campaign Orchestrator
- **Can invoke:** nothing

### Local Delight Agent
- **In:** `city_id`, `city_name` (fallback input), `campaign_id` (used to prefer a genre-matching `beloved_icons` entry when multiple exist)
- **Out:** `local_phrases` (JSON array string), `cultural_references` (JSON array string), `beloved_icons` (JSON array string), `crowd_moment_suggestions` (JSON array string)
- **Tools it calls:** `getLocalDelight`, `liveLocalDelightSearch` (fallback only)
- **Invoked by:** Campaign Orchestrator
- **Can invoke:** nothing

### Talent Prep Agent
- **In:** `city_id`, `campaign_id`, `culture_summary` (from Culture Intelligence), `enthusiasm_score` (from Fan Enthusiasm), `local_delight_payload` (from Local Delight)
- **Out:** `talent_brief_json` (string), `grounding_check_passed` (boolean), `status` (`"draft"` | `"grounding_checked"` | `"final"`), `delight_card_url` (string, populated once `status="final"`)
- **Tools it calls:** `renderDelightCard` (on the `Delight Card Renderer` tool, `status="final"` only)
- **Playbooks it invokes:** Culture Intelligence Agent (`mode="grounding_check"`) — **this is the one genuine two-way handoff**: Talent Prep drafts a brief, sends it to Culture Intelligence to validate against that city's own don't-list, revises if it fails, and only proceeds to render once it passes. Not a strict one-way pipeline step.
- **Invoked by:** Campaign Orchestrator

### Campaign Orchestrator (start playbook)
- **In:** `campaign_id`
- **Out:** `city_brief_ids` (JSON array string)
- **Tools it calls:** `getCampaign`, `getCampaignStops`, `insertCityBrief`
- **Playbooks it invokes:** Culture Intelligence Agent, Fan Enthusiasm Agent, Local Delight Agent, Talent Prep Agent — once per campaign stop
- **Invoked by:** nothing (this is the Agent's `startPlaybook` — the entry point for every conversation)

## The reachability graph — a real platform constraint, not a design choice

```
Campaign Orchestrator
  ├─→ Culture Intelligence Agent   (mode=generate)
  ├─→ Fan Enthusiasm Agent
  ├─→ Local Delight Agent
  └─→ Talent Prep Agent
         └─→ Culture Intelligence Agent   (mode=grounding_check — the handoff)
```

**Once a conversation's execution has descended into a sub-playbook's own frame, there is no path back up to invoke a sibling.** Culture Intelligence Agent cannot invoke Talent Prep Agent, Fan Enthusiasm Agent cannot invoke anything else — only the Orchestrator and Talent Prep (for the specific grounding-check handoff) can reach Culture Intelligence. This is a confirmed Dialogflow CX Playbooks limitation, not an oversight — see `agent_builder/CLAUDE.md` limitation #2. Don't design a new handoff that requires a leaf agent to call another leaf agent; route it back through the Orchestrator instead.

## Function-calling conventions

- Every tool call goes through exactly one shared OpenAPI Tool per Cloud Run service (`Tour Data API`, `Delight Card Renderer`) — agents don't call Cloud Run directly, they call a named operation (`getCultureNotes`, `scoreEnthusiasm`, etc.) that the Tool resource maps to a route.
- **A tool call chain is capped in practice at ~3-5 calls per conversational turn** (the per-turn execution budget — see `agent_builder/CLAUDE.md`). A single agent invocation that needs a fallback (BigQuery lookup fails → live Parallel Search call) reliably exceeds this when both calls happen in one nested-playbook turn. The fix used throughout this project: give the driver a **direct HTTP fallback** for the same operation (`orchestration_driver.run_campaign._live_culture_search_direct`, `._check_grounding_direct`) rather than trying to make the conversational path chain more calls per turn. Any new fallback-style tool call should follow this same "LLM reasons, code acts" split, not assume the conversational path will reliably complete both calls.
- Tuning parameters that the *service* controls (Parallel's `mode`, Gemini's `temperature`/`responseSchema`) are never exposed as agent-visible input parameters — they're hardcoded server-side in `tour_data_api`. An agent/model should never be given a lever it can't reason well about.

## Error and low-confidence semantics

- **A BigQuery 404 is not a fabrication license.** Every agent's instructions explicitly say: don't invent a fact for a city with no matching record. The fallback (Parallel Search + Gemini synthesis) is the sanctioned alternative, not free-text generation.
- **The fallback's own confidence is surfaced, not hidden.** `live_culture_search`/`live_local_delight_search` return `confidence: "high"|"medium"|"low"` and real citation URLs — a caller (agent, driver, or the dashboard) can and should treat `"low"` differently from a curated BigQuery row.
- **Grounding check is the last line of defense before a brief is marked final**, regardless of whether the underlying culture data came from BigQuery or from Parallel — `checkGrounding` takes `donts`/`humor_boundaries` as plain arguments, source-agnostic. If it fails, Talent Prep must revise and re-check; it cannot mark `status="final"` with a failing check.
- **A tool's error response and its success response are structurally similar** (both are just dicts under `outputActionParameters`) — code consuming a tool's output must explicitly check for an `"error"` key before treating a result as real data. This has already caused one real bug in `orchestration_driver.run_city` (an error dict was briefly treated as valid gathered data) — see `orchestration_driver/CLAUDE.md`.

## Trust boundary — what's sanitized, and where

- **`city_name`/`country`** are the only fields in this system that originate from outside the curated dataset and flow directly into a model prompt (both the Parallel Search `objective`/`search_queries` and the Gemini synthesis prompt in `tour_data_api`). They are validated by `_validate_place_name()` — letters (any script) plus a small punctuation allowlist, ≤100 characters, before either ever reaches Parallel or Gemini. See `cloud_run/tour_data_api/CLAUDE.md` and `tests/test_live_culture_search_security.py` for the enforced behavior.
- **Every BigQuery query is parameterized** (`bigquery.ScalarQueryParameter`), never string-formatted — no SQL injection surface anywhere in `tour_data_api`.
- **Jinja2 autoescaping is on** for the delight card template (`cloud_run/delight_card_renderer`) — a malicious `city_name` or `fan_behavior_style` cannot inject HTML/script into the rendered card. Verified by `tests/test_render_delight_card.py`'s escaping tests.
- **No agent, tool, or Playbook holds a static credential.** All auth is identity-based (Dialogflow's service agent for Tool calls, Cloud Run metadata-server tokens for service-to-service and Vertex AI calls) except the one genuine external secret, `PARALLEL_API_KEY`, which lives in Secret Manager, IAM-scoped to only `tour-data-api-sa`.
- **`beloved_icons.name` must never be a named real, living person** — both the curated seed data and the live-search synthesis prompts enforce "referenced generically" language. This is a content-safety rule, not just a style choice: it avoids likeness/IP risk and matches how Imagen-style image generation would need to be prompted if that feature is ever built (see `parallel_partner.md`'s brainstorm notes on mood-board images).
