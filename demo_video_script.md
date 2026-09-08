# Demo video script — 3:00 target

Devpost's own rule: "showing the project functioning as built, not a cinematic trailer" — so this is a real screen-recording walkthrough with voiceover, not staged footage. Record at the deployed URL (`https://tour-dashboard-602700957663.us-central1.run.app`), never localhost, so judges see the actual hosted product.

Opens cold on the problem, not a logo or intro card — judges watch dozens of these, so the hook has to land in the first 10 seconds. Then cuts straight into the live Campaign Dashboard, per the project's own demo-narrative doc: open on the planner's dashboard, not on a talent brief — Mumbai is the emotional climax, and the Executive Tour Book is the closing power move.

~420 words of VO ≈ 2:48 spoken at 150 wpm, leaving ~12s of buffer for cursor movement/transitions between beats. Pre-warm before recording: load every page once (fresh chunks), generate the Tour Book once (key art + book cache warm), and clear the edit-chat history so the suggestion chips show.

---

### [0:00–0:12] HOOK
**ON SCREEN:** black, then a generic "Tour Stop: Mumbai" placeholder flyer → cut
**VO:** *"Global tours flop in specific cities for a boring reason: nobody has time to research each one properly. We built an agent system that does — before the team lands."*

### [0:12–0:30] DASHBOARD
**ON SCREEN:** Campaign Dashboard, "Nova Horizon," KPI strip animating in, 5 neon city cards
**VO:** *"This is Nova Horizon — a five-city film promo tour, planned end-to-end by a real multi-agent system on Google Cloud. Enthusiasm scores, market tiers, grounding status — every number here is real data the agents wrote to BigQuery."*

### [0:30–0:55] AGENTS ACTING, NOT CHATTING
**ON SCREEN:** expand "How this brief was generated" trace on Mumbai → then click "Edit with assistant," type "Add a stop in Berlin this November," show the review-before-apply diff → Discard
**VO:** *"Five Dialogflow CX Playbook agents run this — Culture Intelligence, Fan Enthusiasm, Local Delight, Talent Prep, and an Orchestrator. Every step is a real tool call: BigQuery writes, live grounding checks, a genuine two-way handoff between agents. Even editing a live campaign is conversational — and nothing writes until the planner reviews the diff."*

### [0:55–1:20] PARALLEL, LIVE — partner-track proof
**ON SCREEN:** Add Cities → type "Seoul" → real citations appear
**VO:** *"It's not limited to curated cities either. Add any city — Seoul — and the system calls Parallel's Search API live, synthesizes with Gemini, and grounds every claim in real citations. Parallel-sourced facts pass the same grounding check as curated data before they're treated as canon. That's our partner track: called at runtime, not named in a README."*

### [1:20–2:00] MUMBAI — THE CLIMAX
**ON SCREEN:** City Detail → Mumbai → Delight tab: Hindi phrase flashcards with phonetics, then the Gemini key art → expand "How this key art was generated" (real prompt visible)
**VO:** *"Here's the emotional core: Mumbai. The system knows a folded-hands namaste lands better than a handshake, and hands the artist real phrases with pronunciation: 'Namaste Mumbai.' 'Kya haal hai, Mumbai?' It even generates campaign key art with Gemini — grounded in real local motifs, shaped by this tour's sci-fi genre — and shows its thinking: the exact signals it selected and the exact prompt it sent. No fabricated reasoning, anywhere."*

### [2:00–2:20] IT'S NOT JUST CHARM — IT'S RISK
**ON SCREEN:** quick cuts — Live Operations Checks: Visa & Border Timing, Seasonal Weather Risk, Safety Checklist with named showstop manager
**VO:** *"And it's not just charm — it's risk. Visa lead times, seasonal weather, a safety checklist with a named showstop manager — the unglamorous logistics that actually cancel tours."*

### [2:20–2:50] THE TOUR BOOK — CLOSING POWER MOVE
**ON SCREEN:** Dashboard → click "Tour Book" → the Executive Tour Book opens: cover with KPIs, itinerary, enthusiasm + population charts → scroll to Mumbai chapter (key art, market snapshot, activation plan) → hit ⌘P to show the print-ready light theme
**VO:** *"Then the finale: one click assembles the Executive Tour Book — the document a planner hands their boss. Itinerary, market data, per-city activation plans, the generated key art — every figure sourced from grounded campaign data. Command-P, and it's the PDF. What takes an agency team days of copy-paste, generated in seconds."*

### [2:50–3:00] CLOSE
**ON SCREEN:** stack card — Gemini · Agent Builder · Cloud Run · BigQuery · Parallel · deployed URL
**VO:** *"Tour Intelligence. Agents that act — grounded, verified, and shipped."*
