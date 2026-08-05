"""Cloud Run entry point: tour_intelligence data + scoring tools.

Called by the Agent Builder Playbooks as OpenAPI tools. Every route does a
parameterized BigQuery query (never string-formatted SQL) so lookups are
deterministic and injection-safe, in place of the native Data Store's
semantic-search behavior which can't guarantee an exact row match.

sdk_logic/ is a deploy-time copy of /sdk at the repo root — Cloud Run source
deploys only build the given directory, so the three scoring modules are
duplicated here rather than imported across the deploy boundary. Keep them
in sync if the canonical /sdk versions change.
"""

from __future__ import annotations

import datetime
import os
import re
import time

import requests
from flask import Flask, jsonify, request
from google.cloud import bigquery
import parallel
from parallel import Parallel

from sdk_logic.enthusiasm_scoring import score_fan_enthusiasm
from sdk_logic.city_ranking import rank_cities
from sdk_logic.grounding_check import check_grounding

app = Flask(__name__)
_bq = bigquery.Client()
_DATASET = "tour_intelligence"

# The only cities with full seeded coverage (culture_notes, local_delight,
# fan_signals) — city_briefs are only trustworthy end-to-end for these until
# a live fallback exists for fan_signals too. New campaign_stops are
# restricted to this set so every stop the dashboard shows actually resolves.
_SUPPORTED_CITY_IDS = {"mumbai", "london", "tokyo", "sao_paulo", "new_york"}

_GCP_PROJECT = os.environ.get("GCP_PROJECT", "liifecalling-academy")
_VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
_PARALLEL_API_KEY = os.environ.get("PARALLEL_API_KEY")
# The Parallel partner-track requirement names three qualifying integration
# paths (official SDK, a supported framework integration, or a Grounding
# configuration) — a hand-rolled requests.post satisfies the spirit of "call
# the live API at runtime" but not the letter of the rule, so this uses the
# official parallel-web SDK rather than raw REST.
_parallel_client = Parallel(api_key=_PARALLEL_API_KEY) if _PARALLEL_API_KEY else None

_cached_access_token: str | None = None
_cached_access_token_at = 0.0
_ACCESS_TOKEN_TTL_S = 45 * 60


def _get_access_token() -> str:
    """OAuth2 access token for the Cloud Run service's own identity, used to
    call Vertex AI (Gemini). Distinct from the ID tokens used elsewhere in
    this project to call sibling Cloud Run services — Google APIs need an
    access token with the cloud-platform scope, not an audience-bound ID
    token."""
    global _cached_access_token, _cached_access_token_at
    now = time.time()
    if _cached_access_token and now - _cached_access_token_at < _ACCESS_TOKEN_TTL_S:
        return _cached_access_token
    res = requests.get(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
        timeout=2,
    )
    res.raise_for_status()
    _cached_access_token = res.json()["access_token"]
    _cached_access_token_at = now
    return _cached_access_token


def _slugify(city_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city_name.strip().lower()).strip("-")


_PLACE_NAME_MAX_LENGTH = 100
_PLACE_NAME_ALLOWED_EXTRA_CHARS = set(" '.-,")


class PlaceNameValidationError(ValueError):
    pass


def _validate_place_name(name: str, field_name: str) -> str:
    """city_name/country come straight from the request body and are
    interpolated into both the Parallel Search objective/search_queries and
    the Gemini synthesis prompt — a prompt-injection surface. A real place
    name is letters (any script), spaces, and a small set of punctuation;
    nothing else, and nothing that lets an attacker smuggle in fake
    instructions (newlines, braces, colons, etc.) or a wall of text."""
    stripped = name.strip()
    if not stripped:
        raise PlaceNameValidationError(f"{field_name} must not be empty")
    if len(stripped) > _PLACE_NAME_MAX_LENGTH:
        raise PlaceNameValidationError(f"{field_name} must be {_PLACE_NAME_MAX_LENGTH} characters or fewer")
    if not all(ch.isalpha() or ch in _PLACE_NAME_ALLOWED_EXTRA_CHARS for ch in stripped):
        raise PlaceNameValidationError(f"{field_name} contains characters that aren't allowed in a place name")
    return stripped


def _parallel_search(city_name: str, country: str | None) -> list[dict]:
    if not _parallel_client:
        raise RuntimeError("PARALLEL_API_KEY is not configured on this service")
    place = f"{city_name}, {country}" if country else city_name
    # search_queries: 2-3 short (3-6 word) keyword phrases per Parallel's own
    # best-practice guidance — diverse angles, never full sentences. objective
    # is the one field that should read like natural language.
    search = _parallel_client.search(
        objective=(
            f"Cultural etiquette, greeting customs, media behavior, and fan "
            f"interaction norms for a touring musician or actor visiting "
            f"{place}, including respectful conduct and things to avoid."
        ),
        search_queries=[
            f"{place} etiquette customs",
            f"{place} greeting customs",
            f"{place} concert fan behavior",
        ],
        mode="advanced",
    )
    return [
        {"url": r.url, "title": r.title, "excerpts": r.excerpts}
        for r in search.results
    ]


def _local_delight_search(city_name: str, country: str | None) -> list[dict]:
    if not _parallel_client:
        raise RuntimeError("PARALLEL_API_KEY is not configured on this service")
    place = f"{city_name}, {country}" if country else city_name
    search = _parallel_client.search(
        objective=(
            f"Local-language greeting phrases, cultural touchstones, and safe "
            f"crowd-moment ideas for a touring musician or actor performing in "
            f"{place}, suitable for a respectful on-stage shout-out."
        ),
        search_queries=[
            f"{place} common greeting phrases",
            f"{place} cultural touchstones",
            f"{place} local music scene",
        ],
        mode="advanced",
    )
    return [
        {"url": r.url, "title": r.title, "excerpts": r.excerpts}
        for r in search.results
    ]


def _call_gemini_json(prompt: str, response_schema: dict) -> dict:
    url = (
        f"https://{_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/"
        f"{_GCP_PROJECT}/locations/{_VERTEX_LOCATION}/publishers/google/models/"
        f"{_GEMINI_MODEL}:generateContent"
    )
    res = requests.post(
        url,
        headers={"Authorization": f"Bearer {_get_access_token()}", "Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": response_schema,
                "temperature": 0.2,
            },
        },
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    import json

    return json.loads(text)


def _query(sql: str, params: list[bigquery.ScalarQueryParameter]) -> list[bigquery.table.Row]:
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    return list(_bq.query(sql, job_config=job_config).result())


@app.get("/culture_notes")
def culture_notes():
    city_id = request.args.get("city_id")
    if not city_id:
        return jsonify({"error": "missing required query param: city_id"}), 400
    rows = _query(
        f"SELECT city_id, etiquette_notes, greeting_style, media_behavior_notes, "
        f"fan_interaction_style, dos, donts, humor_boundaries "
        f"FROM `{_DATASET}.culture_notes` WHERE city_id = @city_id",
        [bigquery.ScalarQueryParameter("city_id", "STRING", city_id)],
    )
    if not rows:
        return jsonify({"error": f"no culture_notes record for city_id={city_id}"}), 404
    r = rows[0]
    return jsonify({
        "city_id": r["city_id"],
        "etiquette_notes": r["etiquette_notes"],
        "greeting_style": r["greeting_style"],
        "media_behavior_notes": r["media_behavior_notes"],
        "fan_interaction_style": r["fan_interaction_style"],
        "dos": list(r["dos"] or []),
        "donts": list(r["donts"] or []),
        "humor_boundaries": r["humor_boundaries"],
    })


@app.post("/live_culture_search")
def live_culture_search():
    """Fallback for cities with no tour_intelligence.culture_notes row.

    Calls Parallel's Search API for live grounding excerpts, then a single
    Gemini call (schema-constrained JSON output) synthesizes them into the
    same shape /culture_notes returns for seeded cities, so callers (the
    Culture Intelligence Playbook, grounding_check, the dashboard) don't need
    to special-case a "live" source. The response is explicitly marked
    source="parallel_live" with citations, and stays deliberately general
    when excerpts are thin rather than inventing specifics — mirroring the
    same "don't fabricate" instruction the seeded-data path already follows.
    """
    payload = request.get_json(silent=True) or {}
    city_name = payload.get("city_name")
    if not city_name:
        return jsonify({"error": "missing required field: city_name"}), 400
    country = payload.get("country")

    try:
        city_name = _validate_place_name(city_name, "city_name")
        if country:
            country = _validate_place_name(country, "country")
    except PlaceNameValidationError as e:
        return jsonify({"error": str(e)}), 400

    try:
        results = _parallel_search(city_name, country)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Search API call failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    if not results:
        return jsonify({
            "city_id": _slugify(city_name),
            "source": "parallel_live",
            "confidence": "low",
            "etiquette_notes": None,
            "greeting_style": None,
            "media_behavior_notes": None,
            "fan_interaction_style": None,
            "dos": [],
            "donts": [],
            "humor_boundaries": None,
            "citations": [],
            "notice": "No live search results found for this city — no grounded guidance available.",
        })

    excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n"
        + "\n".join(r.get("excerpts") or [])
        for r in results[:8]
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "etiquette_notes": {"type": "STRING"},
            "greeting_style": {"type": "STRING"},
            "media_behavior_notes": {"type": "STRING"},
            "fan_interaction_style": {"type": "STRING"},
            "dos": {"type": "ARRAY", "items": {"type": "STRING"}},
            "donts": {"type": "ARRAY", "items": {"type": "STRING"}},
            "humor_boundaries": {"type": "STRING"},
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": [
            "etiquette_notes", "greeting_style", "media_behavior_notes",
            "fan_interaction_style", "dos", "donts", "humor_boundaries", "confidence",
        ],
    }
    prompt = (
        "You are a cultural-intelligence analyst briefing a touring musician or "
        f"actor ahead of a stop in {city_name}. Using ONLY the web search excerpts "
        "below, produce grounded cultural guidance in the exact JSON schema given.\n\n"
        "Rules:\n"
        "- Do not invent facts not supported by the excerpts.\n"
        "- Do not name specific living individuals, brands, or venues — keep guidance "
        "general and safe (e.g. describe a category of custom, not a named person).\n"
        "- If the excerpts are thin, contradictory, or mostly irrelevant, keep the "
        "guidance conservative and general, and set confidence to \"low\".\n"
        "- humor_boundaries should describe what kind of humor lands well vs. poorly.\n\n"
        f"SEARCH EXCERPTS:\n{excerpt_block}"
    )

    try:
        synthesized = _call_gemini_json(prompt, schema)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502

    return jsonify({
        "city_id": _slugify(city_name),
        "source": "parallel_live",
        "citations": [{"url": r.get("url"), "title": r.get("title")} for r in results[:8]],
        **synthesized,
    })


@app.get("/fan_signals")
def fan_signals():
    city_id = request.args.get("city_id")
    genre = request.args.get("genre")
    artist_type = request.args.get("artist_type")
    if not (city_id and genre and artist_type):
        return jsonify({"error": "missing required query params: city_id, genre, artist_type"}), 400
    rows = _query(
        f"SELECT city_id, genre, artist_type, enthusiasm_score, fan_behavior_style, "
        f"city_importance_tier, genre_affinity_notes, signal_basis "
        f"FROM `{_DATASET}.fan_signals` "
        f"WHERE city_id = @city_id AND genre = @genre AND artist_type = @artist_type",
        [
            bigquery.ScalarQueryParameter("city_id", "STRING", city_id),
            bigquery.ScalarQueryParameter("genre", "STRING", genre),
            bigquery.ScalarQueryParameter("artist_type", "STRING", artist_type),
        ],
    )
    if not rows:
        return jsonify({"error": f"no fan_signals record for city_id={city_id}, genre={genre}, artist_type={artist_type}"}), 404
    r = rows[0]
    return jsonify({
        "city_id": r["city_id"],
        "genre": r["genre"],
        "artist_type": r["artist_type"],
        "enthusiasm_score": r["enthusiasm_score"],
        "fan_behavior_style": r["fan_behavior_style"],
        "city_importance_tier": r["city_importance_tier"],
        "genre_affinity_notes": r["genre_affinity_notes"],
        "signal_basis": r["signal_basis"],
    })


@app.get("/local_delight")
def local_delight():
    city_id = request.args.get("city_id")
    if not city_id:
        return jsonify({"error": "missing required query param: city_id"}), 400
    rows = _query(
        f"SELECT city_id, local_phrases, cultural_references, beloved_icons, "
        f"crowd_moment_suggestions, music_or_remix_ideas "
        f"FROM `{_DATASET}.local_delight` WHERE city_id = @city_id",
        [bigquery.ScalarQueryParameter("city_id", "STRING", city_id)],
    )
    if not rows:
        return jsonify({"error": f"no local_delight record for city_id={city_id}"}), 404
    r = rows[0]
    return jsonify({
        "city_id": r["city_id"],
        "local_phrases": [dict(p) for p in (r["local_phrases"] or [])],
        "cultural_references": list(r["cultural_references"] or []),
        "beloved_icons": [dict(i) for i in (r["beloved_icons"] or [])],
        "crowd_moment_suggestions": list(r["crowd_moment_suggestions"] or []),
        "music_or_remix_ideas": list(r["music_or_remix_ideas"] or []),
    })


@app.post("/live_local_delight_search")
def live_local_delight_search():
    """Fallback for cities with no tour_intelligence.local_delight row.

    Mirrors /live_culture_search's pattern exactly: Parallel Search for live
    grounding excerpts, then a schema-constrained Gemini call synthesizes the
    same shape /local_delight returns for seeded cities. beloved_icons.name
    must stay generic ("a respected local figure...") never a named real
    person — the same discipline the curated seed data already follows, and
    the same reasoning that keeps live_culture_search's guidance general
    rather than depicting/naming specific individuals.
    """
    payload = request.get_json(silent=True) or {}
    city_name = payload.get("city_name")
    if not city_name:
        return jsonify({"error": "missing required field: city_name"}), 400
    country = payload.get("country")

    try:
        city_name = _validate_place_name(city_name, "city_name")
        if country:
            country = _validate_place_name(country, "country")
    except PlaceNameValidationError as e:
        return jsonify({"error": str(e)}), 400

    try:
        results = _local_delight_search(city_name, country)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Search API call failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    if not results:
        return jsonify({
            "city_id": _slugify(city_name),
            "source": "parallel_live",
            "confidence": "low",
            "local_phrases": [],
            "cultural_references": [],
            "beloved_icons": [],
            "crowd_moment_suggestions": [],
            "music_or_remix_ideas": [],
            "citations": [],
            "notice": "No live search results found for this city — no grounded guidance available.",
        })

    excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n"
        + "\n".join(r.get("excerpts") or [])
        for r in results[:8]
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "local_phrases": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "phrase": {"type": "STRING"},
                        "phonetic": {"type": "STRING"},
                        "meaning": {"type": "STRING"},
                        "usage_context": {"type": "STRING"},
                    },
                    "required": ["phrase", "phonetic", "meaning", "usage_context"],
                },
            },
            "cultural_references": {"type": "ARRAY", "items": {"type": "STRING"}},
            "beloved_icons": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "domain": {"type": "STRING"},
                        "reference_note": {"type": "STRING"},
                    },
                    "required": ["name", "domain", "reference_note"],
                },
            },
            "crowd_moment_suggestions": {"type": "ARRAY", "items": {"type": "STRING"}},
            "music_or_remix_ideas": {"type": "ARRAY", "items": {"type": "STRING"}},
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": [
            "local_phrases", "cultural_references", "beloved_icons",
            "crowd_moment_suggestions", "music_or_remix_ideas", "confidence",
        ],
    }
    prompt = (
        "You are a local-culture analyst briefing a touring musician or actor "
        f"ahead of a stop in {city_name}. Using ONLY the web search excerpts "
        "below, produce local-delight guidance in the exact JSON schema given.\n\n"
        "Rules:\n"
        "- Do not invent facts not supported by the excerpts.\n"
        "- beloved_icons.name must NEVER be a named real, living individual — "
        "describe a category generically instead (e.g. \"a widely loved local "
        "musician, referenced generically\"), exactly like a respectful, "
        "non-specific reference, never an actual name.\n"
        "- local_phrases must be genuinely usable on stage (a greeting, a "
        "thank-you, or a short crowd call-out), with an honest phonetic spelling.\n"
        "- If the excerpts are thin, contradictory, or mostly irrelevant, return "
        "fewer items rather than inventing specifics, and set confidence to \"low\".\n\n"
        f"SEARCH EXCERPTS:\n{excerpt_block}"
    )

    try:
        synthesized = _call_gemini_json(prompt, schema)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502

    return jsonify({
        "city_id": _slugify(city_name),
        "source": "parallel_live",
        "citations": [{"url": r.get("url"), "title": r.get("title")} for r in results[:8]],
        **synthesized,
    })


@app.get("/campaigns")
def get_campaign():
    campaign_id = request.args.get("campaign_id")
    if not campaign_id:
        return jsonify({"error": "missing required query param: campaign_id"}), 400
    rows = _query(
        f"SELECT campaign_id, title, campaign_type, genre, talent_roster, status "
        f"FROM `{_DATASET}.campaigns` WHERE campaign_id = @campaign_id",
        [bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id)],
    )
    if not rows:
        return jsonify({"error": f"no campaign record for campaign_id={campaign_id}"}), 404
    r = rows[0]
    return jsonify({
        "campaign_id": r["campaign_id"],
        "title": r["title"],
        "campaign_type": r["campaign_type"],
        "genre": r["genre"],
        "talent_roster": list(r["talent_roster"] or []),
        "status": r["status"],
    })


@app.get("/campaigns_list")
def list_campaigns():
    rows = _query(
        f"SELECT campaign_id, title, campaign_type, genre, talent_roster, status "
        f"FROM `{_DATASET}.campaigns` ORDER BY created_at DESC",
        [],
    )
    return jsonify({
        "campaigns": [
            {
                "campaign_id": r["campaign_id"],
                "title": r["title"],
                "campaign_type": r["campaign_type"],
                "genre": r["genre"],
                "talent_roster": list(r["talent_roster"] or []),
                "status": r["status"],
            }
            for r in rows
        ]
    })


@app.post("/campaigns")
def create_campaign():
    payload = request.get_json(silent=True) or {}
    required = ["campaign_id", "title", "campaign_type", "genre"]
    missing = [f for f in required if f not in payload]
    if missing:
        return jsonify({"error": f"missing required field(s): {', '.join(missing)}"}), 400

    row = {
        "campaign_id": payload["campaign_id"],
        "title": payload["title"],
        "campaign_type": payload["campaign_type"],
        "genre": payload["genre"],
        "talent_roster": payload.get("talent_roster") or [],
        "status": payload.get("status", "active"),
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.campaigns", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"campaign_id": row["campaign_id"], "status": "inserted"})


@app.get("/campaign_stops")
def campaign_stops():
    campaign_id = request.args.get("campaign_id")
    if not campaign_id:
        return jsonify({"error": "missing required query param: campaign_id"}), 400
    rows = _query(
        f"SELECT s.city_id, c.city_name, s.stop_date, s.sequence_order, s.event_format "
        f"FROM `{_DATASET}.campaign_stops` s JOIN `{_DATASET}.cities` c USING (city_id) "
        f"WHERE s.campaign_id = @campaign_id ORDER BY s.sequence_order",
        [bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id)],
    )
    return jsonify({
        "campaign_id": campaign_id,
        "stops": [
            {
                "city_id": r["city_id"],
                "city_name": r["city_name"],
                "stop_date": r["stop_date"].isoformat() if r["stop_date"] else None,
                "sequence_order": r["sequence_order"],
                "event_format": r["event_format"],
            }
            for r in rows
        ],
    })


@app.post("/campaign_stops")
def create_campaign_stops():
    payload = request.get_json(silent=True) or {}
    campaign_id = payload.get("campaign_id")
    stops = payload.get("stops")
    if not campaign_id or not stops:
        return jsonify({"error": "missing required field(s): campaign_id, stops"}), 400

    unsupported = sorted({s.get("city_id") for s in stops if s.get("city_id") not in _SUPPORTED_CITY_IDS})
    if unsupported:
        return jsonify({
            "error": f"unsupported city_id(s): {', '.join(unsupported)}. Supported: {sorted(_SUPPORTED_CITY_IDS)}"
        }), 400

    rows = [
        {
            "campaign_id": campaign_id,
            "city_id": s["city_id"],
            "stop_date": s.get("stop_date"),
            "sequence_order": s.get("sequence_order"),
            "event_format": s.get("event_format"),
        }
        for s in stops
    ]
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.campaign_stops", rows)
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"campaign_id": campaign_id, "status": "inserted", "count": len(rows)})


@app.get("/city_briefs")
def list_city_briefs():
    campaign_id = request.args.get("campaign_id")
    city_id = request.args.get("city_id")
    if not campaign_id:
        return jsonify({"error": "missing required query param: campaign_id"}), 400

    params = [bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id)]
    city_filter = ""
    if city_id:
        city_filter = "AND city_id = @city_id"
        params.append(bigquery.ScalarQueryParameter("city_id", "STRING", city_id))

    # Take the most recent row per city — reruns can produce more than one brief
    # for the same city_id (harmless duplicates, see orchestration_driver notes).
    rows = _query(
        f"SELECT brief_id, campaign_id, city_id, generated_at, status, enthusiasm_score, "
        f"culture_summary, local_delight_summary, talent_brief_json, grounding_check_passed, "
        f"grounding_check_notes, delight_card_url FROM `{_DATASET}.city_briefs` "
        f"WHERE campaign_id = @campaign_id {city_filter} "
        f"QUALIFY ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY generated_at DESC) = 1",
        params,
    )
    return jsonify({
        "campaign_id": campaign_id,
        "briefs": [
            {
                "brief_id": r["brief_id"],
                "campaign_id": r["campaign_id"],
                "city_id": r["city_id"],
                "generated_at": r["generated_at"].isoformat() if r["generated_at"] else None,
                "status": r["status"],
                "enthusiasm_score": r["enthusiasm_score"],
                "culture_summary": r["culture_summary"],
                "local_delight_summary": r["local_delight_summary"],
                "talent_brief_json": r["talent_brief_json"],
                "grounding_check_passed": r["grounding_check_passed"],
                "grounding_check_notes": r["grounding_check_notes"],
                "delight_card_url": r["delight_card_url"],
            }
            for r in rows
        ],
    })


@app.post("/city_briefs")
def insert_city_brief():
    payload = request.get_json(silent=True) or {}
    required = ["brief_id", "campaign_id", "city_id", "status"]
    missing = [f for f in required if f not in payload]
    if missing:
        return jsonify({"error": f"missing required field(s): {', '.join(missing)}"}), 400

    row = {
        "brief_id": payload["brief_id"],
        "campaign_id": payload["campaign_id"],
        "city_id": payload["city_id"],
        "generated_at": payload.get("generated_at"),
        "status": payload["status"],
        "enthusiasm_score": payload.get("enthusiasm_score"),
        "culture_summary": payload.get("culture_summary"),
        "local_delight_summary": payload.get("local_delight_summary"),
        "talent_brief_json": payload.get("talent_brief_json"),
        "grounding_check_passed": payload.get("grounding_check_passed"),
        "grounding_check_notes": payload.get("grounding_check_notes"),
        "delight_card_url": payload.get("delight_card_url"),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.city_briefs", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"brief_id": row["brief_id"], "status": "inserted"})


@app.post("/score_enthusiasm")
def score_enthusiasm_route():
    payload = request.get_json(silent=True) or {}
    base_signal = payload.get("base_signal")
    if not base_signal:
        return jsonify({"error": "missing required field: base_signal"}), 400
    result = score_fan_enthusiasm(
        base_signal,
        live_signal_score=payload.get("live_signal_score"),
        live_signal_weight=payload.get("live_signal_weight", 0.3),
    )
    return jsonify(result)


@app.post("/rank_cities")
def rank_cities_route():
    payload = request.get_json(silent=True) or {}
    city_records = payload.get("city_records")
    if city_records is None:
        return jsonify({"error": "missing required field: city_records"}), 400
    return jsonify({"ranked": rank_cities(city_records)})


@app.post("/check_grounding")
def check_grounding_route():
    payload = request.get_json(silent=True) or {}
    draft_brief_text = payload.get("draft_brief_text")
    donts = payload.get("donts")
    if draft_brief_text is None or donts is None:
        return jsonify({"error": "missing required field(s): draft_brief_text, donts"}), 400
    return jsonify(check_grounding(draft_brief_text, donts, payload.get("humor_boundaries")))
