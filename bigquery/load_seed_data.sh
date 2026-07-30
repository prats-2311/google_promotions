#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-liifecalling-academy}"
DATASET="tour_intelligence"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bq query --project_id="$PROJECT_ID" --use_legacy_sql=false < "$SCRIPT_DIR/schema.sql"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.cities" "$SCRIPT_DIR/seed/cities.jsonl"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.culture_notes" "$SCRIPT_DIR/seed/culture_notes.jsonl"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.fan_signals" "$SCRIPT_DIR/seed/fan_signals.jsonl"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.local_delight" "$SCRIPT_DIR/seed/local_delight.jsonl"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.campaigns" "$SCRIPT_DIR/seed/campaigns.jsonl"

bq load --project_id="$PROJECT_ID" --source_format=NEWLINE_DELIMITED_JSON --replace \
  "${DATASET}.campaign_stops" "$SCRIPT_DIR/seed/campaign_stops.jsonl"

echo "tour_intelligence dataset provisioned and seeded in project ${PROJECT_ID}."
echo "city_briefs is intentionally left empty — it is written live by the Campaign Orchestrator."
