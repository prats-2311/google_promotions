"""Cloud Run entry point: renders the final city delight card.

Triggered by the Talent Prep Agent playbook (`render_delight_card_cloud_run`
tool) once a brief's grounding check has passed. Renders the finalized brief
into a delight_card.html artifact and uploads it to Cloud Storage, returning
a public URL that the Campaign Orchestrator persists onto the city_briefs row.
"""

from __future__ import annotations

import json
import os
import uuid

import functions_framework
from flask import jsonify
from jinja2 import Environment, FileSystemLoader
from google.cloud import storage

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_ENV = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=True)

# Kept in sync with dashboard/src/lib/cityTheme.ts's CITY_ACCENT_DARK -- this
# renderer produces a static HTML artifact with its own inline CSS (no
# shared build step with the dashboard), so there's no automated way to
# import the same values; a hand-sync is the whole story here, same
# duplication discipline as cloud_run/tour_data_api/sdk_logic/ (see
# cloud_run/CLAUDE.md). Re-validated 2026-09-07 for "Premiere Neon" via the
# dataviz skill's validate_palette.js -- see cityTheme.ts's own comment for
# the exact validator invocation.
_ACCENT_BY_CITY = {
    "mumbai": "#ff3d00",
    "london": "#0091ea",
    "tokyo": "#ff00aa",
    "sao_paulo": "#009e5c",
    "new_york": "#7c4dff",
}
_DEFAULT_ACCENT = "#7c4dff"


def _render_html(brief: dict) -> str:
    template = _ENV.get_template("delight_card.html")
    talent_brief = brief.get("talent_brief", {})
    return template.render(
        campaign_title=brief.get("campaign_title", "Campaign"),
        city_name=brief.get("city_name", brief.get("city_id", "")),
        stop_date=brief.get("stop_date", ""),
        accent_color=_ACCENT_BY_CITY.get(brief.get("city_id"), _DEFAULT_ACCENT),
        # int() because a re-render sourced from BigQuery hands us a float
        # ("92.0" on the card reads sloppy); scores are conceptually 0-100 ints.
        enthusiasm_score=int(brief.get("enthusiasm_score") or 0),
        fan_behavior_style=brief.get("fan_behavior_style", ""),
        local_phrases=brief.get("local_phrases", []),
        lean_into=talent_brief.get("lean_into", []),
        avoid_list=talent_brief.get("avoid", []),
        fan_questions=talent_brief.get("fan_questions", []),
        grounding_check_passed=brief.get("grounding_check_passed", False),
    )


def _upload_html(html: str, brief_id: str) -> str:
    bucket_name = os.environ["DELIGHT_CARD_BUCKET"]
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"delight-cards/{brief_id}.html")
    blob.upload_from_string(html, content_type="text/html")
    return blob.public_url


@functions_framework.http
def render_delight_card(request):
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "expected a JSON body with the finalized brief"}), 400

    brief_id = payload.get("brief_id") or str(uuid.uuid4())
    html = _render_html(payload)
    url = _upload_html(html, brief_id)

    return jsonify({"brief_id": brief_id, "delight_card_url": url})
