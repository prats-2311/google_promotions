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
        sting_url=brief.get("sting_url"),
        venue=brief.get("venue"),
    )


def _upload_html(html: str, object_path: str) -> str:
    bucket_name = os.environ["DELIGHT_CARD_BUCKET"]
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_path)
    # GCS defaults public objects to max-age=3600 -- without this, a planner
    # who regenerates an artifact keeps being served the hour-old copy.
    blob.cache_control = "no-cache"
    blob.upload_from_string(html, content_type="text/html")
    return blob.public_url


def _fmt_compact(n) -> str:
    """12500000 -> '12.5M' -- chart/table labels in the tour book."""
    try:
        n = float(n)
    except (TypeError, ValueError):
        return "—"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return f"{n:.0f}"


def _render_tour_book(payload: dict) -> str:
    """The campaign-level executive tour book: the whole-tour document a
    planner hands their boss -- itinerary, per-city market data, venue
    logistics, activation plan -- assembled from the same grounded rows the
    per-city cards use. The BFF gathers the data; this only lays it out."""
    template = _ENV.get_template("tour_book.html")
    cities = payload.get("cities", [])

    scored = [c for c in cities if c.get("enthusiasm_score") is not None]
    avg_score = round(sum(c["enthusiasm_score"] for c in scored) / len(scored)) if scored else 0
    populations = [
        (c.get("demographics") or {}).get("population")
        for c in cities
        if (c.get("demographics") or {}).get("population")
    ]
    max_pop = max(populations) if populations else 0

    enriched = []
    for c in cities:
        demo = c.get("demographics") or {}
        pop = demo.get("population")
        enriched.append({
            **c,
            "accent": _ACCENT_BY_CITY.get(c.get("city_id"), _DEFAULT_ACCENT),
            "score": int(c.get("enthusiasm_score") or 0),
            "pop_label": _fmt_compact(pop) if pop else None,
            "pop_pct": round(pop / max_pop * 100) if pop and max_pop else 0,
            "income_label": _fmt_compact(demo.get("median_household_income_usd"))
            if demo.get("median_household_income_usd") else None,
        })

    dates = sorted(c["stop_date"] for c in cities if c.get("stop_date"))
    campaign = payload.get("campaign", {})
    return template.render(
        campaign=campaign,
        campaign_type_label=str(campaign.get("campaign_type", "")).replace("_", " "),
        cities=enriched,
        insights=payload.get("insights", []),
        generated_at=payload.get("generated_at", ""),
        avg_score=avg_score,
        date_span=f"{dates[0]} → {dates[-1]}" if dates else "",
        tier1_count=sum(1 for c in cities if "1" in str(c.get("tier") or "")),
        verified_count=sum(1 for c in cities if c.get("grounding_check_passed")),
    )


@functions_framework.http
def render_delight_card(request):
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "expected a JSON body"}), 400

    # Same service, two artifacts: the per-city delight card (default) and
    # the campaign-level tour book (path-routed) -- both are "render real
    # brief data to a stored HTML artifact", so they share the upload path,
    # accents, and deploy story.
    if str(getattr(request, "path", "") or "").rstrip("/").endswith("/tour_book"):
        campaign_id = (payload.get("campaign") or {}).get("campaign_id") or str(uuid.uuid4())
        html = _render_tour_book(payload)
        url = _upload_html(html, f"tour-books/{campaign_id}.html")
        return jsonify({"campaign_id": campaign_id, "tour_book_url": url})

    brief_id = payload.get("brief_id") or str(uuid.uuid4())
    html = _render_html(payload)
    url = _upload_html(html, f"delight-cards/{brief_id}.html")
    return jsonify({"brief_id": brief_id, "delight_card_url": url})
