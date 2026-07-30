# 🎬 Agentic Cinema: The Blockbuster Hackathon

> **Lights. Camera. Code.**

**Hosted by:** Google Cloud + Devpost  
**Status:** Open for submissions  
**Deadline:** September 8, 2026 @ 2:30 AM IST  
**Participants:** 1,421+ (as of July 2026)  
**Format:** Online, Public  
**Source:** [https://agentic-cinema.devpost.com/](https://agentic-cinema.devpost.com/)

---

## 🌐 What Is Agentic Cinema?

Agentic Cinema is a first-of-its-kind **Summer Blockbuster Hackathon** organized by **Google Cloud** and managed by **Devpost**. It invites developers, architects, and AI builders to create production-ready autonomous AI agents that solve real-world enterprise problems in the **media and entertainment industry**, powered by **Gemini** and the **Google Cloud Agent Builder** platform.

The hackathon is themed around the movie industry — you're not just writing code, you're **directing an autonomous AI crew**.

**Themes:** Databases · Machine Learning/AI · Open Ended

---

## 🎯 Roles You Can Play

| Role | Description |
|---|---|
| 🎬 **Director** | Build production-ready autonomous agent networks |
| 🎛️ **Technical Producer** | Connect secure data pipelines via managed MCP servers |
| 🏛️ **Studio Head** | Enforce Cloud IAM security & governance across multi-agent workflows |

---

## ✅ Eligibility

- Must be **above the legal age of majority** in your country of residence
- Some **countries/territories are excluded** — check the [full rules](https://agentic-cinema.devpost.com/rules)
- **Team size:** Maximum 4 eligible individuals
- You can participate solo or as a team

---

## 🏆 Prizes — The Box Office

Total Prize Pool: **$75,000 USD** *(updated 2026-07-30 — was $10,000/IBM-only as of July 28)*

Five **identical** partner-track prize buckets. Each track is judged independently — you compete *only* against others in your chosen track.

| Place | Prize (per track, ×5 tracks) |
|---|---|
| 🥇 1st Place | $7,500 cash (+ social media promotion opportunity) |
| 🥈 2nd Place | $4,500 cash |
| 🥉 3rd Place | $3,000 cash |

**Partner tracks (all 5 now announced):** IBM · Grafana · Parallel · ClickHouse · Replit

---

## 🛠️ What to Build

Your mission: **Build a functional, production-ready AI agent or multi-agent network** that:

- Is **powered by Gemini** and **Google Cloud Agent Builder**
- Integrates a **Partner Entity's MCP server**
- Solves critical bottlenecks across the **entertainment and media value chain**
- Targets real workflows of **filmmakers, screenwriters, studio crews, or fans**

### Current Partners *(all 5 confirmed as of 2026-07-30)*
- **IBM** — [Resources](https://agentic-cinema.devpost.com/details/ibm-resources) — IBM Bob (dev-time coding assistant), process/pass-fail requirement, no runtime architecture footprint. See `ibm_partner.md`.
- **Grafana** — [Resources](https://agentic-cinema.devpost.com/details/grafana-resources) — Grafana Cloud MCP server (60+ tools: PromQL/LogQL queries, dashboard search, alert/IRM management); optional AI Observability add-on for tracking the agent's own LLM calls/cost/latency. Must actively call the MCP server at runtime. OAuth 2.1, Editor+ role required.
- **Parallel** — [Resources](https://agentic-cinema.devpost.com/details/parallel-resources) — Search/Extract/Task/Monitor APIs for live web research and grounding; official `parallel-web` SDK, MCP server, and a documented **Gemini Enterprise grounding integration**. Must actively call the Search API at runtime (mentioning it in docs doesn't count).
- **ClickHouse** — [Resources](https://agentic-cinema.devpost.com/details/clickhouse-resources) — `mcp-clickhouse` MCP server against ClickHouse Cloud/self-hosted; optional Agent Skills for schema/query design; $400 signup credit (promo `SIGNUP100`). Must actively query ClickHouse at runtime via the MCP server.
- **Replit** — [Resources](https://agentic-cinema.devpost.com/details/replit-resources) — requires building with Replit Agent *and* hosting the final deployed project on a `replit.app`/`replit.dev` domain. Details otherwise still thin ("to be added soon").

---

## 🎬 Production Goals (Core Technical Requirements)

### 1. Beyond the Script — Action-Driven Agents
Your agent must **act**, not just chat. It needs to:
- Execute **multi-step tool calls**
- Update dynamic databases
- Trigger cloud functions
- Interact with live web services via partner APIs or connectors

### 2. The Multi-Agent Ensemble
Move beyond isolated assistants:
- Build an architecture with **sub-agents** that plan steps
- Handle distinct sub-tasks
- **Securely hand off state** to complete complex enterprise goals

### 3. Studio-Grade Security
Demonstrate enterprise-readiness:
- Safely respect **user boundaries**
- Handle **context window token efficiency**
- Remain **grounded** (no hallucination in production-critical flows)
- Use **Google Cloud IAM** and native security primitives

---

## 🏗️ How to Build — The Tech Stack

### Google Cloud Agent Builder (No-Code UI)
> Your **main stage**.
- Orchestrate autonomous agents
- Define roles via **Playbooks**
- Set up **safety guardrails** — no local environment overhead needed
- 🔗 [Google Cloud Agent Builder](https://cloud.google.com/products/agent-builder)

### Agent Builder Data Stores
- Drop cinematic datasets directly (scripts, box office data, review logs)
- Supports **PDFs, websites, or BigQuery tables**
- Zero-config grounding — no manual embedding pipelines
- 🔗 [BigQuery](https://cloud.google.com/bigquery)

### Enterprise Agent Platform SDK
- Use the native **Python library** alongside:
  - **Cloud Run** — host custom integration backends
  - **Secret Manager** — secure your API keys and credentials
- 🔗 [Cloud Run](https://cloud.google.com/run) · [Secret Manager](https://cloud.google.com/secret-manager)

### 💡 Pro Tip: Use the Console Emulator
Don't waste time setting up a local IDE. Use the **built-in Console Emulator** inside the Google Cloud UI to:
- Rapidly prototype
- Iterate on prompts
- Test partner tool integrations live in the browser

---

## 📋 Submission Requirements

To submit a valid project, you must provide:

- [ ] URL to the **hosted project**
- [ ] A **3-minute demo video** ("The Trailer")
- [ ] URL to a **public open-source code repository** (must include an open-source license file visible in the About section)
- [ ] Selection of which **partner track** you're submitting to
- [ ] Completed **Devpost submission form**

🔗 [Submit your project](https://devpost.com/submit-to/30721-agentic-cinema-the-blockbuster-hackathon/manage/submissions)

---

## ⚖️ Judging Criteria

| Criterion | Description |
|---|---|
| 🛠️ **Technological Implementation** | How well is the project built? How effectively does it use Google Cloud and Partner services? |
| 🎨 **Design** | Does it deliver a complete, coherent product experience — not just a technical proof of concept? |
| 🌍 **Potential Impact** | Does it make a credible case for solving a real problem for a real audience? |
| 💡 **Quality of the Idea** | Is this a creative, non-obvious use of Google Cloud and Partner services? Does the team understand the problem space? |

> Full judge panel to be announced soon.

---

## 🔑 How to Win — The Greenlight Strategy

1. **Cast Your Co-Star** — Choose the partner platform that holds the data or application workflows your agent needs to interact with
2. **Build with Gemini Enterprise** — Build your agentic workflow on Google Cloud using the Gemini Enterprise Agent Platform; connect to your partner tool via enterprise pipelines, API frameworks, or managed protocol adapters
3. **Dominate Your Track** — Show a deterministic, multi-step agent that solves enterprise friction; you'll be judged *exclusively* against others in your chosen partner track

---

## 👥 Community & Teammates

- 🔗 [Browse participants & find teammates](https://agentic-cinema.devpost.com/participants)
- 💬 [Join the Devpost Discord](https://discord.gg/7Dqk5ebCD4)
- 🔗 [Hackathon Discussions Forum](https://agentic-cinema.devpost.com/forum_topics)

---

## 📅 Key Dates

| Event | Date |
|---|---|
| Hackathon Active | Now |
| **Submission Deadline** | **September 8, 2026 @ 2:30 AM IST** |
| Days Remaining | ~41 days (as of July 28, 2026) |

🔗 [Full schedule](https://agentic-cinema.devpost.com/details/dates)

---

## 🔗 Important Links

| Resource | Link |
|---|---|
| Hackathon Overview | [agentic-cinema.devpost.com](https://agentic-cinema.devpost.com/) |
| Rules | [Full Rules](https://agentic-cinema.devpost.com/rules) |
| Resources | [Resources Page](https://agentic-cinema.devpost.com/resources) |
| Project Gallery | [Project Gallery](https://agentic-cinema.devpost.com/project-gallery) |
| IBM Partner Resources | [IBM Details](https://agentic-cinema.devpost.com/details/ibm-resources) |
| Grafana Partner Resources | [Grafana Details](https://agentic-cinema.devpost.com/details/grafana-resources) |
| Parallel Partner Resources | [Parallel Details](https://agentic-cinema.devpost.com/details/parallel-resources) |
| ClickHouse Partner Resources | [ClickHouse Details](https://agentic-cinema.devpost.com/details/clickhouse-resources) |
| Replit Partner Resources | [Replit Details](https://agentic-cinema.devpost.com/details/replit-resources) |
| Find Teammates | [Participants Page](https://agentic-cinema.devpost.com/participants) |
| Discord | [discord.gg/7Dqk5ebCD4](https://discord.gg/7Dqk5ebCD4) |
| Google Cloud Agent Builder | [cloud.google.com/products/agent-builder](https://cloud.google.com/products/agent-builder) |
| Gemini Enterprise | [cloud.google.com/gemini](https://cloud.google.com/gemini) |
| BigQuery | [cloud.google.com/bigquery](https://cloud.google.com/bigquery) |
| Cloud Run | [cloud.google.com/run](https://cloud.google.com/run) |
| Secret Manager | [cloud.google.com/secret-manager](https://cloud.google.com/secret-manager) |

---

> *Last updated: July 30, 2026 | Source: [https://agentic-cinema.devpost.com/](https://agentic-cinema.devpost.com/)*
