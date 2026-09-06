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
from concurrent.futures import ThreadPoolExecutor, as_completed

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


_DETECT_INTENT_RETRYABLE_STATUS_CODES = {429, 503}
_DETECT_INTENT_MAX_ATTEMPTS = 3
_DETECT_INTENT_RETRY_BACKOFF_SECONDS = 2


def _detect_intent(session_id: str, text: str, access_token: str) -> dict:
    """Retries a transient 429/503 from the Playbooks API up to
    _DETECT_INTENT_MAX_ATTEMPTS times -- a real, observed overload failure
    mode, distinct from the per-turn execution-budget limitation documented
    in this module's docstring (that one needs a fresh session, not a
    retry). A non-retryable status raises immediately."""
    url = f"{API_BASE}/{AGENT_NAME}/sessions/{session_id}:detectIntent"
    last_resp = None
    for attempt in range(_DETECT_INTENT_MAX_ATTEMPTS):
        if attempt:
            time.sleep(_DETECT_INTENT_RETRY_BACKOFF_SECONDS)
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
        if resp.ok:
            return resp.json()
        print("DETECT_INTENT ERROR BODY:", resp.text[:2000])
        if resp.status_code not in _DETECT_INTENT_RETRYABLE_STATUS_CODES:
            resp.raise_for_status()
        last_resp = resp
    last_resp.raise_for_status()


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
    raw_questions = parsed.get("high_probability_fan_questions", parsed.get("fan_questions", []))
    return {
        "lean_into": parsed.get("topics_to_lean_into", parsed.get("lean_into", [])),
        "avoid": parsed.get("topics_to_avoid", parsed.get("avoid", [])),
        # The delight card is a printable quick-reference, not where a full
        # talking point belongs -- just the question text here. The dashboard
        # reads talent_brief_json directly and shows suggested_response too.
        "fan_questions": [q["question"] if isinstance(q, dict) else q for q in raw_questions],
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
        f"local_phrases), and high_probability_fan_questions (array of 3-5 objects, each with "
        f"'question' — the likely fan/press question — and 'suggested_response' — a short, genuine "
        f"talking point the talent could actually say, grounded only in the known data above, never "
        f"inventing a fact or opinion the data doesn't support). "
        f"Respond with ONLY the JSON object, no other text.{revision}"
    )
    resp = _detect_intent(f"synth-{int(time.time() * 1000)}", prompt, _auth_token("access"))
    texts = []
    for m in resp.get("queryResult", {}).get("responseMessages", []):
        if "text" in m:
            texts.extend(m["text"]["text"])
    return "\n".join(texts)


def _synthesize_pronunciation_audio(phrases: list[str], identity_token: str) -> list[dict] | None:
    """Real Gemini TTS audio per local phrase -- a nice-to-have on top of the
    core brief, never allowed to block it. A failure here (TTS quota, a
    transient 5xx) degrades gracefully: the brief still finalizes with its
    text-only local_phrases, just without audio."""
    if not phrases:
        print("pronunciation audio: no phrases to synthesize, skipping")
        return None
    print(f"pronunciation audio: requesting {len(phrases)} phrase(s): {phrases}")
    try:
        resp = requests.post(
            f"{TOUR_DATA_API}/synthesize_pronunciation",
            headers={"Authorization": f"Bearer {identity_token}"},
            json={"phrases": phrases},
            timeout=60,
        )
        resp.raise_for_status()
        audio = resp.json()["audio"]
        print(f"pronunciation audio: got {len(audio)} result(s)")
        return audio
    except Exception as e:
        print(f"pronunciation audio synthesis failed, continuing without it: {type(e).__name__}: {e}")
        return None


def _style_notes_from_collected(collected: dict) -> str | None:
    """Grounded style signal for the moodboard image prompt -- built only
    from real gathered data (culture_notes' greeting style, local_delight's
    cultural references and crowd moments), never a generic default. None
    when nothing real is available to ground the prompt in."""
    culture_notes = collected.get("culture_notes") or {}
    local_delight = collected.get("local_delight") or {}
    parts = []
    if culture_notes.get("greeting_style"):
        parts.append(culture_notes["greeting_style"])
    if local_delight.get("cultural_references"):
        parts.append(", ".join(local_delight["cultural_references"]))
    if local_delight.get("crowd_moment_suggestions"):
        parts.append(", ".join(local_delight["crowd_moment_suggestions"][:2]))
    return "; ".join(parts) if parts else None


def _generate_style_moodboard(city_id: str, city_name: str, style_notes: str, identity_token: str) -> str | None:
    """Grounded local-style image generation -- a nice-to-have on top of the
    core brief, never allowed to block it. A failure here degrades
    gracefully: the brief still finalizes without a moodboard, same shape
    as _synthesize_pronunciation_audio above."""
    print(f"style moodboard: requesting for {city_name}")
    try:
        resp = requests.post(
            f"{TOUR_DATA_API}/generate_style_moodboard",
            headers={"Authorization": f"Bearer {identity_token}"},
            json={"city_id": city_id, "city_name": city_name, "style_notes": style_notes},
            timeout=60,
        )
        resp.raise_for_status()
        url = resp.json()["moodboard_url"]
        print(f"style moodboard: got {url}")
        return url
    except Exception as e:
        print(f"style moodboard generation failed, continuing without it: {type(e).__name__}: {e}")
        return None


def _fetch_venue_notes(venue_url: str, city_name: str, identity_token: str) -> str | None:
    """Stop-specific logistics via Parallel's Extract API, pointed at the
    venue/promoter URL the campaign creator supplied for this stop -- plus
    real nearest-airport/nearest-railway-station commute data. A
    nice-to-have on top of the core brief, never allowed to block it. A
    failure here (bad URL, extraction turning up nothing) degrades
    gracefully: the brief still finalizes without venue notes, same shape
    as pronunciation audio and the style moodboard above."""
    print(f"venue notes: extracting from {venue_url}")
    try:
        resp = requests.post(
            f"{TOUR_DATA_API}/extract_venue_info",
            headers={"Authorization": f"Bearer {identity_token}"},
            json={"urls": [venue_url], "city_name": city_name},
            timeout=60,
        )
        resp.raise_for_status()
        notes = resp.json()
        print(f"venue notes: got confidence={notes.get('confidence')}")
        return json.dumps(notes)
    except Exception as e:
        print(f"venue notes extraction failed, continuing without it: {type(e).__name__}: {e}")
        return None


_MIN_FINALIZED_STOPS_FOR_INSIGHTS = 2


def _synthesize_campaign_insights_step(campaign_id: str, identity_token: str, city_names: dict[str, str]) -> None:
    """Runs once at the end of run_campaign(), after every stop has had its
    chance to finalize -- a nice-to-have layered on top of the core per-city
    pipeline, never allowed to fail the whole campaign run. Needs at least
    two finalized stops or there's no cross-city pattern to find."""
    try:
        resp = requests.get(
            f"{TOUR_DATA_API}/city_briefs",
            headers={"Authorization": f"Bearer {identity_token}"},
            params={"campaign_id": campaign_id},
            timeout=30,
        )
        resp.raise_for_status()
        finalized = [b for b in resp.json().get("briefs", []) if b.get("status") == "final"]
        if len(finalized) < _MIN_FINALIZED_STOPS_FOR_INSIGHTS:
            print(f"[{campaign_id}] skipping campaign insights -- only {len(finalized)} finalized stop(s)")
            return

        cities_payload = [
            {
                "city_id": b["city_id"],
                "city_name": city_names.get(b["city_id"], b["city_id"]),
                "culture_summary": b.get("culture_summary"),
                "local_delight_summary": b.get("local_delight_summary"),
                "talent_brief_json": b.get("talent_brief_json"),
            }
            for b in finalized
        ]
        synth_resp = requests.post(
            f"{TOUR_DATA_API}/synthesize_campaign_insights",
            headers={"Authorization": f"Bearer {identity_token}"},
            json={"campaign_id": campaign_id, "cities": cities_payload},
            timeout=60,
        )
        synth_resp.raise_for_status()
        insights = synth_resp.json()["insights"]
        print(f"[{campaign_id}] campaign insights: {len(insights)} finding(s)")

        insert_resp = requests.post(
            f"{TOUR_DATA_API}/campaign_insights",
            headers={"Authorization": f"Bearer {identity_token}"},
            json={"campaign_id": campaign_id, "insights_json": json.dumps(insights)},
            timeout=30,
        )
        insert_resp.raise_for_status()
    except Exception as e:
        print(f"[{campaign_id}] campaign insights synthesis failed, continuing: {type(e).__name__}: {e}")


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


_MIN_PLAUSIBLE_ENTHUSIASM_SCORE = 1.0
_LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE = 35.0


def _sanitize_enthusiasm_score(score) -> float:
    """The Fan Enthusiasm Agent playbook's own instructions say to "return a
    low-confidence default" when no curated fan_signals row exists, but
    never pin down what that default actually IS on the real 0-100 scale --
    leaving the model free to invent a number. In practice this has produced
    garbage-scale values (observed: 0.2, clearly a 0-1-scale guess, not
    0-100). Deterministic code-side clamp instead of trusting the model's
    numeric judgment here, same "LLM reasons, code acts" split already used
    for brief synthesis and the live-search fallbacks in this driver."""
    try:
        value = float(score)
    except (TypeError, ValueError):
        return _LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE
    if value < _MIN_PLAUSIBLE_ENTHUSIASM_SCORE or value > 100:
        return _LOW_CONFIDENCE_DEFAULT_ENTHUSIASM_SCORE
    return round(value, 1)


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
    venue_url: str | None = None,
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

    raw_score = collected.get("enthusiasm_score")
    collected["enthusiasm_score"] = _sanitize_enthusiasm_score(raw_score)
    if collected["enthusiasm_score"] != raw_score:
        print(f"[{city_id}] enthusiasm_score {raw_score!r} was implausible — replaced with low-confidence default {collected['enthusiasm_score']}")

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
    local_phrases = (collected.get("local_delight") or {}).get("local_phrases", [])[:3]

    render_payload = {
        "brief_id": brief_id,
        "campaign_title": campaign_title,
        "city_id": city_id,
        "city_name": city_name,
        "stop_date": stop_date,
        "enthusiasm_score": collected.get("enthusiasm_score"),
        "fan_behavior_style": collected.get("fan_behavior_style"),
        "grounding_check_passed": True,
        "local_phrases": local_phrases,
        "talent_brief": _brief_sections(collected["talent_brief_json"]),
    }
    delight_token = _auth_token("identity", audience=DELIGHT_RENDERER)
    render_resp = requests.post(
        DELIGHT_RENDERER, headers={"Authorization": f"Bearer {delight_token}"}, json=render_payload, timeout=60
    )
    render_resp.raise_for_status()
    delight_card_url = render_resp.json()["delight_card_url"]

    pronunciation_audio = _synthesize_pronunciation_audio(
        [p["phrase"] if isinstance(p, dict) else p for p in local_phrases], tour_data_token
    )

    style_notes = _style_notes_from_collected(collected)
    style_moodboard_url = (
        _generate_style_moodboard(city_id, city_name, style_notes, tour_data_token) if style_notes else None
    )

    venue_notes_json = _fetch_venue_notes(venue_url, city_name, tour_data_token) if venue_url else None

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
        "pronunciation_audio_json": json.dumps(pronunciation_audio) if pronunciation_audio else None,
        "style_moodboard_url": style_moodboard_url,
        "venue_notes_json": venue_notes_json,
    }
    insert_resp = requests.post(
        f"{TOUR_DATA_API}/city_briefs", headers={"Authorization": f"Bearer {tour_data_token}"}, json=insert_payload, timeout=60
    )
    insert_resp.raise_for_status()
    print(f"[{city_id}] inserted brief {brief_id} — {delight_card_url}")
    return delight_card_url


# Cities within one campaign are genuinely independent -- each runs its own
# Dialogflow CX session with no shared state -- so they're dispatched
# concurrently rather than one-after-another. Bounded rather than unlimited:
# an unbounded fan-out for a large campaign would hammer the Playbooks API
# with that many simultaneous detectIntent conversations at once.
MAX_CONCURRENT_CITIES = int(os.environ.get("MAX_CONCURRENT_CITIES", "3"))


_RUN_CITY_MAX_ATTEMPTS = 2


def _run_city_safe(
    stop: dict, campaign_id: str, campaign_title: str, selected_metrics: list[str]
) -> tuple[str, str | None]:
    """Isolates one city's failure from the others -- cities run concurrently
    with no shared state, so one stop's unhandled exception must not take
    down sibling stops still in flight. Retries the whole city once: a
    total gather-loop or grounding-check exhaustion inside run_city() can be
    genuine Dialogflow CX Playbook-navigation flakiness under concurrent
    load rather than a real, reproducible problem with this city --
    empirically confirmed live (2026-09-06): a city that exhausted its
    10-turn budget inside a 3-city concurrent run succeeded cleanly in 3
    turns on an immediate solo re-run of the identical city."""
    city_id = stop["city_id"]
    for attempt in range(_RUN_CITY_MAX_ATTEMPTS):
        try:
            url = run_city(
                city_id, stop["city_name"], campaign_id, stop["stop_date"], campaign_title,
                selected_metrics, stop.get("venue_url"),
            )
        except Exception as e:
            print(f"[{city_id}] attempt {attempt + 1} FAILED with an unhandled exception: {e}")
            url = None
        if url:
            return city_id, url
        if attempt + 1 < _RUN_CITY_MAX_ATTEMPTS:
            print(f"[{city_id}] attempt {attempt + 1} produced no brief -- retrying once")
    return city_id, None


def run_campaign(campaign_id: str) -> dict[str, str | None]:
    """Dispatches every stop in a campaign concurrently -- real event-driven
    concurrency at the *inter-city* dispatch layer. The *intra-city* agent
    handoff inside run_city() (Culture Intelligence -> Fan Enthusiasm ->
    Local Delight) stays sequential on purpose: that ordering exists because
    of the real per-turn execution-budget and session-navigation platform
    limitations documented in this module's docstring, and concurrency
    doesn't fix a platform limit -- it would just mask it under one city's
    load and still hit it under another's. Only the outer loop -- cities
    that don't depend on each other's output at all -- benefits from running
    in parallel."""
    lookup_token = _auth_token("identity", audience=TOUR_DATA_API)
    campaign_title = _fetch_campaign_title(campaign_id, lookup_token)
    stops = _fetch_campaign_stops(campaign_id, lookup_token)
    selected_metrics = _fetch_selected_metrics(campaign_id, lookup_token)
    print(f"[{campaign_id}] {campaign_title!r} — {len(stops)} stop(s) to process, selected_metrics={selected_metrics}")

    if not stops:
        return {}

    results: dict[str, str | None] = {}
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_CITIES, len(stops))) as executor:
        futures = [
            executor.submit(_run_city_safe, stop, campaign_id, campaign_title, selected_metrics) for stop in stops
        ]
        for future in as_completed(futures):
            city_id, delight_card_url = future.result()
            results[city_id] = delight_card_url

    city_names = {s["city_id"]: s["city_name"] for s in stops}
    _synthesize_campaign_insights_step(campaign_id, lookup_token, city_names)
    return results


if __name__ == "__main__":
    # CAMPAIGN_ID env var takes precedence -- that's how the Cloud Run Job
    # execution override passes it in when triggered from the dashboard; the
    # argv fallback is for local/manual runs.
    campaign_id = os.environ.get("CAMPAIGN_ID") or (sys.argv[1] if len(sys.argv) > 1 else "nova_horizon_2026")
    run_campaign(campaign_id)
