# Agent Builder (Dialogflow CX) — Playbooks & Tools

**See `AGENT_PROTOCOL.md` in this same directory for the full inter-agent contract** — exact input/output params per playbook, the reachability graph, function-calling conventions, error/low-confidence semantics, and the trust boundary. This file covers provisioning mechanics; that one covers the actual agent-to-agent protocol.

The YAML files here (`playbooks/*.yaml`, `openapi/*.yaml`) are **source-of-truth drafts**, not live config that auto-syncs. The actual running system is a Dialogflow CX Agent provisioned via direct REST calls (v3beta1) — editing a YAML file here does nothing to production until you also PATCH or recreate the corresponding live resource.

## Provisioning method: raw REST, not Terraform
Terraform's `google_dialogflow_cx_playbook` resource doesn't support `input_parameter_definitions`/`output_parameter_definitions` at all — every playbook here relies on typed I/O params, so Terraform can't express this design. Use `curl` + `gcloud auth print-access-token`, with the `x-goog-user-project: liifecalling-academy` header set (ADC needs an explicit quota project or every call 403s with `SERVICE_DISABLED`/quota-project errors even when the API is enabled).

Agent resource: `projects/liifecalling-academy/locations/us-central1/agents/672c258a-7d63-4164-a4c6-a34f17490f53` (this ID is stable — the Agent itself has never been recreated, only Playbooks under it). **Playbook and Tool IDs are not stable** — see the bug below — don't trust an ID recorded in any doc or old memory without re-verifying:
```bash
TOKEN=$(gcloud auth print-access-token)
curl -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: liifecalling-academy" \
  "https://us-central1-dialogflow.googleapis.com/v3beta1/projects/liifecalling-academy/locations/us-central1/agents/672c258a-7d63-4164-a4c6-a34f17490f53/playbooks"
```

## Tool auth
`openApiSpec.authentication.serviceAgentAuthConfig: {serviceAgentAuth: "ID_TOKEN"}` — **not** `serviceAccountAuthConfig`, which Dialogflow rejects for non-Google-API endpoints ("Service account authentication is only supported for Google APIs"). This uses Dialogflow's own service agent identity, which must be granted `roles/run.invoker` directly on each target Cloud Run service.

## Parameter definitions
Use `typeSchema: {inlineSchema: {type: "STRING"}}` — the deprecated bare `type` field alone is rejected ("must set a type schema or parameter type").

## ⚠️ CRITICAL BUG: PATCH is broken on any Playbook with populated referencedTools/referencedPlaybooks
Confirmed twice now (2026-07-28 and 2026-07-30). Symptom: **any** PATCH — even a no-op `goal`-only change — fails with a misleading `Tool <id> does not exist under the agent <id>` (or the equivalent wording for a referenced playbook), even though a `GET` on that exact resource succeeds immediately before and after.

Ruled out (don't waste time re-checking these): OpenAPI spec size/validity (reverting to a smaller, known-good spec still fails), eventual consistency (waiting several minutes and retrying still fails), the `force` query param on DELETE (neither `?force=true` nor `{"force": true}` in the body works, despite the delete error message's wording suggesting one should).

**CREATE is unaffected** — a brand-new playbook referencing the same tool succeeds immediately. The only reliable fix is delete-and-recreate, in dependency order:
1. Repoint the Agent's `startPlaybook` away from whatever you're about to delete (Agent-level PATCH of just `startPlaybook` — this one genuinely works) to some other existing playbook as a placeholder.
2. Delete top-down: whichever playbook nothing else references first, working down to the one every reference chain terminates at. `DELETE .../playbooks/{id}` on a still-referenced playbook fails with a clear list of exactly which playbooks reference it — resolve that chain in order rather than fighting `force`.
3. Recreate bottom-up with fresh IDs (CREATE, not PATCH), wiring each new playbook's `referencedPlaybooks`/`referencedTools` to the newly-created IDs.
4. Repoint `startPlaybook` back to the new top-level playbook.

`displayName` must be unique per agent — the old playbook must actually be deleted (not left orphaned) before creating its replacement under the same display name.

## Current playbook shape (5 playbooks, 1 shared Tool + 1 renderer Tool)
Campaign Orchestrator (start playbook) → Culture Intelligence Agent, Fan Enthusiasm Agent, Local Delight Agent, Talent Prep Agent. Talent Prep Agent also references Culture Intelligence Agent directly (the grounding-check handoff — a genuine two-way dependency, not a strict pipeline). Culture Intelligence Agent has a `city_name` input param and a `liveCultureSearch` fallback step for cities with no seeded `culture_notes` row — see `/cloud_run/tour_data_api/CLAUDE.md` for what that tool actually does.

## Known platform limitations (see `/orchestration_driver/CLAUDE.md` for how the driver works around these)
- **Per-turn execution budget**: one `detectIntent` call chains roughly 3-5 sequential tool/playbook calls before returning a generic "Sorry something went wrong." Chaining two tool calls inside one *nested* sub-playbook invocation (e.g. `getCultureNotes` 404 → `liveCultureSearch` within Culture Intelligence Agent's own frame) reliably exceeds this — don't try to fix it by making the instruction text "smarter"; call the fallback tool directly from the driver instead.
- **Playbook stack-frame reachability**: once a conversation has descended into a sub-playbook's own frame, there's no path back up to invoke a sibling playbook — only the Orchestrator (or Talent Prep, for the grounding-check handoff specifically) can reach Culture Intelligence, not the reverse.
- **~8192-token per-session context ceiling**: a stalled, repeatedly-nudged conversation eventually hits `FAILED_PRECONDITION: Token limit exceeded`.
