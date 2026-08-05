# 🔎 Parallel Partner Resources — Agentic Cinema Hackathon

**Section:** Parallel Resources
**Hackathon:** Agentic Cinema: The Blockbuster Hackathon — Lights. Camera. Code.
**Source:** [Parallel Resources Page](https://agentic-cinema.devpost.com/details/parallel-resources)
**Chosen track for this project** — decided 2026-07-30, see `CLAUDE.md` strategic decisions.

---

## 🏢 About Parallel

Parallel builds web infrastructure purpose-made for AI agents: "a vertically integrated stack — from proprietary crawling and indexing to search, extraction, reasoning, and monitoring" for systems that need current, accurate web information rather than stale training data.

🔗 More info: [parallel.ai](http://parallel.ai)

---

## 📚 Parallel Resources for the Hackathon

### 1. Grounding with Parallel Search (Gemini Enterprise)
The official Google Cloud doc for wiring Parallel Search directly into **Gemini Enterprise Agent Platform** as a grounding source — this is the primary integration path for our stack (Dialogflow CX Playbooks + Cloud Run tools), not a generic SDK-only path.

🔗 [docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-parallel](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-parallel)

### 2. Parallel × Gemini Enterprise Integration Guide
Parallel's own side of the same integration, likely with request/response shape detail the Google doc omits.

🔗 [docs.parallel.ai/integrations/google-gemini-enterprise](https://docs.parallel.ai/integrations/google-gemini-enterprise)

### 3. Search API Quickstart
Core API: submit a natural-language query, get back ranked, current web results built for LLM consumption (not raw SERP scraping).

🔗 [docs.parallel.ai/search/search-quickstart](https://docs.parallel.ai/search/search-quickstart)

### 4. MCP Server
Official Parallel Search & Extract MCP server — an alternative integration path to direct API calls, if a Playbook/agent should call Parallel as an MCP tool rather than via our own Cloud Run wrapper.

🔗 [docs.parallel.ai/integrations/mcp/search-mcp](https://docs.parallel.ai/integrations/mcp/search-mcp)

### 5. Parallel CLI
Local CLI for testing queries before wiring them into code.

🔗 [docs.parallel.ai/integrations/cli](https://docs.parallel.ai/integrations/cli)

### 6. Extract API
Given a URL, returns full or compressed page content — useful for pulling the actual text of a news article, local venue page, or cultural reference once Search has located it.

🔗 [docs.parallel.ai/extract/extract-quickstart](https://docs.parallel.ai/extract/extract-quickstart)

### 7. Task API
High-volume enrichment/research — batch-style "go research N things and return structured results," a good fit if we ever want to bulk-generate culture notes for many cities at once rather than one at a time.

🔗 [docs.parallel.ai/task-api/task-quickstart](https://docs.parallel.ai/task-api/task-quickstart)

### 8. Monitor API
Tracks a URL or query over time and alerts on changes — potential fit for a "fan buzz is spiking" live-signal feature, though out of scope for MVP.

🔗 [docs.parallel.ai/monitor-api/monitor-quickstart](https://docs.parallel.ai/monitor-api/monitor-quickstart)

### 9. Parallel Playground
Browser-based console for testing queries against the real API without writing code first.

🔗 [platform.parallel.ai/login](https://platform.parallel.ai/login)

---

## 🎯 Parallel Track Requirements (Hackathon-Specific)

- Projects **must actively use Parallel's Search API at runtime** — via the official `parallel-web` SDK (Python/TypeScript), a supported integration (Vercel AI SDK, LangChain), or a Grounding configuration.
- **Simply referencing Parallel in documentation does not qualify** — real, executed code paths are required.
- No additional best-practices/judging-rubric guidance was published beyond the runtime-usage requirement (unlike IBM's track, which listed explicit "strong submission" criteria) — general hackathon judging criteria (Technological Implementation, Design, Potential Impact, Quality of Idea) apply as-is.

---

## 🧩 How this fits our architecture — LIVE as of 2026-07-30

This is built and verified, not just planned. What's actually running:

- **`POST /live_culture_search`** on the `tour_data_api` Cloud Run service — calls Parallel's Search API (`objective` + 4 targeted `search_queries` per city) for a city not in our seeded BigQuery set, then a single schema-constrained Gemini call (Vertex AI, `responseSchema` enforced) synthesizes the excerpts into the exact same shape `/culture_notes` returns for seeded cities (`etiquette_notes`, `greeting_style`, `media_behavior_notes`, `fan_interaction_style`, `dos`, `donts`, `humor_boundaries`), plus `source: "parallel_live"`, a `confidence` level, and real citation URLs. Verified live against Seoul, Berlin, and Lagos — none seeded, all returned real, well-cited, non-fabricated guidance.
- **Culture Intelligence Agent playbook** now has a `city_name` input param and an explicit instruction step: if `getCultureNotes` 404s, call `liveCultureSearch` instead and treat its output identically. Confirmed live: `getCultureNotes` genuinely 404s for an unseeded city and the model correctly reasons it should use the fallback.
- **Local Delight Agent playbook has the identical fallback** (`liveLocalDelightSearch` for cities with no `local_delight` row) — added 2026-07-30 after realizing this was the one agent still missing it, closing the last gap where a lazily hand-seeded new city could end up with generic/wrong-city content instead of genuinely researched local phrases and icons. Verified live for Nairobi (real Swahili phrases with correct phonetics, generically-described local musicians, not named individuals).
- **Input validation added at both live-search routes**: `city_name`/`country` are interpolated directly into Parallel/Gemini prompts, so a hand-rolled `requests`-free SDK call alone wasn't enough — added `_validate_place_name()` (letters + minimal punctuation only, ≤100 chars) after writing a failing test that proved the injection gap was real. See `cloud_run/tour_data_api/CLAUDE.md`.
- **Grounding check stays the safety net** — `sdk/grounding_check.py`/`checkGrounding` is source-agnostic (just takes `donts`/`humor_boundaries` as input), so it validates Parallel-sourced claims exactly the same way as BigQuery-sourced ones. "No hallucination, even when the source is live web data" — a stronger claim than a static-data-only demo.
- **`orchestration_driver/run_campaign.py` also calls this route directly** (`_live_culture_search_direct`), not just through the conversational Playbook path — chaining `getCultureNotes` (404) → `liveCultureSearch` in one nested playbook turn hits the same per-turn execution budget documented in [[project-backend-scaffold-status]], so the driver's gather loop falls back to a direct HTTP call the moment it sees a `getCultureNotes` error, mirroring the existing "LLM reasons, code acts" split already used for brief synthesis.
- **Secret Manager**: `PARALLEL_API_KEY` lives in the `parallel-api-key` secret, IAM-scoped to only `tour-data-api-sa`, mounted via `--set-secrets` at deploy time — this project's first real Secret Manager usage (previously everything was identity-based auth with no static credentials at all).
- **Gemini Enterprise's native grounding path (resource #1/#2 above) was not used** — went with a hand-rolled Cloud Run route instead, since it let the response be shaped exactly like `/culture_notes` (critical for not special-casing every downstream consumer) and kept the existing Cloud-Run-OpenAPI-tool architecture pattern consistent rather than introducing a second, differently-shaped grounding mechanism.

---

## 🔗 Quick Reference — All Parallel Links

| Resource | Link |
|---|---|
| Parallel Homepage | [parallel.ai](http://parallel.ai) |
| Grounding with Parallel Search (Google doc) | [docs.cloud.google.com/.../grounding-with-parallel](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-parallel) |
| Gemini Enterprise Integration Guide (Parallel doc) | [docs.parallel.ai/integrations/google-gemini-enterprise](https://docs.parallel.ai/integrations/google-gemini-enterprise) |
| Search API Quickstart | [docs.parallel.ai/search/search-quickstart](https://docs.parallel.ai/search/search-quickstart) |
| MCP Server | [docs.parallel.ai/integrations/mcp/search-mcp](https://docs.parallel.ai/integrations/mcp/search-mcp) |
| CLI | [docs.parallel.ai/integrations/cli](https://docs.parallel.ai/integrations/cli) |
| Extract API | [docs.parallel.ai/extract/extract-quickstart](https://docs.parallel.ai/extract/extract-quickstart) |
| Task API | [docs.parallel.ai/task-api/task-quickstart](https://docs.parallel.ai/task-api/task-quickstart) |
| Monitor API | [docs.parallel.ai/monitor-api/monitor-quickstart](https://docs.parallel.ai/monitor-api/monitor-quickstart) |
| Playground | [platform.parallel.ai/login](https://platform.parallel.ai/login) |

---

> *Last updated: July 30, 2026 | Source: [Parallel Resources — Agentic Cinema](https://agentic-cinema.devpost.com/details/parallel-resources)*
