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

import base64
import datetime
import hashlib
import io
import os
import re
import time
import wave

import requests
from flask import Flask, jsonify, request
from google.cloud import bigquery
from google.cloud import storage
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
_SEED_CITY_IDS = {"mumbai", "london", "tokyo", "sao_paulo", "new_york"}

_GCP_PROJECT = os.environ.get("GCP_PROJECT", "liifecalling-academy")
_VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
# Same-bar fallback: a transient overload on the primary model shouldn't take
# down every live-search/synthesis route. GEMINI_FALLBACK_MODEL is only ever
# reached after the primary has been retried once and still failed with a
# retryable status -- and its output is forced through the identical
# _validate_gemini_response gate before being accepted, so the fallback path
# never gets a lower quality bar than the primary just because it's the
# backup. See _call_gemini_json.
_GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")
_GEMINI_RETRYABLE_STATUS_CODES = {429, 503}
_PARALLEL_API_KEY = os.environ.get("PARALLEL_API_KEY")
# The Parallel partner-track requirement names three qualifying integration
# paths (official SDK, a supported framework integration, or a Grounding
# configuration) — a hand-rolled requests.post satisfies the spirit of "call
# the live API at runtime" but not the letter of the rule, so this uses the
# official parallel-web SDK rather than raw REST.
_parallel_client = Parallel(api_key=_PARALLEL_API_KEY) if _PARALLEL_API_KEY else None

# Gemini native TTS for local-phrase pronunciation audio -- a distinct model
# from _GEMINI_MODEL (text synthesis), so no same-bar fallback here: there's
# no second TTS-capable model configured, and a missing audio clip degrades
# gracefully (the phrase's text is still shown) rather than blocking a brief.
_GEMINI_TTS_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
_GEMINI_TTS_VOICE = os.environ.get("GEMINI_TTS_VOICE", "Kore")
_GEMINI_IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
_DELIGHT_CARD_BUCKET = os.environ.get("DELIGHT_CARD_BUCKET")
_storage_client = storage.Client() if _DELIGHT_CARD_BUCKET else None

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


def _validate_venue_name(name: str) -> str:
    """Same injection-surface reasoning as _validate_place_name, but venue
    names routinely include digits (O2 Arena, 3Arena) that a place name
    never would -- isalnum() instead of isalpha(), same length/charset
    discipline otherwise."""
    stripped = name.strip()
    if not stripped:
        raise PlaceNameValidationError("venue_name must not be empty")
    if len(stripped) > _PLACE_NAME_MAX_LENGTH:
        raise PlaceNameValidationError(f"venue_name must be {_PLACE_NAME_MAX_LENGTH} characters or fewer")
    if not all(ch.isalnum() or ch in _PLACE_NAME_ALLOWED_EXTRA_CHARS for ch in stripped):
        raise PlaceNameValidationError("venue_name contains characters that aren't allowed in a venue name")
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


def _demographics_search(city_name: str, country: str | None) -> list[dict]:
    if not _parallel_client:
        raise RuntimeError("PARALLEL_API_KEY is not configured on this service")
    place = f"{city_name}, {country}" if country else city_name
    search = _parallel_client.search(
        objective=(
            f"Literacy rate, population, median age, median household income, "
            f"internet/social-media usage, top entertainment interests, and "
            f"notable public holidays for {place}, from authoritative public "
            f"sources (census, government, or widely-cited statistics sites)."
        ),
        search_queries=[
            f"{place} literacy rate population",
            f"{place} median household income",
            f"{place} social media usage interests",
        ],
        mode="advanced",
    )
    return [
        {"url": r.url, "title": r.title, "excerpts": r.excerpts}
        for r in search.results
    ]


def _gemini_request(model: str, prompt: str, response_schema: dict) -> dict:
    url = (
        f"https://{_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/"
        f"{_GCP_PROJECT}/locations/{_VERTEX_LOCATION}/publishers/google/models/"
        f"{model}:generateContent"
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


def _validate_gemini_response(data: dict, response_schema: dict) -> None:
    """Schema-constrained decoding (responseSchema) only guarantees valid
    JSON shape, not that every field the caller actually needs came back
    non-empty -- and a fallback model isn't guaranteed to honor
    responseSchema as reliably as the primary. Both _call_gemini_json paths
    are forced through this same check before a result is accepted, so the
    fallback never clears a lower bar just because it's the backup."""
    required = response_schema.get("required", [])
    missing = [key for key in required if key not in data]
    if missing:
        raise ValueError(f"Gemini response missing required field(s): {missing}")


def _call_gemini_json(prompt: str, response_schema: dict) -> dict:
    """Primary model, one retry, then GEMINI_FALLBACK_MODEL -- only for the
    transient overload/rate-limit statuses a retry can plausibly fix. A
    non-retryable error (a real prompt/schema bug) raises immediately rather
    than burning two more calls papering over it. See _validate_gemini_response
    for the bar every attempt's output has to clear before being accepted."""
    last_error: Exception | None = None
    attempts = [(_GEMINI_MODEL, 0), (_GEMINI_MODEL, 2), (_GEMINI_FALLBACK_MODEL, 0)]
    for model, backoff_seconds in attempts:
        if backoff_seconds:
            time.sleep(backoff_seconds)
        try:
            data = _gemini_request(model, prompt, response_schema)
            _validate_gemini_response(data, response_schema)
            return data
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status not in _GEMINI_RETRYABLE_STATUS_CODES:
                raise
            last_error = e
        except (KeyError, ValueError, TypeError) as e:
            # Malformed/incomplete response shape -- not necessarily transient,
            # but worth letting the next attempt (retry or fallback model) try
            # to clear the bar rather than giving up on the first miss.
            last_error = e
    raise last_error


def _query(sql: str, params: list[bigquery.ScalarQueryParameter]) -> list[bigquery.table.Row]:
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    return list(_bq.query(sql, job_config=job_config).result())


def _all_city_ids() -> list[str]:
    """Data-driven replacement for the old hardcoded _SEED_CITY_IDS set --
    queried live against the cities table rather than a Python constant, so
    a city added via /bulk_add_cities becomes selectable in campaign_stops
    with no code change. A small extra query on an infrequent path
    (creating stops, the strategy chat's schema) -- worth the correctness
    over caching a list that could go stale the moment a new city is added."""
    rows = _query(f"SELECT city_id FROM `{_DATASET}.cities` ORDER BY city_id", [])
    return [r["city_id"] for r in rows]


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """Gemini's TTS response is raw 16-bit mono PCM with no container --
    unplayable directly in a browser <audio> element. Wraps it in a minimal
    WAV header, matching the mimeType Gemini actually returns
    (audio/L16;codec=pcm;rate=<sample_rate>)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def _synthesize_speech_wav(text: str) -> bytes:
    url = (
        f"https://{_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/"
        f"{_GCP_PROJECT}/locations/{_VERTEX_LOCATION}/publishers/google/models/"
        f"{_GEMINI_TTS_MODEL}:generateContent"
    )
    res = requests.post(
        url,
        headers={"Authorization": f"Bearer {_get_access_token()}", "Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": _GEMINI_TTS_VOICE}}},
            },
        },
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
    pcm = base64.b64decode(inline["data"])
    # mimeType looks like "audio/L16;codec=pcm;rate=24000" -- parse the real
    # rate rather than hardcoding it, in case the model's output rate ever
    # changes.
    rate_match = re.search(r"rate=(\d+)", inline.get("mimeType", ""))
    sample_rate = int(rate_match.group(1)) if rate_match else 24000
    return _pcm_to_wav_bytes(pcm, sample_rate)


def _get_or_synthesize_pronunciation_audio(phrase: str) -> str:
    # Content-hashed path: an identical phrase (a common greeting reused
    # across campaigns/cities) resolves to the same object, so a repeat
    # skips both the TTS call and the upload.
    digest = hashlib.sha256(phrase.encode("utf-8")).hexdigest()[:16]
    bucket = _storage_client.bucket(_DELIGHT_CARD_BUCKET)
    blob = bucket.blob(f"pronunciation-audio/{digest}.wav")
    if not blob.exists():
        wav_bytes = _synthesize_speech_wav(phrase)
        blob.upload_from_string(wav_bytes, content_type="audio/wav")
    return blob.public_url


@app.post("/synthesize_pronunciation")
def synthesize_pronunciation():
    payload = request.get_json(silent=True) or {}
    phrases = payload.get("phrases") or []
    if not phrases:
        return jsonify({"error": "missing required field: phrases (non-empty array)"}), 400
    if not _storage_client:
        return jsonify({"error": "DELIGHT_CARD_BUCKET is not configured on this service"}), 500

    audio = []
    for phrase in phrases:
        try:
            url = _get_or_synthesize_pronunciation_audio(phrase)
            audio.append({"phrase": phrase, "audio_url": url})
        except (requests.HTTPError, KeyError, ValueError) as e:
            audio.append({"phrase": phrase, "audio_url": None, "error": str(e)})
    return jsonify({"audio": audio})


def _generate_style_moodboard_png(city_name: str, style_notes: str) -> bytes:
    url = (
        f"https://{_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/"
        f"{_GCP_PROJECT}/locations/{_VERTEX_LOCATION}/publishers/google/models/"
        f"{_GEMINI_IMAGE_MODEL}:generateContent"
    )
    prompt = (
        f"An abstract style moodboard poster for a touring artist's stop in {city_name}, "
        f"grounded in this real local color palette and visual motifs: {style_notes}. "
        f"Abstract composition only -- no human faces, no real people, no recognizable public "
        f"figures, no readable text or logos. Evoke the mood and texture of {city_name} through "
        f"color, pattern, and shape alone."
    )
    res = requests.post(
        url,
        headers={"Authorization": f"Bearer {_get_access_token()}", "Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        },
        timeout=60,
    )
    res.raise_for_status()
    data = res.json()
    inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
    return base64.b64decode(inline["data"])


def _get_or_generate_style_moodboard(city_id: str, city_name: str, style_notes: str) -> str:
    # Content-hashed on (city_id, style_notes): a re-request with the same
    # grounded style brief skips both the image-gen call and the upload --
    # same caching shape as pronunciation audio above.
    digest = hashlib.sha256(f"{city_id}:{style_notes}".encode("utf-8")).hexdigest()[:16]
    bucket = _storage_client.bucket(_DELIGHT_CARD_BUCKET)
    blob = bucket.blob(f"style-moodboards/{digest}.png")
    if not blob.exists():
        png_bytes = _generate_style_moodboard_png(city_name, style_notes)
        blob.upload_from_string(png_bytes, content_type="image/png")
    return blob.public_url


@app.post("/generate_style_moodboard")
def generate_style_moodboard():
    """Grounded local-style image generation: an abstract moodboard poster
    whose prompt is built from real culture/local-delight signals for this
    city (never a generic stock aesthetic), and explicitly forbidden from
    depicting real people -- same discipline already applied to
    beloved_icons never naming a real, living person."""
    payload = request.get_json(silent=True) or {}
    city_id = payload.get("city_id")
    city_name = payload.get("city_name")
    style_notes = payload.get("style_notes")
    if not city_id or not city_name or not style_notes:
        return jsonify({"error": "missing required fields: city_id, city_name, style_notes"}), 400
    if not _storage_client:
        return jsonify({"error": "DELIGHT_CARD_BUCKET is not configured on this service"}), 500
    try:
        url = _get_or_generate_style_moodboard(city_id, city_name, style_notes)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"style moodboard generation failed: {e}"}), 502
    return jsonify({"city_id": city_id, "moodboard_url": url})


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

    # Tiered routing: the cheapest possible check (did Parallel return
    # anything at all?) gates the expensive Gemini synthesis call. Zero
    # results means there's nothing to synthesize from anyway, so this
    # short-circuits before spending a Gemini call on excerpts that don't
    # exist -- an honest "low confidence, no data" response instead. The
    # same gate is repeated in /live_local_delight_search and
    # /live_city_demographics_search below.
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


@app.get("/city_demographics")
def city_demographics():
    city_id = request.args.get("city_id")
    if not city_id:
        return jsonify({"error": "missing required query param: city_id"}), 400
    rows = _query(
        f"SELECT city_id, literacy_rate, median_age, population, "
        f"median_household_income_usd, internet_penetration_rate, "
        f"dominant_social_platforms, top_interest_categories, notable_public_holidays "
        f"FROM `{_DATASET}.city_demographics` WHERE city_id = @city_id",
        [bigquery.ScalarQueryParameter("city_id", "STRING", city_id)],
    )
    if not rows:
        return jsonify({"error": f"no city_demographics record for city_id={city_id}"}), 404
    r = rows[0]
    return jsonify({
        "city_id": r["city_id"],
        "literacy_rate": r["literacy_rate"],
        "median_age": r["median_age"],
        "population": r["population"],
        "median_household_income_usd": r["median_household_income_usd"],
        "internet_penetration_rate": r["internet_penetration_rate"],
        "dominant_social_platforms": list(r["dominant_social_platforms"] or []),
        "top_interest_categories": list(r["top_interest_categories"] or []),
        "notable_public_holidays": list(r["notable_public_holidays"] or []),
    })


@app.post("/live_city_demographics_search")
def live_city_demographics_search():
    """Fallback for cities with no tour_intelligence.city_demographics row.

    Mirrors /live_culture_search's pattern exactly, for quantitative facts
    (literacy, income, population, top interests) instead of etiquette
    guidance -- Parallel Search for live grounding excerpts, then a single
    schema-constrained Gemini call synthesizes them into the same shape
    /city_demographics returns for seeded cities. Numeric facts sometimes
    have sources that disagree by year/methodology -- the prompt instructs
    Gemini to say so and mark confidence low rather than pick one arbitrarily,
    the same honesty discipline the other two live-search routes already use.
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
        results = _demographics_search(city_name, country)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Search API call failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    if not results:
        return jsonify({
            "city_id": _slugify(city_name),
            "source": "parallel_live",
            "confidence": "low",
            "literacy_rate": None,
            "median_age": None,
            "population": None,
            "median_household_income_usd": None,
            "internet_penetration_rate": None,
            "dominant_social_platforms": [],
            "top_interest_categories": [],
            "notable_public_holidays": [],
            "citations": [],
            "notice": "No live search results found for this city — no grounded data available.",
        })

    excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n"
        + "\n".join(r.get("excerpts") or [])
        for r in results[:8]
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "literacy_rate": {"type": "NUMBER", "nullable": True},
            "median_age": {"type": "NUMBER", "nullable": True},
            "population": {"type": "INTEGER", "nullable": True},
            "median_household_income_usd": {"type": "NUMBER", "nullable": True},
            "internet_penetration_rate": {"type": "NUMBER", "nullable": True},
            "dominant_social_platforms": {"type": "ARRAY", "items": {"type": "STRING"}},
            "top_interest_categories": {"type": "ARRAY", "items": {"type": "STRING"}},
            "notable_public_holidays": {"type": "ARRAY", "items": {"type": "STRING"}},
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": [
            "literacy_rate", "median_age", "population", "median_household_income_usd",
            "internet_penetration_rate", "dominant_social_platforms",
            "top_interest_categories", "notable_public_holidays", "confidence",
        ],
    }
    prompt = (
        "You are a demographic-research analyst briefing a touring musician or "
        f"actor's marketing team ahead of a stop in {city_name}. Using ONLY the "
        "web search excerpts below, produce the requested facts in the exact "
        "JSON schema given.\n\n"
        "Rules:\n"
        "- Do not invent numbers not supported by the excerpts — use null for "
        "any field the excerpts don't actually support.\n"
        "- If sources disagree (different years or methodologies), prefer the "
        "most recent authoritative-looking figure, but set confidence to "
        "\"low\" rather than silently picking one as if it were certain.\n"
        "- If the excerpts are thin or mostly irrelevant, return nulls/empty "
        "lists rather than guessing, and set confidence to \"low\".\n\n"
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


def _venue_discovery_search(
    city_name: str, country: str | None, capacity_hint: str | None, format_hint: str | None
) -> list[dict]:
    if not _parallel_client:
        raise RuntimeError("PARALLEL_API_KEY is not configured on this service")
    place = f"{city_name}, {country}" if country else city_name
    format_clause = f" suitable for {format_hint}" if format_hint else ""
    capacity_clause = f" with capacity around {capacity_hint}" if capacity_hint else ""
    search = _parallel_client.search(
        objective=(
            f"Real concert venues, arenas, stadiums, or theaters in {place}{format_clause}"
            f"{capacity_clause}, suitable for a touring musician or actor's live event."
        ),
        search_queries=[
            f"{place} major concert venues",
            f"{place} arenas stadiums capacity",
            f"{place} theaters live events",
        ],
        mode="advanced",
    )
    return [{"url": r.url, "title": r.title, "excerpts": r.excerpts} for r in search.results]


_VENUE_DISCOVERY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "venues": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "venue_type": {"type": "STRING"},
                    "approx_capacity": {"type": "STRING", "nullable": True},
                    "source_url": {"type": "STRING"},
                    "note": {"type": "STRING", "nullable": True},
                },
                "required": ["name", "venue_type", "approx_capacity", "source_url", "note"],
            },
        },
    },
    "required": ["venues"],
}


@app.post("/discover_venues")
def discover_venues():
    """Venue discovery: instead of requiring the campaign creator to already
    have a specific venue URL in hand, run a real Parallel Search for actual
    candidate venues in this city and return a real, cited shortlist to pick
    from -- never a fabricated venue, only ones the search excerpts actually
    name. /extract_venue_info is the deep-dive once one is chosen."""
    payload = request.get_json(silent=True) or {}
    city_name = payload.get("city_name")
    if not city_name:
        return jsonify({"error": "missing required field: city_name"}), 400
    country = payload.get("country")
    capacity_hint = payload.get("capacity_hint")
    format_hint = payload.get("format_hint")

    try:
        city_name = _validate_place_name(city_name, "city_name")
        if country:
            country = _validate_place_name(country, "country")
    except PlaceNameValidationError as e:
        return jsonify({"error": str(e)}), 400

    try:
        results = _venue_discovery_search(city_name, country, capacity_hint, format_hint)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Search API call failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    if not results:
        return jsonify({"source": "parallel_live", "venues": [], "citations": []})

    excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n" + "\n".join(r.get("excerpts") or [])
        for r in results[:8]
    )
    prompt = (
        f"Using ONLY the search excerpts below, list real, distinct venues (arenas, stadiums, theaters) "
        f"actually mentioned as being in or near {city_name} that could host a touring musician or actor's "
        f"live event. For each: name, venue_type (e.g. 'indoor arena', 'stadium', 'theater'), "
        f"approx_capacity (null if not stated), source_url (the exact URL it was mentioned in), and a "
        f"one-sentence note. Never invent a venue not actually named in the excerpts. Return at most 5, "
        f"most relevant first. Return an empty venues array if nothing concrete is found.\n\n"
        f"SEARCH EXCERPTS:\n{excerpt_block}"
    )
    try:
        synthesized = _call_gemini_json(prompt, _VENUE_DISCOVERY_SCHEMA)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502

    return jsonify({
        "source": "parallel_live",
        "citations": [{"url": r.get("url"), "title": r.get("title")} for r in results[:8]],
        **synthesized,
    })


def _venue_commute_search(city_name: str, venue_name: str | None) -> list[dict]:
    place = f"{venue_name}, {city_name}" if venue_name else city_name
    search = _parallel_client.search(
        objective=(
            f"The nearest major airport and the nearest railway or train station to {place}, "
            f"with approximate distance or travel time, for touring crew and talent logistics planning."
        ),
        search_queries=[f"{place} nearest airport", f"{place} nearest railway station"],
        mode="advanced",
    )
    return [{"url": r.url, "title": r.title, "excerpts": r.excerpts} for r in search.results]


_VENUE_COMMUTE_FIELDS = {
    "type": "OBJECT",
    "nullable": True,
    "properties": {
        "name": {"type": "STRING"},
        "distance_or_travel_time": {"type": "STRING"},
    },
    "required": ["name", "distance_or_travel_time"],
}


@app.post("/extract_venue_info")
def extract_venue_info():
    """Stop-specific logistics: real Parallel Extract against a specific
    venue/promoter URL the campaign creator provides (capacity, format,
    logistics notes -- distinct from getCultureNotes, which is city-level
    and never this granular), plus a second, real Parallel Search for the
    nearest major airport and nearest railway/train station -- crew and
    talent commute planning that no single venue page reliably states.
    Both feed one Gemini synthesis. A failed commute search degrades to
    null commute fields rather than blocking the (already-working) capacity
    extraction -- same graceful-degradation discipline used elsewhere for
    nice-to-have enrichment."""
    payload = request.get_json(silent=True) or {}
    urls = payload.get("urls") or []
    if not urls:
        return jsonify({"error": "missing required field: urls (non-empty array)"}), 400
    city_name = payload.get("city_name")
    if not city_name:
        return jsonify({"error": "missing required field: city_name"}), 400
    venue_name = payload.get("venue_name")

    try:
        city_name = _validate_place_name(city_name, "city_name")
        if venue_name:
            venue_name = _validate_venue_name(venue_name)
    except PlaceNameValidationError as e:
        return jsonify({"error": str(e)}), 400

    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500

    objective = payload.get("objective") or (
        "Venue capacity, typical event format, and any notable audience etiquette or logistics notes "
        "relevant to a touring musician or actor performing here."
    )
    try:
        extracted = _parallel_client.extract(urls=urls, objective=objective)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Extract API call failed: {e}"}), 502

    results = extracted.results or []

    try:
        commute_results = _venue_commute_search(city_name, venue_name)
    except parallel.APIError:
        commute_results = []

    excerpt_block = "\n\n".join(
        f"Source: {r.title or r.url}\nURL: {r.url}\n" + "\n".join(r.excerpts or [])
        for r in results[:8]
    )
    commute_excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n" + "\n".join(r.get("excerpts") or [])
        for r in commute_results[:5]
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "capacity": {"type": "STRING", "nullable": True},
            "typical_event_format": {"type": "STRING", "nullable": True},
            "logistics_notes": {"type": "STRING", "nullable": True},
            "nearest_airport": _VENUE_COMMUTE_FIELDS,
            "nearest_railway_station": _VENUE_COMMUTE_FIELDS,
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": [
            "capacity", "typical_event_format", "logistics_notes",
            "nearest_airport", "nearest_railway_station", "confidence",
        ],
    }
    prompt = (
        "Using ONLY the content below, summarize venue capacity, typical event format, and any "
        "logistics/etiquette notes relevant to a touring musician or actor, plus the nearest major "
        "airport and nearest railway/train station for touring crew and talent logistics. Use null "
        "for anything the content doesn't actually support -- never guess a number, distance, or "
        "travel time. Set confidence to \"low\" if the content is thin or ambiguous.\n\n"
        f"EXTRACTED VENUE PAGE CONTENT:\n{excerpt_block}\n\n"
        f"COMMUTE SEARCH RESULTS:\n{commute_excerpt_block}"
    )
    try:
        synthesized = _call_gemini_json(prompt, schema)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502

    citations = [{"url": r.url, "title": r.title} for r in results[:8]]
    citations += [{"url": r.get("url"), "title": r.get("title")} for r in commute_results[:5]]

    return jsonify({
        "source": "parallel_extract",
        "citations": citations,
        **synthesized,
    })


@app.get("/cities_list")
def cities_list():
    rows = _query(
        f"SELECT city_id, city_name, country, primary_language, timezone, region "
        f"FROM `{_DATASET}.cities` ORDER BY city_name",
        [],
    )
    return jsonify({
        "cities": [
            {
                "city_id": r["city_id"],
                "city_name": r["city_name"],
                "country": r["country"],
                "primary_language": r["primary_language"],
                "timezone": r["timezone"],
                "region": r["region"],
            }
            for r in rows
        ],
    })


_BULK_CITY_OUTPUT_SCHEMA = {
    "type": "json",
    "json_schema": {
        "type": "object",
        "properties": {
            "city_name": {"type": "string"},
            "country": {"type": "string"},
            "primary_language": {"type": "string"},
            "timezone": {"type": "string"},
            "region": {"type": "string"},
        },
        "required": ["city_name", "country", "primary_language", "timezone", "region"],
    },
}
_TASK_RUN_POLL_INTERVAL_S = 3
_TASK_RUN_MAX_POLLS = 20


@app.post("/bulk_add_cities")
def bulk_add_cities():
    """Real Parallel Task API batch research -- N cities researched as one
    task group instead of N sequential live-search-and-synthesize round
    trips. A bulk-added city becomes immediately selectable in
    /campaign_stops (validated against the live cities table, not a
    hardcoded set) -- see _all_city_ids()."""
    payload = request.get_json(silent=True) or {}
    city_names = payload.get("city_names") or []
    if not city_names:
        return jsonify({"error": "missing required field: city_names (non-empty array)"}), 400
    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500

    known_ids = set(_all_city_ids())
    to_add = []
    skipped = []
    for name in city_names:
        slug = _slugify(name)
        (skipped if slug in known_ids else to_add).append((slug, name))
    skipped_ids = sorted({s for s, _ in skipped})

    if not to_add:
        return jsonify({"added": [], "skipped_existing": skipped_ids, "failed": []})

    try:
        group = _parallel_client.task_group.create(metadata={"purpose": "bulk_add_cities"})
        run_response = _parallel_client.task_group.add_runs(
            group.task_group_id,
            inputs=[
                {
                    "input": f"{name} (research this specific city, not a similarly-named place elsewhere)",
                    "processor": "lite",
                    "task_spec": {"output_schema": _BULK_CITY_OUTPUT_SCHEMA},
                }
                for _, name in to_add
            ],
        )
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Task API call failed: {e}"}), 502

    run_ids = run_response.run_ids
    for _ in range(_TASK_RUN_MAX_POLLS):
        statuses = [_parallel_client.task_run.retrieve(rid).status for rid in run_ids]
        if all(s in ("completed", "failed") for s in statuses):
            break
        time.sleep(_TASK_RUN_POLL_INTERVAL_S)

    added = []
    failed = []
    rows = []
    for (slug, name), rid in zip(to_add, run_ids):
        try:
            result = _parallel_client.task_run.result(rid)
            content = result.model_dump()["output"]["content"]
            rows.append({
                "city_id": slug,
                "city_name": content.get("city_name") or name,
                "country": content.get("country"),
                "primary_language": content.get("primary_language"),
                "timezone": content.get("timezone"),
                "region": content.get("region"),
            })
            added.append(slug)
        except Exception as e:
            failed.append({"city_name": name, "error": str(e)})

    if rows:
        errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.cities", rows)
        if errors:
            return jsonify({"error": "insert failed", "details": errors}), 500

    return jsonify({"added": sorted(added), "skipped_existing": skipped_ids, "failed": failed})


@app.get("/campaigns")
def get_campaign():
    campaign_id = request.args.get("campaign_id")
    if not campaign_id:
        return jsonify({"error": "missing required query param: campaign_id"}), 400
    rows = _query(
        f"SELECT campaign_id, title, campaign_type, genre, talent_roster, status, selected_metrics "
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
        "selected_metrics": list(r["selected_metrics"] or []),
    })


@app.get("/campaigns_list")
def list_campaigns():
    rows = _query(
        f"SELECT campaign_id, title, campaign_type, genre, talent_roster, status, selected_metrics "
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
                "selected_metrics": list(r["selected_metrics"] or []),
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
        "selected_metrics": payload.get("selected_metrics") or [],
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
        f"SELECT s.city_id, c.city_name, s.stop_date, s.sequence_order, s.event_format, s.venue_url "
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
                "venue_url": r["venue_url"],
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

    known_city_ids = set(_all_city_ids())
    unsupported = sorted({s.get("city_id") for s in stops if s.get("city_id") not in known_city_ids})
    if unsupported:
        return jsonify({
            "error": f"unknown city_id(s): {', '.join(unsupported)}. Add them first via /bulk_add_cities."
        }), 400

    rows = [
        {
            "campaign_id": campaign_id,
            "city_id": s["city_id"],
            "stop_date": s.get("stop_date"),
            "sequence_order": s.get("sequence_order"),
            "event_format": s.get("event_format"),
            "venue_url": s.get("venue_url"),
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
        f"grounding_check_notes, delight_card_url, demographic_snapshot_json, pronunciation_audio_json, "
        f"style_moodboard_url, venue_notes_json "
        f"FROM `{_DATASET}.city_briefs` "
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
                "demographic_snapshot_json": r["demographic_snapshot_json"],
                "pronunciation_audio_json": r["pronunciation_audio_json"],
                "style_moodboard_url": r["style_moodboard_url"],
                "venue_notes_json": r["venue_notes_json"],
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
        "demographic_snapshot_json": payload.get("demographic_snapshot_json"),
        "pronunciation_audio_json": payload.get("pronunciation_audio_json"),
        "style_moodboard_url": payload.get("style_moodboard_url"),
        "venue_notes_json": payload.get("venue_notes_json"),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.city_briefs", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"brief_id": row["brief_id"], "status": "inserted"})


_CAMPAIGN_INSIGHTS_SCHEMA = {
    "type": "object",
    "properties": {
        "insights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "severity": {"type": "string", "enum": ["info", "advisory", "risk"]},
                    "affected_cities": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title", "summary", "severity", "affected_cities"],
            },
        },
    },
    "required": ["insights"],
}


@app.post("/synthesize_campaign_insights")
def synthesize_campaign_insights():
    """The cross-city pattern step: given every stop's already-finalized,
    already-grounded brief data, find non-obvious patterns a planner going
    city-by-city would miss -- a shared theme with different valence at two
    stops, a sequencing risk, a topic safe in one city and flagged 'avoid'
    in another. Strictly grounded in the cities payload -- never asked to
    speculate beyond what's actually in each city's own real data. Doesn't
    write to BigQuery itself; see /campaign_insights for that."""
    payload = request.get_json(silent=True) or {}
    campaign_id = payload.get("campaign_id")
    cities = payload.get("cities") or []
    if not campaign_id or not cities:
        return jsonify({"error": "missing required fields: campaign_id, cities (non-empty array)"}), 400

    city_block = "\n\n".join(
        f"City: {c.get('city_name', c.get('city_id'))} ({c.get('city_id')})\n"
        f"Culture summary: {c.get('culture_summary') or 'n/a'}\n"
        f"Local delight: {c.get('local_delight_summary') or 'n/a'}\n"
        f"Talent brief: {c.get('talent_brief_json') or 'n/a'}"
        for c in cities
    )
    prompt = (
        "You are reviewing the finalized talent briefs for every city stop in one tour campaign, "
        "looking for patterns a planner going city-by-city would miss.\n\n"
        f"{city_block}\n\n"
        "Find non-obvious cross-city patterns: a topic or reference that carries different weight or "
        "risk across two or more stops, a theme that could be reused (or must NOT be reused) between "
        "consecutive stops, or a real tension between what one city's brief recommends and another's. "
        "Only surface things genuinely grounded in the city data above -- do not invent facts about a "
        "city that aren't in its own brief. If there are genuinely no notable cross-city patterns, "
        "return an empty insights array rather than manufacturing one. "
        "severity: 'risk' only for something that could cause real reputational/cultural harm if missed, "
        "'advisory' for a worthwhile heads-up, 'info' for a neutral observation."
    )
    try:
        result = _call_gemini_json(prompt, _CAMPAIGN_INSIGHTS_SCHEMA)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502
    return jsonify(result)


@app.get("/campaign_insights")
def get_campaign_insights():
    campaign_id = request.args.get("campaign_id")
    if not campaign_id:
        return jsonify({"error": "missing required query param: campaign_id"}), 400
    rows = _query(
        f"SELECT campaign_id, generated_at, insights_json FROM `{_DATASET}.campaign_insights` "
        f"WHERE campaign_id = @campaign_id ORDER BY generated_at DESC LIMIT 1",
        [bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id)],
    )
    if not rows:
        return jsonify({"campaign_id": campaign_id, "generated_at": None, "insights_json": None})
    r = rows[0]
    return jsonify({
        "campaign_id": r["campaign_id"],
        "generated_at": r["generated_at"].isoformat() if r["generated_at"] else None,
        "insights_json": r["insights_json"],
    })


@app.post("/campaign_insights")
def insert_campaign_insights():
    payload = request.get_json(silent=True) or {}
    if "campaign_id" not in payload:
        return jsonify({"error": "missing required field: campaign_id"}), 400
    row = {
        "campaign_id": payload["campaign_id"],
        "generated_at": payload.get("generated_at") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "insights_json": payload.get("insights_json"),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.campaign_insights", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"campaign_id": row["campaign_id"], "status": "inserted"})


@app.post("/synthesize_stop_outcome")
def synthesize_stop_outcome():
    """Post-tour retrospective: a real live search for actual press/fan
    reaction after a stop's date has passed -- distinct from
    city_briefs.enthusiasm_score, which is only ever a pre-show prediction.
    Closes a loop cross-campaign learning would otherwise only ever guess
    at. Doesn't write to BigQuery itself; see /stop_outcomes for that."""
    payload = request.get_json(silent=True) or {}
    campaign_id = payload.get("campaign_id")
    city_id = payload.get("city_id")
    city_name = payload.get("city_name")
    campaign_title = payload.get("campaign_title")
    stop_date = payload.get("stop_date")
    if not all([campaign_id, city_id, city_name, campaign_title, stop_date]):
        return jsonify({
            "error": "missing required fields: campaign_id, city_id, city_name, campaign_title, stop_date"
        }), 400
    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500

    try:
        search = _parallel_client.search(
            objective=(
                f"Real press coverage, reviews, or fan reaction to the '{campaign_title}' tour's "
                f"{city_name} stop on {stop_date} -- how the show actually went."
            ),
            search_queries=[
                f"{campaign_title} {city_name} review",
                f"{campaign_title} {city_name} {stop_date}",
            ],
            mode="advanced",
        )
        results = [{"url": r.url, "title": r.title, "excerpts": r.excerpts} for r in search.results]
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Search API call failed: {e}"}), 502

    if not results:
        return jsonify({
            "source": "parallel_live",
            "confidence": "low",
            "outcome_summary": None,
            "sentiment": "unknown",
            "citations": [],
            "notice": "No live search results found for this stop -- no grounded outcome available.",
        })

    excerpt_block = "\n\n".join(
        f"Source: {r.get('title') or r.get('url')}\nURL: {r.get('url')}\n" + "\n".join(r.get("excerpts") or [])
        for r in results[:8]
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "outcome_summary": {"type": "STRING", "nullable": True},
            "sentiment": {"type": "STRING", "enum": ["positive", "mixed", "negative", "unknown"]},
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": ["outcome_summary", "sentiment", "confidence"],
    }
    prompt = (
        "Using ONLY the search excerpts below, summarize how this specific tour stop actually went "
        "-- real press coverage or fan reaction, not general artist sentiment. Use null for "
        "outcome_summary and sentiment=\"unknown\" if the excerpts don't actually cover this specific "
        "stop. Never invent a positive or negative outcome the excerpts don't support.\n\n"
        f"SEARCH EXCERPTS:\n{excerpt_block}"
    )
    try:
        synthesized = _call_gemini_json(prompt, schema)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini synthesis failed: {e}"}), 502

    return jsonify({
        "source": "parallel_live",
        "citations": [{"url": r.get("url"), "title": r.get("title")} for r in results[:8]],
        **synthesized,
    })


@app.get("/stop_outcomes")
def get_stop_outcome():
    campaign_id = request.args.get("campaign_id")
    city_id = request.args.get("city_id")
    if not campaign_id or not city_id:
        return jsonify({"error": "missing required query param(s): campaign_id, city_id"}), 400
    rows = _query(
        f"SELECT campaign_id, city_id, generated_at, outcome_json FROM `{_DATASET}.stop_outcomes` "
        f"WHERE campaign_id = @campaign_id AND city_id = @city_id ORDER BY generated_at DESC LIMIT 1",
        [
            bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id),
            bigquery.ScalarQueryParameter("city_id", "STRING", city_id),
        ],
    )
    if not rows:
        return jsonify({"campaign_id": campaign_id, "city_id": city_id, "generated_at": None, "outcome_json": None})
    r = rows[0]
    return jsonify({
        "campaign_id": r["campaign_id"],
        "city_id": r["city_id"],
        "generated_at": r["generated_at"].isoformat() if r["generated_at"] else None,
        "outcome_json": r["outcome_json"],
    })


@app.post("/stop_outcomes")
def insert_stop_outcome():
    payload = request.get_json(silent=True) or {}
    if not payload.get("campaign_id") or not payload.get("city_id"):
        return jsonify({"error": "missing required field(s): campaign_id, city_id"}), 400
    row = {
        "campaign_id": payload["campaign_id"],
        "city_id": payload["city_id"],
        "generated_at": payload.get("generated_at") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "outcome_json": payload.get("outcome_json"),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.stop_outcomes", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"campaign_id": row["campaign_id"], "city_id": row["city_id"], "status": "inserted"})


_MONITOR_FREQUENCY = "1d"

# Two independent monitor flavors share the same Parallel Monitor
# infrastructure and city_monitors table -- only the query focus (and the
# lookup scoping below) differs. Safety is the second flavor: distinct from
# cultural drift, an artist's team cares about protest/security/logistics
# risk on its own axis, not blended into "what's the vibe" reporting.
_MONITOR_QUERY_BY_TYPE = {
    "cultural": (
        "recent cultural news, controversies, or public sentiment shifts relevant to "
        "touring artists visiting {city_name}"
    ),
    "safety": (
        "recent safety incidents, security concerns, protest activity, or transportation and "
        "logistics disruptions relevant to touring artists and events in {city_name}"
    ),
}


@app.post("/city_monitors")
def create_city_monitor():
    """Continuous grounding: a real Parallel Monitor tracking cultural/news
    or safety/logistics drift for one city stop, so a brief generated weeks
    before a tour date can be checked for what's changed since -- something
    a one-shot generation literally can't do. Idempotent per (campaign, city,
    monitor_type): returns the existing monitor for that combination if one
    was already created, rather than paying for (and accumulating) a
    duplicate Parallel monitor on every click."""
    payload = request.get_json(silent=True) or {}
    campaign_id = payload.get("campaign_id")
    city_id = payload.get("city_id")
    city_name = payload.get("city_name")
    monitor_type = payload.get("monitor_type") or "cultural"
    if monitor_type not in _MONITOR_QUERY_BY_TYPE:
        return jsonify({
            "error": f"invalid monitor_type: {monitor_type!r}. Must be one of {sorted(_MONITOR_QUERY_BY_TYPE)}"
        }), 400
    if not campaign_id or not city_id or not city_name:
        return jsonify({"error": "missing required fields: campaign_id, city_id, city_name"}), 400
    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500

    existing = _query(
        f"SELECT monitor_id FROM `{_DATASET}.city_monitors` "
        f"WHERE campaign_id = @campaign_id AND city_id = @city_id AND monitor_type = @monitor_type "
        f"ORDER BY created_at DESC LIMIT 1",
        [
            bigquery.ScalarQueryParameter("campaign_id", "STRING", campaign_id),
            bigquery.ScalarQueryParameter("city_id", "STRING", city_id),
            bigquery.ScalarQueryParameter("monitor_type", "STRING", monitor_type),
        ],
    )
    if existing:
        return jsonify({"monitor_id": existing[0]["monitor_id"], "created": False})

    try:
        monitor = _parallel_client.monitor.create(
            type="event_stream",
            frequency=_MONITOR_FREQUENCY,
            settings={
                "query": _MONITOR_QUERY_BY_TYPE[monitor_type].format(city_name=city_name),
                "include_backfill": True,
            },
            metadata={"campaign_id": campaign_id, "city_id": city_id, "monitor_type": monitor_type},
        )
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Monitor create failed: {e}"}), 502

    row = {
        "campaign_id": campaign_id,
        "city_id": city_id,
        "monitor_id": monitor.monitor_id,
        "monitor_type": monitor_type,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    errors = _bq.insert_rows_json(f"{_bq.project}.{_DATASET}.city_monitors", [row])
    if errors:
        return jsonify({"error": "insert failed", "details": errors}), 500
    return jsonify({"monitor_id": monitor.monitor_id, "created": True})


@app.post("/trigger_city_monitor")
def trigger_city_monitor():
    """Forces an immediate check instead of waiting for the monitor's own
    daily cadence -- real latency observed live: ~60-90s until a fresh
    result appears via /city_monitor_events, since Parallel actually
    searches and reasons over live results rather than returning instantly."""
    payload = request.get_json(silent=True) or {}
    monitor_id = payload.get("monitor_id")
    if not monitor_id:
        return jsonify({"error": "missing required field: monitor_id"}), 400
    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500
    try:
        _parallel_client.monitor.trigger(monitor_id)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Monitor trigger failed: {e}"}), 502
    return jsonify({"status": "triggered"})


@app.get("/city_monitor_events")
def city_monitor_events():
    monitor_id = request.args.get("monitor_id")
    if not monitor_id:
        return jsonify({"error": "missing required query param: monitor_id"}), 400
    if not _parallel_client:
        return jsonify({"error": "PARALLEL_API_KEY is not configured on this service"}), 500
    try:
        result = _parallel_client.monitor.events(monitor_id, limit=5)
    except parallel.APIError as e:
        return jsonify({"error": f"Parallel Monitor events fetch failed: {e}"}), 502

    events = []
    for ev in result.events or []:
        # .model_dump() normalizes both Pydantic-model and already-plain-dict
        # shapes to one plain dict, so the rest of this can safely use .get()
        # chains regardless of exactly which the SDK handed back.
        ev_dict = ev.model_dump() if hasattr(ev, "model_dump") else ev
        basis_list = (ev_dict.get("output") or {}).get("basis") or []
        basis = basis_list[0] if basis_list else {}
        events.append({
            "event_date": ev_dict.get("event_date"),
            "summary": basis.get("reasoning"),
            "citations": [
                {"url": c.get("url"), "title": c.get("title")} for c in (basis.get("citations") or [])
            ],
        })
    return jsonify({"events": events})


@app.get("/genre_recommendations")
def genre_recommendations():
    """Cross-campaign learning: which cities have historically driven the
    highest real enthusiasm for a genre, aggregated from actual finalized
    city_briefs joined to their campaign's genre -- not the static
    fan_signals seed table, real outcomes across past campaigns. Naturally
    sparse until more campaigns have run; an honest empty list beats a
    forced recommendation from too little data."""
    genre = request.args.get("genre")
    if not genre:
        return jsonify({"error": "missing required query param: genre"}), 400
    rows = _query(
        f"SELECT cb.city_id, AVG(cb.enthusiasm_score) AS avg_enthusiasm_score, COUNT(*) AS sample_size "
        f"FROM `{_DATASET}.city_briefs` cb "
        f"JOIN `{_DATASET}.campaigns` c ON cb.campaign_id = c.campaign_id "
        f"WHERE c.genre = @genre AND cb.status = 'final' AND cb.enthusiasm_score IS NOT NULL "
        f"GROUP BY cb.city_id "
        f"ORDER BY avg_enthusiasm_score DESC",
        [bigquery.ScalarQueryParameter("genre", "STRING", genre)],
    )
    return jsonify({
        "genre": genre,
        "recommendations": [
            {
                "city_id": r["city_id"],
                "avg_enthusiasm_score": r["avg_enthusiasm_score"],
                "sample_size": r["sample_size"],
            }
            for r in rows
        ],
    })


_SUPPORTED_CAMPAIGN_TYPES = ["film_promo_tour", "music_world_tour"]


@app.post("/campaign_strategy_chat")
def campaign_strategy_chat():
    """Conversational pre-fill assistant for the New Campaign form.

    Deliberately NOT a new Playbook/agent (CLAUDE.md locks the MVP at 5
    agents) -- a direct Gemini call reusing _call_gemini_json exactly like
    the live-search routes. Purely advisory: it only ever proposes a
    suggested_campaign the user still reviews and submits through the
    existing, unmodified POST /campaigns path; this route never writes
    anything itself.
    """
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "missing required field: messages"}), 400
    strategy_text = payload.get("strategy_text")

    transcript = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in messages
    )
    strategy_block = (
        f"\n\nEXISTING STRATEGY DOCUMENT PROVIDED BY THE USER:\n{strategy_text}\n"
        if strategy_text else ""
    )

    schema = {
        "type": "OBJECT",
        "properties": {
            "reply": {"type": "STRING"},
            "ready": {"type": "BOOLEAN"},
            "suggested_campaign": {
                "type": "OBJECT",
                "nullable": True,
                "properties": {
                    "title": {"type": "STRING"},
                    "campaign_type": {"type": "STRING", "enum": _SUPPORTED_CAMPAIGN_TYPES},
                    "genre": {"type": "STRING"},
                    "talent_roster": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "stops": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "city_id": {"type": "STRING", "enum": _all_city_ids()},
                                "stop_date": {"type": "STRING"},
                            },
                            "required": ["city_id", "stop_date"],
                        },
                    },
                },
                "required": ["title", "campaign_type", "genre", "talent_roster", "stops"],
            },
        },
        "required": ["reply", "ready"],
    }

    prompt = (
        "You are a helpful campaign-planning assistant inside a tour/press-tour "
        "marketing dashboard, helping a user turn an existing strategy (if any) "
        "or a rough idea into a structured campaign.\n\n"
        f"Supported cities are EXACTLY (use these city_id values, nothing else): "
        f"{_all_city_ids()}.\n"
        f"Supported campaign_type values are EXACTLY: {_SUPPORTED_CAMPAIGN_TYPES}.\n\n"
        "Ask clarifying questions in `reply` if you don't yet know the title, "
        "campaign type, genre, and at least one city stop with a date. Only set "
        "ready=true and populate suggested_campaign once you have enough to "
        "propose a real campaign — never suggest a city_id outside the supported "
        "list above, and never invent a stop_date; ask for one instead.\n\n"
        f"CONVERSATION SO FAR:\n{transcript}{strategy_block}"
    )

    try:
        result = _call_gemini_json(prompt, schema)
    except (requests.HTTPError, KeyError, ValueError) as e:
        return jsonify({"error": f"Gemini chat call failed: {e}"}), 502

    return jsonify({
        "reply": result.get("reply", ""),
        "ready": bool(result.get("ready")),
        "suggested_campaign": result.get("suggested_campaign"),
    })


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
