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

## 🧩 How this fits our architecture

Our stated, honest scope limit is curated/seeded BigQuery data for only 5 demo cities (see `CLAUDE.md`). Parallel Search/Extract adds a live path on top, without replacing that core:

- **New Cloud Run tool** (extends `tour_data_api`, or a small sibling service): `POST /live_culture_search` — calls Parallel's Search API (and Extract, for a promising result) for a city not in our seeded set, returns structured culture/fan-signal candidates.
- **Culture Intelligence Agent**: falls back to this tool when `city_id` isn't found in BigQuery, instead of failing or hallucinating.
- **Grounding check stays the safety net**: `sdk/grounding_check.py` validates Parallel-sourced claims the same way it validates BigQuery-sourced ones before a brief is finalized — reframes our existing "no hallucination" story as "no hallucination, even when the source is live web data," which is a stronger claim for judges than a static-data-only demo.
- **Gemini Enterprise grounding path (resource #1/#2 above)** is worth evaluating as a lower-code alternative to a hand-rolled Cloud Run wrapper — if Dialogflow CX Playbooks can call it as a native grounding source, that's less code to maintain and a more "platform-native" story for Technological Implementation.

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
