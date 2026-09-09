# Devpost submission — status of record

Project: `Tour Intelligence — Agentic Tour & Promo Intelligence OS`, project id 1420693,
https://devpost.com/software/tour-intelligence-agentic-tour-promo-intelligence-os

**Pushed live via the Devpost MCP on 2026-09-09** — do not re-paste the sections below by hand; they document what's already on the page:

- **About/description**: LIVE (project version 5). Rewritten around: the problem → problem size (PwC/Pollstar/CMI figures, incl. the +12.3% global vs +0.1% NA growth stat) → 5 key design insights → what it does → 3 embedded architecture diagrams with captions → Parallel surface-per-task table → Gemini leverage list → build/challenges/learnings/next. Test count updated to the verified 413 (391 pytest + 22 vitest).
- **Architecture diagrams**: 3 hand-built Premiere Noir SVG renders, hosted publicly and embedded inline (verified rendering on the live page):
  - https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_system_architecture.png
  - https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_grounding_pipeline.png
  - https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_ai_control_layers.png
- **Gallery**: 12 captioned images (dashboard, 3 diagrams, tour book cover + London chapter, key-art trace, Mumbai delight card, live-search chat, per-stop metrics, edit-chat restore, culture tab). Screenshot copies mirrored at `.../media/shot-*.jpg`.
- **Thumbnail**: custom square Premiere Noir title card, uploaded.
- **Links + built-with tags**: LIVE (25 tags, incl. webmcp + lyria).

**Still required before `submit_project`** (deliberately left to the user):
1. Record + upload the demo video (script: `demo_video_script.md`), then set `video_url`.
2. Answer the **[CONFIRM]** personal fields at the bottom of this file.
3. Give the explicit go-ahead to submit.

Fields marked **[CONFIRM]** are facts about you/your team, not the project — don't submit without checking them first.

---

## Step: Project overview

**Project name** (56/60 chars)
```
Tour Intelligence — Agentic Tour & Promo Intelligence OS
```

**Elevator pitch** (198/200 chars)
```
A multi-agent system that gives every tour stop its "Mumbai moment" -- live culture, fan, venue, and risk intelligence for entertainment tours, grounded via Parallel Search + Gemini on Google Cloud.
```

---

## Step: Project details

**Links**
```
https://tour-dashboard-602700957663.us-central1.run.app
https://github.com/prats-2311/google_promotions
```

**Built with** (tags)
```
gemini, google-cloud-agent-builder, dialogflow-cx, vertex-ai, cloud-run, bigquery, cloud-storage, secret-manager, iam, parallel-search-api, parallel-web-sdk, mcp, python, flask, react, typescript, vite, tailwindcss, node-js, express, pytest, vitest, jinja2
```

**Video URL**
Not recorded yet — see `demo_video_script.md` for the shot-by-shot script. Add the YouTube/Vimeo URL here once it's uploaded and public.

**About the project** (paste as Markdown — headers match Devpost's own template exactly)

```markdown
## Inspiration

Fans respond intensely when a global artist shows real local awareness — a line in Hindi, a nod to a beloved local icon, timing a joke to local humor. Most tours can't do this consistently because per-city cultural research takes hours a marketing team rarely has. We built an agent system that does that research automatically, and turns it into an actual operational brief — not just a chat answer.

## What it does

Tour Intelligence plans a multi-city entertainment tour (film press tour or music tour) end to end:

- **Culture Intelligence** — etiquette, greeting style, media/fan behavior, dos and don'ts per city
- **Fan Enthusiasm** — a scored, tiered prediction of audience energy per stop
- **Local Delight** — real local phrases with pronunciation, beloved local icons, crowd-moment suggestions
- **Talent Prep** — a grounded talking-points brief (what to lean into, what to avoid, likely fan questions), cross-checked back against Culture Intelligence before finalizing
- **Campaign Orchestrator** — coordinates all four, writes finalized briefs to BigQuery, and triggers a Cloud Run function that renders a shareable "delight card" artifact

The system also *acts* at the campaign level:

- **Executive Tour Book** — one click assembles the whole-campaign document a planner hands their boss: itinerary, per-market population/demographics with bar charts, venue logistics, cultural playbooks, and per-stop activation plans — with a print stylesheet so Cmd+P *is* the PDF
- **Campaign-aware key art** — Gemini generates per-city poster art grounded in real local motifs and shaped by the tour's genre, and the UI shows the agent's honest thinking: the exact grounded signals selected and the exact prompt sent (never a fabricated rationale)
- **Conversational campaign editing** — add/remove stops or change the genre by chatting; every change renders as a reviewable diff and nothing writes until the planner applies it
- **Durable assistant history** — conversations survive refreshes and network drops (localStorage tier) *and* follow the planner across devices (BigQuery-backed session tier)

Beyond culture, the same system surfaces the operational risks that actually cancel tours: visa/border lead times by nationality, seasonal weather risk, customs/ATA Carnet notes for touring equipment, and a planner-filled safety checklist with a named showstop manager.

The dashboard isn't limited to a handful of pre-seeded cities either — venue discovery, culture research, and local-delight research all fall back to a live Parallel Search + Gemini synthesis pass for any city on demand, each claim grounded in real citations.

## How we built it

Five Dialogflow CX Playbook agents (Google Cloud Agent Builder) coordinate over a Cloud Run OpenAPI tool backed by BigQuery for deterministic, parameterized data access — no hallucinated facts in the production-critical path. A real two-way agent handoff exists: Talent Prep sends its draft brief back to Culture Intelligence for a grounding check before the Orchestrator finalizes it, not a one-way pipeline.

Parallel's Search API, called via the official `parallel-web` SDK (not raw REST), powers every "beyond the seeded 5 cities" path: venue discovery, culture research, local delight, seasonal weather risk, visa/border timing, and customs notes. Each live search result is synthesized into a structured, schema-constrained answer by Gemini, then passes through the same grounding check as our curated BigQuery data before being treated as canon — Parallel-sourced facts aren't a second-class, less-verified data source. That's our partner track.

A dedicated Cloud Run service (`agent_mcp_server`) also exposes the same read-only tools over the official MCP Python SDK, so external agents — not just our own Playbooks — can query campaign, culture, and safety data directly.

Image generation runs on `gemini-2.5-flash-image` with prompts built *only* from real curated culture/delight signals plus the campaign context, content-hash cached in Cloud Storage. Campaign edits, chat sessions, and brief revisions all use the same insert-only "latest revision wins" BigQuery pattern — a deliberate answer to the streaming-buffer UPDATE/DELETE limitation, not a workaround bolted on later.

Google Cloud products used: Gemini (Vertex AI), Google Cloud Agent Builder / Dialogflow CX Playbooks, Cloud Run (4 services), BigQuery, Cloud Storage, Secret Manager (Parallel API key), Cloud IAM (per-service dedicated service accounts, resource-level `run.invoker` bindings, a custom minimal BigQuery role).

The frontend is a React 19 + TypeScript dashboard behind a thin Express BFF, so the browser never touches Google Cloud credentials directly.

## Challenges we ran into

Getting a genuine two-way agent handoff working (not just a linear pipeline) required rethinking how Talent Prep and Culture Intelligence share state. We also hit and fixed several real production bugs along the way: a React Query structural-sharing bug that silently stalled a live polling UI, Dialogflow CX Playbook-navigation flakiness under concurrent multi-city load (fixed with a targeted retry), and a latent auth bug where cached identity tokens outlived their actual validity on long-lived Cloud Run instances — masked for weeks by frequent redeploys, caught by live end-to-end verification, fixed with refresh-and-retry-once.

## Accomplishments that we're proud of

- A real, verified two-way inter-agent handoff, not a simulated one
- Live Parallel-backed research for any city, not just the 5 curated demo cities
- The one-click Executive Tour Book — the boss-facing campaign PDF, assembled from grounded data with generated key art
- Honest AI transparency end to end: real step traces for briefs AND the exact image-generation prompts, never reconstructed reasoning
- 413 automated tests (pytest + vitest), TDD throughout — including red-first tests for security fixes
- A dedicated MCP server exposing our tools to external agents

## What we learned

Grounding discipline has to be architectural, not a prompt instruction — routing every live-searched fact through the same `checkGrounding` step as curated data is what actually prevents a live web result from becoming an unverified claim in a finalized brief. We also learned that under concurrent load, Playbook-navigation flakiness is real and worth a retry-once safety net rather than treating every failure as a logic bug.

## What's next for Tour Intelligence — Agentic Tour & Promo Intelligence OS

Per-planner accounts so the server-backed chat history and safety checklists become user-scoped; a post-show learning loop that feeds real outcome data back into future enthusiasm scoring; and threading destination country through the full venue-extraction path so customs/ATA Carnet notes populate automatically during brief generation.
```

---

## Step: Additional info

Answers I can give confidently from the repo/deploy state:

```
Which partner track will you be building for?  ->  Parallel
Is your project new or existing prior to July 27, 2026?  ->  New
Please provide a URL to your open source code repository.  ->  https://github.com/prats-2311/google_promotions
Provide a URL to the hosted Project for judging and testing.  ->  https://tour-dashboard-602700957663.us-central1.run.app
What Google Cloud products did you use in this project?  ->  Gemini (Vertex AI), Google Cloud Agent Builder / Dialogflow CX Playbooks, Cloud Run, BigQuery, Cloud Storage, Secret Manager, Cloud IAM
Please list all other tools or products you used in your project.  ->  Parallel Search API (parallel-web SDK), Model Context Protocol (official Python SDK), React, TypeScript, Vite, Tailwind CSS, Express, Jinja2, pytest, vitest
Is this your first time using Grafana tools?  ->  N/A, I'm not submitting for the Grafana track.
Is this your first time using IBM tools?  ->  N/A, I am not submitting for the IBM track.
Is this your first time using Clickhouse tools?  ->  N/A, I am not submitting to the Clickhouse track.
Is this your first time using Replit tools  ->  N/A, I am not submitting to the Replit track.
```

**[CONFIRM]** — facts about you/your team, not guessed:

```
Submitter Type                          -> Individual, unless entering as a team
Organization name (if applicable)       -> "N/A" unless representing one
Government employee?                    -> Yes / No
Submitter Country of Residence          -> (IST usage suggests India — confirm)
Canada province                         -> "N/A" unless you reside in Canada
How many people total are on your team? -> only solo work seen this session; confirm real number (max 4)
Is this your first time using Parallel tools? -> your call
```

Repo license is already fine — GitHub auto-detects MIT on the public repo, so that requirement is satisfied without further action.
