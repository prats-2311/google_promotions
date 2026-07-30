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

from flask import Flask, jsonify, request
from google.cloud import bigquery

from sdk_logic.enthusiasm_scoring import score_fan_enthusiasm
from sdk_logic.city_ranking import rank_cities
from sdk_logic.grounding_check import check_grounding

app = Flask(__name__)
_bq = bigquery.Client()
_DATASET = "tour_intelligence"


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
