# Tour Intelligence — Agentic Tour & Promo Intelligence OS

> A film cast lands in Mumbai. The lead says two lines in Hindi, name-checks a beloved local icon, and the clip does more for the opening weekend than a month of paid media. That moment wasn't luck — someone researched it. **Tour Intelligence is the agent system that does that research for every stop, and then acts on it.**

Built for **Agentic Cinema: The Blockbuster Hackathon** (Google Cloud × Devpost) — **Parallel partner track**.

- **Live app:** https://tour-dashboard-602700957663.us-central1.run.app
- **Devpost:** https://devpost.com/software/tour-intelligence-agentic-tour-promo-intelligence-os
- **License:** [MIT](LICENSE)

---

## What it is

Global press tours and music tours fail city-by-city because nobody has time to research every city properly. A planner routing a 10-stop tour needs, per city: cultural etiquette, real local phrases with pronunciation, fan-behavior forecasts, venue logistics, visa lead-times, seasonal weather risk, customs rules for touring gear — and a talent brief the artist will actually read. In practice that research happens for two cities and gets template-copied for the rest.

Tour Intelligence replaces that with a network of **five Dialogflow CX Playbook agents** (Culture Intelligence, Fan Enthusiasm, Local Delight, Talent Prep, Campaign Orchestrator) that gather intelligence conversationally while **deterministic code does the synthesis, grounding checks, and every database write** — agents that act, not chat.

### Headline features

| Feature | What it does |
|---|---|
| **Executive Tour Book** | One click assembles the boss-facing campaign document — itinerary, per-market demographics with bar charts, cultural playbooks, activation plans, generated key art, playable entrance stings. Cmd+P *is* the PDF. |
| **Campaign-aware key art** | `gemini-3-pro-image` renders per-city poster art from *real* grounded local motifs; the exact prompt is shown in the UI — never fabricated reasoning. |
| **Lyria entrance stings** | A generated audio moment per city, composed from the city's own curated music cues. |
| **AI co-planner chats** | Schema-constrained Gemini turns fill a real form (create) or produce reviewable diffs (edit). Nothing writes to a live campaign until the planner applies. Voice input, private client-side attachments, history that survives refreshes and devices. |
| **Live-answer loop** | Gemini flags its own staleness (`needs_live_search`) or detects a film title (`detected_title`) → Parallel Search fetches the present tense → the reply regenerates with a "Live sources" citation row. |
| **Tour-risk intelligence** | Visa lead-times by nationality, seasonal weather risk, customs/ATA Carnet notes, and a planner-owned safety checklist with a named showstop manager (deliberately *not* AI-generated). |
| **Any city on Earth** | Five demo cities run on curated BigQuery data; every other city falls back to live Parallel research with citations — through the same grounding gate. |

---

## Architecture

![System architecture](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_system_architecture.png)
*The full system: planner surfaces → five Playbook agents → four Cloud Run services → BigQuery / Parallel / Gemini. Gold edges are the paths where agents act, not chat.*

![The grounding pipeline](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_grounding_pipeline.png)
*Curated path and live path converge on one deterministic `checkGrounding` gate. Parallel-sourced facts earn canon the same way curated rows do — rejected facts never enter a brief.*

![AI control at every layer](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_ai_control_layers.png)
*Left: three agent surfaces — Playbooks, an external MCP server, and Chrome WebMCP — sharing one audited tool contract. Right: the two-pass loop that refuses to answer time-sensitive questions from stale training data.*

### The five design rules

1. **"The LLM reasons, code acts."** Agents gather intelligence conversationally; synthesis, the grounding check, and every BigQuery write are deterministic code.
2. **Grounding is architectural, not a prompt instruction.** Every fact — curated or live — passes the same `checkGrounding` gate before entering a brief.
3. **Gemini reasons, Parallel grounds — never confused.** Live search runs exactly where a hallucination would be dangerous; instant Gemini everywhere else.
4. **Honest AI or no AI.** Brief traces come from real tool calls; key art shows its exact prompt; a live metric with zero results returns an honest `null`.
5. **Agents controllable by agents.** One tool contract, three surfaces: internal Playbooks, an external MCP server (`agent_mcp_server`), and the dashboard's own functions registered as WebMCP page tools.

### How Parallel is used (partner track)

Called at runtime via the official `parallel-web` SDK — see `cloud_run/tour_data_api/`:

| Task | Parallel surface |
|---|---|
| Culture / local delight / demographics for unseeded cities | **Search** → Gemini schema-constrained synthesis |
| Venue discovery, commute/customs notes, crew & vendors, visas, weather | **Search** |
| Film/franchise research + real-time questions in both chats | **Search** (Gemini-triggered) |
| Custom campaign metrics | **Search** (honest `null` on zero results) |
| Deep research when adding a brand-new city | **Task API** |
| Cultural-drift + safety monitoring after briefs exist | **Monitors** |

Every live result keeps its citations, passes prompt-injection validation on the way in (regex allowlists on every user-influenced field, built test-first), and passes `checkGrounding` on the way out.

---

## Repo layout

```
sdk/                      Canonical pure-logic modules (enthusiasm scoring, city ranking, grounding check)
cloud_run/
  tour_data_api/          The core OpenAPI tool: BigQuery reads/writes, Parallel + Gemini live-search
                          routes, chats, key art, Lyria stings, TTS  (Flask, Cloud Run)
  delight_card_renderer/  Renders delight cards + the Executive Tour Book to Cloud Storage (Jinja)
  agent_mcp_server/       Real MCP server (official Python SDK) exposing read-only tools to any agent
orchestration_driver/     "LLM reasons, code acts" campaign driver — runs the 5 Playbooks per city
agent_builder/            Playbook definitions, OpenAPI tool spec, the inter-agent protocol (AGENT_PROTOCOL.md)
bigquery/                 Schema + seeds (insert-only "latest revision wins" everywhere)
dashboard/                React 19 + TypeScript + Tailwind frontend ("Premiere Noir") + Express BFF
run_tests.sh              Full test suite: 413 tests (391 pytest + 22 vitest)
```

Each directory has its own `CLAUDE.md` with engineering conventions and deploy detail.

---

## Running it

### Prerequisites

- Python 3.11+, Node 20+, the `gcloud` CLI authenticated against a GCP project
- BigQuery dataset `tour_intelligence` created from `bigquery/schema.sql` (+ seeds)
- A [Parallel](https://parallel.ai) API key stored in Secret Manager as `parallel-api-key`
- Vertex AI (Gemini, Lyria) enabled; a public Cloud Storage bucket for rendered artifacts

### Tests (no cloud needed)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
./run_tests.sh          # 391 pytest + 22 vitest, all mocked — no GCP credentials required
```

### Dashboard locally

```bash
cd dashboard
npm install
npm run server          # Express BFF on :8080 (uses `gcloud auth print-identity-token` locally)
npm run dev             # Vite dev server, proxies /api to the BFF
```

### Deploying the services

All services are source-deployed with buildpacks to **us-central1**, each with a dedicated least-privilege service account (see `cloud_run/CLAUDE.md` for the auth topology):

```bash
gcloud run deploy tour-data-api        --source=cloud_run/tour_data_api        --region=us-central1
gcloud run deploy delight-card-renderer --source=cloud_run/delight_card_renderer --region=us-central1
gcloud run deploy agent-mcp-server     --source=cloud_run/agent_mcp_server     --region=us-central1 --no-allow-unauthenticated
gcloud run deploy tour-dashboard       --source=dashboard                      --region=us-central1
```

The five Playbooks are provisioned in Dialogflow CX (Agent Builder) from `agent_builder/playbooks/` with `agent_builder/openapi/tour_data_api.yaml` as their authenticated OpenAPI tool. A full campaign run is driven by:

```bash
.venv/bin/python orchestration_driver/run_campaign.py <campaign_id>
```

---

## Google Cloud stack

Gemini (Vertex AI) · Agent Builder / Dialogflow CX Playbooks · Cloud Run (4 services) · BigQuery · Cloud Storage · Secret Manager · Cloud IAM — plus Parallel Search/Task/Monitors, MCP, and Chrome WebMCP.

## License

[MIT](LICENSE) © 2026 Prateek Srivastava
