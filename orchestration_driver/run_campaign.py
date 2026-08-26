"""Drives the Campaign Orchestrator Playbook to completion for each city.

A single detectIntent turn hits a real per-turn execution budget in this
(preview) Playbooks API — verified during the Mumbai run, it can chain
roughly 3-5 sequential tool/playbook calls before returning a generic
"Sorry something went wrong" and needing a follow-up turn. Sessions also
have a hard ~8192-token context ceiling, so a non-progressing conversation
gets reset to a fresh session rather than left to grow indefinitely.

Deeper still: once the conversation has descended into a sub-playbook's own
frame (e.g. Culture Intelligence Agent), it has no path back up to invoke a
sibling playbook like Talent Prep Agent — only the Orchestrator or Talent
Prep itself can reach Culture Intelligence, not the reverse. Chasing that
conversationally proved unreliable, so this driver only uses the LLM
conversation to gather Culture Intelligence, Fan Enthusiasm, and Local
Delight's real outputs. The brief synthesis and grounding check are then
done as a separate, single-purpose step: ask the model to draft the brief
as plain JSON text (no tool call needed, no playbook navigation required),
then call checkGrounding directly against tour_data_api — the same
"LLM reasons, code acts" split already used for the render+insert steps.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import requests

PROJECT_ID = "liifecalling-academy"
LOCATION = "us-central1"
AGENT_ID = "672c258a-7d63-4164-a4c6-a34f17490f53"
AGENT_NAME = f"projects/{PROJECT_ID}/locations/{LOCATION}/agents/{AGENT_ID}"
API_BASE = f"https://{LOCATION}-dialogflow.googleapis.com/v3beta1"
DATASET = "tour_intelligence"
TOUR_DATA_API = "https://tour-data-api-602700957663.us-central1.run.app"
DELIGHT_RENDERER = "https://delight-card-renderer-602700957663.us-central1.run.app"

_METADATA_SA_BASE = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"


def _metadata_server_token(kind: str, audience: str | None = None) -> str:
    if kind == "access":
        url = f"{_METADATA_SA_BASE}/token"
    else:
        url = f"{_METADATA_SA_BASE}/identity?audience={urllib.parse.quote(audience or '', safe='')}"
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=2) as resp:
        body = resp.read().decode()
    return json.loads(body)["access_token"] if kind == "access" else body.strip()


def _auth_token(kind: str, audience: str | None = None) -> str:
    """A Cloud Run Job container has no gcloud CLI and no user credentials --
    only the job's attached service account, reachable via the instance
    metadata server. Falls back to an already-authenticated local gcloud
    session for local dev -- same dual-path pattern as dashboard/server/
    index.js's getIdentityToken()."""
    try:
        return _metadata_server_token(kind, audience)
    except (urllib.error.URLError, OSError, TimeoutError):
        if kind == "access":
            return subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
        cmd = ["gcloud", "auth", "print-identity-token"]
        if audience:
            cmd += ["--audiences", audience]
        return subprocess.check_output(cmd).decode().strip()


def _detect_intent(session_id: str, text: str, access_token: str) -> dict:
    url = f"{API_BASE}/{AGENT_NAME}/sessions/{session_id}:detectIntent"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "x-goog-user-project": PROJECT_ID,
            "Content-Type": "application/json",
        },
        json={"queryInput": {"text": {"text": text}, "languageCode": "en"}},
        timeout=180,
    )
    if not resp.ok:
        print("DETECT_INTENT ERROR BODY:", resp.text[:2000])
    resp.raise_for_status()
    return resp.json()


def _actions(resp: dict) -> list[dict]:
    return resp.get("queryResult", {}).get("generativeInfo", {}).get("actionTracingInfo", {}).get("actions", [])


def _tool_output(actions: list[dict], action_name: str) -> dict | None:
    result = None
    for a in actions:
        tu = a.get("toolUse")
        if tu and tu.get("action") == action_name:
            out = tu.get("outputActionParameters", {})
            result = out.get("200", out)
    return result


def _playbook_output(actions: list[dict], display_name: str) -> dict | None:
    result = None
    for a in actions:
        pi = a.get("playbookInvocation")
        if pi and pi.get("displayName") == display_name and pi.get("playbookState") == "OUTPUT_STATE_OK":
            result = pi.get("playbookOutput", {}).get("actionParameters")
    return result


def _passing_draft_brief(actions: list[dict]) -> str | None:
    for a in actions:
        tu = a.get("toolUse")
        if not (tu and tu.get("action") == "checkGrounding"):
            continue
        out = tu.get("outputActionParameters", {}).get("200", {})
        if out.get("grounding_check_passed"):
            return tu["inputActionParameters"]["requestBody"]["draft_brief_text"]
    return None


def _brief_sections(talent_brief_json: str) -> dict:
    try:
        parsed = json.loads(talent_brief_json)
    except (json.JSONDecodeError, TypeError):
        return {"lean_into": [], "avoid": [], "fan_questions": []}
    return {
        "lean_into": parsed.get("topics_to_lean_into", parsed.get("lean_into", [])),
        "avoid": parsed.get("topics_to_avoid", parsed.get("avoid", [])),
        "fan_questions": parsed.get("high_probability_fan_questions", parsed.get("fan_questions", [])),
    }


def _known_context(collected: dict) -> str:
    lines = []
    if collected.get("culture_summary"):
        lines.append(f"culture_summary: {collected['culture_summary']}")
    elif collected.get("culture_notes"):
        lines.append(f"culture_notes (raw): {json.dumps(collected['culture_notes'])}")
    if "enthusiasm_score" in collected:
        lines.append(
            f"enthusiasm_score: {collected['enthusiasm_score']}, "
            f"city_importance_tier: {collected.get('city_importance_tier')}, "
            f"fan_behavior_style: {collected.get('fan_behavior_style')}"
        )
    if collected.get("local_delight"):
        lines.append(f"local_delight_payload: {json.dumps(collected['local_delight'])}")
    return "\n".join(lines)


def _all_gathered(collected: dict) -> bool:
    return bool(
        (collected.get("culture_summary") or collected.get("culture_notes"))
        and "enthusiasm_score" in collected
        and collected.get("local_delight")
    )


def _next_step_prompt(city_name: str, collected: dict, stuck_on: bool = False) -> str:
    # The model doesn't reliably recall its own earlier synthesized output across
    # turns (or across a session reset) — always embed known values directly
    # rather than saying "already gathered" and hoping it remembers.
    context = _known_context(collected)
    prefix = f"Known data so far for {city_name} — use this directly, do not re-derive or ask for it:\n{context}\n\n" if context else ""
    force = (
        " Do not answer from memory or from anything you believe you already ran — actually invoke the "
        "playbook/tool again right now, in this turn, even if you think you already did."
        if stuck_on else ""
    )
    if not (collected.get("culture_summary") or collected.get("culture_notes")):
        action = f"Now run Culture Intelligence Agent for {city_name} with mode=generate."
    elif "enthusiasm_score" not in collected:
        action = f"Now run Fan Enthusiasm Agent for {city_name}."
    else:
        action = f"Now run Local Delight Agent for {city_name}."
    return prefix + action + force


def _extract_json_object(text: str) -> dict | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _synthesize_draft_brief(city_name: str, collected: dict, revision_notes: str | None = None) -> str:
    context = _known_context(collected)
    revision = (
        f"\n\nYour previous draft failed the grounding check for this reason: {revision_notes}\n"
        f"Revise the draft to resolve this — remove or reword anything that overlaps with the flagged rule."
        if revision_notes else ""
    )
    prompt = (
        f"Using only this known data for {city_name} (do not call any tools, just reason over this text):\n"
        f"{context}\n\n"
        f"Draft a talent brief as a single JSON object with exactly these keys: "
        f"topics_to_lean_into (array of strings), topics_to_avoid (array of strings), "
        f"pronounceable_local_lines (array of the exact phrase strings from local_delight_payload's "
        f"local_phrases), and high_probability_fan_questions (array of 3-5 strings). "
        f"Respond with ONLY the JSON object, no other text.{revision}"
    )
    resp = _detect_intent(f"synth-{int(time.time() * 1000)}", prompt, _auth_token("access"))
    texts = []
    for m in resp.get("queryResult", {}).get("responseMessages", []):
        if "text" in m:
            texts.extend(m["text"]["text"])
    return "\n".join(texts)


def _fetch_selected_metrics(campaign_id: str, identity_token: str) -> list[str]:
    resp = requests.get(
        f"{TOUR_DATA_API}/campaigns",
        headers={"Authorization": f"Bearer {identity_token}"},
        params={"campaign_id": campaign_id},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("selected_metrics") or []


def _live_city_demographics_search_direct(city_name: str, identity_token: str) -> dict:
    resp = requests.post(
        f"{TOUR_DATA_API}/live_city_demographics_search",
        headers={"Authorization": f"Bearer {identity_token}"},
        json={"city_name": city_name},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_key_metrics(city_id: str, city_name: str, selected_metrics: list[str], identity_token: str) -> dict | None:
    """Selected once per campaign (campaigns.selected_metrics), fetched once
    per city stop, purely deterministic -- no playbook/LLM turn involved, so
    none of the per-turn execution budget concerns documented in this
    module's docstring apply here. Curated lookup first, falling back to the
    live Parallel-Search-grounded route for cities with no seeded row, same
    pattern already proven for culture_notes above."""
    if not selected_metrics:
        return None
    resp = requests.get(
        f"{TOUR_DATA_API}/city_demographics",
        headers={"Authorization": f"Bearer {identity_token}"},
        params={"city_id": city_id},
        timeout=30,
    )
    if resp.status_code == 404:
        live = _live_city_demographics_search_direct(city_name, identity_token)
        print(f"[{city_id}] no seeded city_demographics — used live_city_demographics_search fallback (confidence={live.get('confidence')})")
        return live
    resp.raise_for_status()
    return resp.json()


def _live_culture_search_direct(city_name: str, identity_token: str) -> dict:
    resp = requests.post(
        f"{TOUR_DATA_API}/live_culture_search",
        headers={"Authorization": f"Bearer {identity_token}"},
        json={"city_name": city_name},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _check_grounding_direct(draft_brief_text: str, donts: list[str], humor_boundaries: str | None, identity_token: str) -> dict:
    resp = requests.post(
        f"{TOUR_DATA_API}/check_grounding",
        headers={"Authorization": f"Bearer {identity_token}"},
        json={"draft_brief_text": draft_brief_text, "donts": donts, "humor_boundaries": humor_boundaries},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_campaign_title(campaign_id: str, identity_token: str) -> str:
    resp = requests.get(
        f"{TOUR_DATA_API}/campaigns",
        headers={"Authorization": f"Bearer {identity_token}"},
        params={"campaign_id": campaign_id},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["title"]


def _fetch_campaign_stops(campaign_id: str, identity_token: str) -> list[dict]:
    resp = requests.get(
        f"{TOUR_DATA_API}/campaign_stops",
        headers={"Authorization": f"Bearer {identity_token}"},
        params={"campaign_id": campaign_id},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["stops"]


def _brief_already_final(campaign_id: str, city_id: str, identity_token: str) -> bool:
    """A Cloud Run Job container has no `bq` CLI either -- reuse tour_data_api's
    own /city_briefs route (already filters to the latest row per city) rather
    than shelling out."""
    resp = requests.get(
        f"{TOUR_DATA_API}/city_briefs",
        headers={"Authorization": f"Bearer {identity_token}"},
        params={"campaign_id": campaign_id, "city_id": city_id},
        timeout=30,
    )
    resp.raise_for_status()
    return any(b.get("status") == "final" for b in resp.json().get("briefs", []))


def run_city(
    city_id: str,
    city_name: str,
    campaign_id: str,
    stop_date: str,
    campaign_title: str,
    selected_metrics: list[str] | None = None,
    max_turns: int = 10,
) -> str | None:
    if _brief_already_final(campaign_id, city_id, _auth_token("identity", audience=TOUR_DATA_API)):
        print(f"[{city_id}] already has a final brief — skipping")
        return None

    # Phase 0: fetch any user-selected key metrics (literacy, income, top
    # interests, etc.) -- deterministic, no playbook turn, so it can happen
    # up front regardless of how the gather loop below goes.
    demographic_snapshot = _fetch_key_metrics(
        city_id, city_name, selected_metrics or [], _auth_token("identity", audience=TOUR_DATA_API)
    )

    def _fresh_session_id() -> str:
        return f"driver-{campaign_id}-{city_id}-{int(time.time() * 1000)}"

    session_id = _fresh_session_id()
    collected: dict = {}
    prompt = (
        f"Run the campaign orchestration for campaign_id {campaign_id}, {city_name} stop only: fetch "
        f"campaign and stop data, then run Culture Intelligence, Fan Enthusiasm, and Local Delight. "
        f"Proceed through every step without stopping for confirmation."
    )
    stuck_turns = 0
    # A single session's token budget is finite (observed ceiling: 8192 tokens) —
    # once stuck for a couple of turns, reset to a fresh session rather than let a
    # non-progressing conversation's history eventually blow that budget. Known
    # real values are re-injected explicitly in the next prompt, so nothing is lost.
    RESET_AFTER_STUCK_TURNS = 2

    for turn in range(max_turns):
        keys_before = set(collected.keys())
        if stuck_turns >= RESET_AFTER_STUCK_TURNS:
            session_id = _fresh_session_id()
            prompt = _next_step_prompt(city_name, collected, stuck_on=True)
            stuck_turns = 0
            print(f"[{city_id}] resetting to a fresh session after repeated stalls")
        resp = _detect_intent(session_id, prompt, _auth_token("access"))
        actions = _actions(resp)

        cn = _tool_output(actions, "getCultureNotes")
        if cn and "error" not in cn:
            collected["culture_notes"] = cn
        elif cn and "error" in cn and "culture_notes" not in collected:
            # No seeded record for this city. The Playbook's own conversational
            # fallback (getCultureNotes 404 -> liveCultureSearch, same turn) exceeds
            # the per-turn nested-tool-call budget in practice, so — same "LLM
            # reasons, code acts" split already used for brief synthesis below —
            # call the live Parallel-Search-grounded route directly via HTTP instead
            # of chasing a second conversational tool call.
            live = _live_culture_search_direct(city_name, _auth_token("identity", audience=TOUR_DATA_API))
            if live and "error" not in live:
                collected["culture_notes"] = live
                print(f"[{city_id}] no seeded culture_notes — used live_culture_search fallback (confidence={live.get('confidence')})")
        ci = _playbook_output(actions, "Culture Intelligence Agent")
        if ci and ci.get("culture_summary"):
            collected["culture_summary"] = ci["culture_summary"]
        ld = _tool_output(actions, "getLocalDelight")
        if ld:
            collected["local_delight"] = ld
        # scoreEnthusiasm's own tool output is the source of truth for these fields —
        # the Orchestrator sometimes calls it directly rather than through a wrapped
        # Fan Enthusiasm Agent playbookInvocation, so check both.
        fe = _playbook_output(actions, "Fan Enthusiasm Agent") or _tool_output(actions, "scoreEnthusiasm")
        if fe:
            collected.update(fe)
        print(f"[{city_id}] turn {turn + 1}: {len(actions)} actions, gathered={list(collected.keys())}")

        if _all_gathered(collected):
            break

        stuck_turns = stuck_turns + 1 if set(collected.keys()) == keys_before else 0
        prompt = _next_step_prompt(city_name, collected, stuck_on=(stuck_turns >= 1))
        time.sleep(2)
    else:
        print(f"[{city_id}] FAILED to gather culture/enthusiasm/local-delight data within {max_turns} turns")
        return None

    # Phase 2: synthesize the brief and run the grounding check deterministically —
    # this is the "code acts" half, avoiding further fragile playbook navigation.
    # tour_data_api and delight_card_renderer are separate Cloud Run services, so
    # each needs its own audience-bound identity token -- reusing one token across
    # both audiences was a latent bug in the original single-campaign version.
    tour_data_token = _auth_token("identity", audience=TOUR_DATA_API)
    donts = (collected.get("culture_notes") or {}).get("donts", [])
    humor_boundaries = (collected.get("culture_notes") or {}).get("humor_boundaries")

    revision_notes = None
    talent_brief_json = None
    for attempt in range(4):
        draft_text = _synthesize_draft_brief(city_name, collected, revision_notes)
        draft_json = _extract_json_object(draft_text)
        if not draft_json:
            print(f"[{city_id}] attempt {attempt + 1}: could not extract JSON from draft, retrying")
            revision_notes = "your last response wasn't valid JSON — return only the JSON object."
            continue
        check = _check_grounding_direct(json.dumps(draft_json), donts, humor_boundaries, tour_data_token)
        print(f"[{city_id}] grounding attempt {attempt + 1}: passed={check['grounding_check_passed']}")
        if check["grounding_check_passed"]:
            talent_brief_json = json.dumps(draft_json)
            break
        revision_notes = check["grounding_check_notes"]
    else:
        print(f"[{city_id}] FAILED to produce a passing brief after 4 attempts")
        return None

    collected["talent_brief_json"] = talent_brief_json
    brief_id = f"{campaign_id}-{city_id}-live-001"

    render_payload = {
        "brief_id": brief_id,
        "campaign_title": campaign_title,
        "city_id": city_id,
        "city_name": city_name,
        "stop_date": stop_date,
        "enthusiasm_score": collected.get("enthusiasm_score"),
        "fan_behavior_style": collected.get("fan_behavior_style"),
        "grounding_check_passed": True,
        "local_phrases": (collected.get("local_delight") or {}).get("local_phrases", [])[:3],
        "talent_brief": _brief_sections(collected["talent_brief_json"]),
    }
    delight_token = _auth_token("identity", audience=DELIGHT_RENDERER)
    render_resp = requests.post(
        DELIGHT_RENDERER, headers={"Authorization": f"Bearer {delight_token}"}, json=render_payload, timeout=60
    )
    render_resp.raise_for_status()
    delight_card_url = render_resp.json()["delight_card_url"]

    insert_payload = {
        "brief_id": brief_id,
        "campaign_id": campaign_id,
        "city_id": city_id,
        "status": "final",
        "enthusiasm_score": collected.get("enthusiasm_score"),
        "culture_summary": json.dumps(collected.get("culture_notes")),
        "local_delight_summary": json.dumps(collected.get("local_delight")),
        "talent_brief_json": collected["talent_brief_json"],
        "grounding_check_passed": True,
        "grounding_check_notes": "Automated driver: grounding check passed via live Playbook run.",
        "delight_card_url": delight_card_url,
        "demographic_snapshot_json": json.dumps(demographic_snapshot) if demographic_snapshot else None,
    }
    insert_resp = requests.post(
        f"{TOUR_DATA_API}/city_briefs", headers={"Authorization": f"Bearer {tour_data_token}"}, json=insert_payload, timeout=60
    )
    insert_resp.raise_for_status()
    print(f"[{city_id}] inserted brief {brief_id} — {delight_card_url}")
    return delight_card_url


if __name__ == "__main__":
    # CAMPAIGN_ID env var takes precedence -- that's how the Cloud Run Job
    # execution override passes it in when triggered from the dashboard; the
    # argv fallback is for local/manual runs.
    campaign_id = os.environ.get("CAMPAIGN_ID") or (sys.argv[1] if len(sys.argv) > 1 else "nova_horizon_2026")
    lookup_token = _auth_token("identity", audience=TOUR_DATA_API)
    campaign_title = _fetch_campaign_title(campaign_id, lookup_token)
    stops = _fetch_campaign_stops(campaign_id, lookup_token)
    selected_metrics = _fetch_selected_metrics(campaign_id, lookup_token)
    print(f"[{campaign_id}] {campaign_title!r} — {len(stops)} stop(s) to process, selected_metrics={selected_metrics}")
    for stop in stops:
        run_city(stop["city_id"], stop["city_name"], campaign_id, stop["stop_date"], campaign_title, selected_metrics)
