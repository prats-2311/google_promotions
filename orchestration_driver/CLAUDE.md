# orchestration_driver — run_campaign.py conventions

Drives the Campaign Orchestrator Playbook to completion for each city in a campaign. This exists because three real Dialogflow CX Playbook platform limitations (documented in the file's own docstring and in `/agent_builder/CLAUDE.md`) make a single conversational `detectIntent` loop unreliable for a multi-step, multi-agent flow. Read the module docstring first — it's accurate and current.

## The core architecture: "LLM reasons, code acts"
Only use the LLM conversation to *gather* Culture Intelligence / Fan Enthusiasm / Local Delight's real outputs. Brief synthesis, the grounding check, delight-card rendering, and the BigQuery insert are all done as separate, deterministic code steps — ask the model for the draft brief as plain JSON text (no tool call, no playbook navigation needed), then call `checkGrounding` directly against `tour_data_api`. Apply this same split to any *new* capability that needs more than ~1-2 chained tool calls per turn — don't try to solve it by writing a cleverer prompt.

**2026-07-30 addition, following this exact pattern:** the gather loop's `culture_notes` step now has a direct HTTP fallback to `tour_data_api`'s `/live_culture_search` (`_live_culture_search_direct`) for cities with no seeded record. Chaining `getCultureNotes` (404) → `liveCultureSearch` inside one nested-playbook turn exceeds the per-turn execution budget in practice (confirmed via direct testing) even though the Playbook's own instructions correctly describe the fallback — so the driver calls it directly instead of relying on the conversational path to complete both calls in one turn.

## Known driver bugs already fixed here — keep the pattern when extending
- **`_tool_output` doesn't distinguish a tool's success from its error response** — both come back as a non-empty dict. Always check for an `"error"` key before trusting a tool result as real gathered data (see the `getCultureNotes` handling in `run_city` for the pattern: only populate `collected["culture_notes"]` when `"error" not in cn`).
- **The Orchestrator sometimes calls a sub-agent's underlying tool directly** (e.g. `getFanSignals`/`scoreEnthusiasm`) rather than through a wrapped `playbookInvocation` — check both `_playbook_output(...)` and `_tool_output(...)` when extracting a given agent's result, or you'll silently miss real, correct data sitting right there in the trace.

## Session management
- Session-reset-after-stuck-turns (`RESET_AFTER_STUCK_TURNS = 2`): once a conversation stalls, start a fresh session rather than let it grow toward the ~8192-token ceiling. Always re-inject already-known real values explicitly in the next prompt (`_next_step_prompt`/`_known_context`) — the model doesn't reliably recall its own earlier synthesized output across turns, or across a session reset.
- Only `AGENT_ID` is hardcoded as a constant — playbook IDs are **not**, since this driver talks to the Agent's session/conversation layer (routing via the Agent's active `startPlaybook`), not individual playbook resource names. If playbooks are ever recreated (see the PATCH bug in `/agent_builder/CLAUDE.md`), this driver needs no changes.
- `run_city(city_id, city_name, campaign_id, stop_date)` skips cities that already have a `status="final"` brief (`_brief_already_final`) — safe to re-run for a whole campaign; it won't duplicate finished work.

## Environment
No formal venv/requirements install story yet beyond ad hoc scratch venvs — `requirements.txt` here just lists `requests`. Worth formalizing if this driver gets reused/extended further.
