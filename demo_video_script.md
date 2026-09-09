# Demo video script — the "how it works & why" cut

Target 3:00 (Devpost). Core narration ≈ 460 words ≈ 3:00 at a relaxed 150wpm.
Each beat: **DO** (exact clicks) + **SAY** (verbatim VO) + *(why this beat exists)*.
An **EXTENDED CUT** section at the bottom adds optional deep-dive asides if you
decide to run longer — drop them in only if you're comfortable exceeding 3:00.

## Before you hit record (5 minutes)
1. Fresh Chrome window, default profile, hide bookmarks bar (⌘⇧B), 1920×1080-ish window.
2. Open these tabs in order and load each ONCE (warms chunks + caches):
   - `https://tour-dashboard-602700957663.us-central1.run.app/` (Nova Horizon active)
   - `/campaigns/new`
   - `/city/mumbai` (visit all 3 tabs once)
   - the Tour Book (click Tour Book once; keep the tab)
   - the Mumbai delight card artifact (from Delight tab link)
3. In the edit chat and strategy chat: confirm empty (suggestion chips showing).
4. Mic check; QuickTime → New Screen Recording (or OBS), record the Chrome window only.
5. Speak ~10% slower than feels natural. Pauses while clicking are fine — they read as confidence.

---

### BEAT 1 — the why, cold open [0:00–0:18]

**DO**
- Start on the Nova Horizon dashboard.
- Don't move the mouse yet.

**SAY**
- *"Global tours fail city-by-city for a boring reason: nobody has time to research every city properly."*
- *"Tour Intelligence is a multi-agent system on Google Cloud that does that research —"*
- *"— and everything you'll see is real data the agents fetched, verified, and wrote."*
- *"Nothing on this screen is mocked."*

*(Why: judges' #1 filter is "is this real or a chat wrapper". Claim it in sentence one, then spend 3 minutes proving it.)*

### BEAT 2 — creating a campaign, with the AI co-planner [0:18–0:55]

**DO**
- Sidebar → active-campaign switcher → **New Campaign**.
- Click a suggestion chip (or the mic button — mention it).
- Let the assistant reply; show the form fields filling live.
- Point at the "Researched …" line if a title was mentioned.

**SAY**
- *"Campaign creation starts with an AI co-planner."*
- *"Every turn is Gemini with a schema-constrained JSON response — that's why it can fill this real form live instead of just chatting."*
- *"And two things trigger a live Parallel web search mid-conversation:"*
- *"name a film or franchise, and it researches it with citations before replying;"*
- *"ask anything time-sensitive and it refuses to answer from stale training data — it searches, then answers with sources."*
- *"We route to live search only where grounding matters — that's the design rule everywhere:"*
- *"Gemini reasons, Parallel grounds, and the two are never confused."*

**DO (quick)**
- Point at the metrics section — add a custom metric chip.
- Open "Customize metrics for this stop" on one city.

**SAY**
- *"Planners aren't boxed in — six campaign types, their own custom metrics,"*
- *"even different metrics per city, resolved later by live search."*

*(Why: shows the assistant is an agent with structured outputs, not a chatbot; shows the two Parallel triggers and the reason they exist.)*

### BEAT 3 — what actually happens on create [0:55–1:30]

**DO**
- Back to dashboard (Nova Horizon).
- Open Mumbai → expand **"How this brief was generated"** (the 11-step trace).

**SAY**
- *"When briefs generate, five Dialogflow CX Playbook agents run —"*
- *"Culture Intelligence, Fan Enthusiasm, Local Delight, Talent Prep, and an Orchestrator."*
- *"Our core architecture rule is 'the LLM reasons, code acts':"*
- *"agents gather intelligence conversationally, but synthesis, the grounding check, and every BigQuery write are deterministic code."*
- *"Talent Prep even hands its draft BACK to Culture Intelligence for verification — a real two-way handoff."*
- *"And this trace isn't decoration: it's reconstructed from the actual tool calls."*
- *"We never fabricate reasoning, anywhere in this product."*

*(Why: this is the "agents that act" judging criterion plus the honesty discipline, delivered over a real artifact.)*

### BEAT 4 — country-specific intelligence & which Parallel powers what [1:30–2:05]

**DO**
- Stay on Mumbai. Culture tab: sweep past Greeting/Etiquette, Lean-Into/Avoid, Market Snapshot.
- Hover the Live Operations row (visa, weather, drift checks).
- Then Delight tab: phrase flashcards → the Gemini-3 key art.
- Expand **"How this key art was generated"**.
- Then click play on the **entrance sting**.

**SAY**
- *"Every city detail here is grounded, and the sourcing is deliberate."*
- *"Five demo cities run on curated BigQuery data — fast and deterministic."*
- *"Any OTHER city falls back to Parallel's Search API live:"*
- *"culture, local delight, demographics, venues, crew, visa lead-times by nationality, seasonal weather."*
- *"Parallel's Task API researches brand-new cities;"*
- *"Parallel Monitors continuously watch for cultural drift and safety issues after a brief is written."*
- *"Everything live still passes the same grounding check as curated data before it's trusted."*
- *"Then the generative layer: Gemini 3 renders each city's key art from those real motifs — and shows you the exact prompt it used."*
- *"And Lyria composes the entrance sting."* (let 2 seconds of the sting play)

*(Why: this is their question "which Parallel search for each task" answered on camera, plus the GenMedia trifecta with visible provenance.)*

### BEAT 5 — editing live campaigns, safely [2:05–2:25]

**DO**
- Back to dashboard → **Edit with assistant**.
- Type "Add a stop in Berlin on November 10th".
- Show the review diff.
- Click **Discard** (don't apply on camera).

**SAY**
- *"Ongoing campaigns are edited the same way — conversationally."*
- *"But this assistant writes to a LIVE campaign, so nothing applies until the planner reviews the exact diff."*
- *"Chat history survives refreshes and follows you across devices — it's stored in BigQuery like everything else."*

*(Why: agentic writes + human-in-the-loop; the safety design IS the feature.)*

### BEAT 6 — the Tour Book + the MCP story [2:25–2:50]

**DO**
- Click **Tour Book**.
- Scroll the cover (charts) then one chapter (key art, market snapshot, sting player).
- Press ⌘P for one second to flash the print view, then cancel.

**SAY**
- *"One click assembles the Executive Tour Book — the document a planner hands their boss."*
- *"Itinerary, market data, activation plans, the generated media."*
- *"Command-P and it's the PDF."*
- *"And the whole system is built for AI control at every layer:"*
- *"our agents consume these tools internally,"*
- *"a real MCP server exposes the same tools to any external agent,"*
- *"and through Chrome's WebMCP, the dashboard registers its own functions — create campaign, generate briefs — as tools a browser-side agent can drive directly."*
- *"Agents all the way down, by design."*

*(Why: their WebMCP/MCP ask — one breath, three layers, and the word "why".)*

### BEAT 7 — close [2:50–3:00]

**DO**
- Rest on the dashboard.

**SAY**
- *"Gemini, Agent Builder, Cloud Run, BigQuery, Parallel — Tour Intelligence."*
- *"Agents that act, grounded end to end."*

---

## Narration cheat-sheet: which Parallel surface powers which task
(keep beside you while recording — don't read it out, it's for confidence)

| Task | Parallel surface |
|---|---|
| Culture / local delight / demographics for unseeded cities | **Search** + Gemini schema-constrained synthesis |
| Venue discovery, venue commute/customs, local crew & vendors | **Search** |
| Visa lead-times, seasonal weather risk | **Search** |
| Franchise/title research in both chats | **Search** (triggered by Gemini's `detected_title`) |
| Real-time "what's trending right now" chat questions | **Search** (triggered by Gemini's `needs_live_search`) |
| Custom metric resolution ("cinema screens") | **Search** |
| New-city research in Add Cities | **Task API** |
| Cultural drift + safety monitoring after briefs exist | **Monitors** |
| Post-show outcome checks | **Search** (past-dated stops) |

## The "why" answers, if judges or viewers ask
- **Why explicit Search→Gemini instead of Vertex's native Parallel grounding tool?** We evaluated it; our outputs must be schema-constrained structured JSON (briefs, diffs, metrics) and must pass our own `checkGrounding` gate — the native tool does free-text QA.
- **Why insert-only BigQuery everywhere (edits, chat history, briefs)?** The streaming buffer blocks UPDATE/DELETE on fresh rows — so every change is a new revision and reads take latest-wins. Side effect: a full audit trail for free.
- **Why do chats only search on titles and current-events questions?** Latency and cost — live search exactly where a hallucination would be dangerous, instant Gemini everywhere else.
- **Why review-before-apply on edits?** The edit chat mutates a live campaign; the strategy chat only pre-fills a local form. Different blast radius, different UX.
- **Why show exact prompts for images/music?** Same no-fabricated-reasoning rule as the brief traces. If we generated it, you can see precisely from what.
- **Why do strategy attachments accept .txt/.md/.csv/.tsv/.json but not .docx/.pdf?** Deliberate scope, twice over. Attachments are read privately client-side (`FileReader`) — the document only ever exists in the planner's browser and the model prompt, never at rest on our servers — and that works only for plain-text formats. A .docx is a ZIP of XML; a .pdf is a binary object graph where scanned documents have no text layer at all, so client-side extraction (pdf.js) can silently return *empty text* while appearing to have read the doc — an honesty trap this product refuses everywhere else. The designed fix is server-side: a small upload endpoint handing the PDF straight to **Gemini's native PDF understanding** on Vertex (layout, tables, even scanned pages — no extraction library at all), deleted after the turn. Right feature, wrong final-day risk.

---

## EXTENDED CUT inserts (only if running past 3:00)
- **After Beat 2**: attach a `.csv` of stops to the strategy chat ("planners bring spreadsheets — it reads csv, tsv, markdown, json — capped at 200KB so nothing silently truncates in the model's context").
- **After Beat 4**: Add Cities page — type "Seoul", show real Task-API research phases and the honest "this takes a couple of minutes" copy.
- **After Beat 4**: ask the edit chat *"What's the trending social event in Tokyo right now?"* on camera and show the Live Sources row appear (~20s round trip — pre-tested, works).
- **After Beat 6**: terminal one-liner against the MCP server (IAM-gated 403 without a token, 200 with) to prove the server is real and secured.
