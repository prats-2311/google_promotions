-- tour_intelligence dataset: Agent Builder Data Store backing tables
-- for the Agentic Tour & Promotion Intelligence OS MVP.

CREATE SCHEMA IF NOT EXISTS `tour_intelligence`
OPTIONS (location = 'US');

CREATE TABLE IF NOT EXISTS `tour_intelligence.cities` (
  city_id STRING NOT NULL,
  city_name STRING NOT NULL,
  country STRING NOT NULL,
  primary_language STRING NOT NULL,
  timezone STRING NOT NULL,
  region STRING NOT NULL
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.culture_notes` (
  city_id STRING NOT NULL,
  etiquette_notes STRING,
  greeting_style STRING,
  media_behavior_notes STRING,
  fan_interaction_style STRING,
  dos ARRAY<STRING>,
  donts ARRAY<STRING>,
  humor_boundaries STRING,
  last_updated TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.fan_signals` (
  city_id STRING NOT NULL,
  genre STRING NOT NULL,
  artist_type STRING NOT NULL,
  enthusiasm_score FLOAT64,
  fan_behavior_style STRING,
  city_importance_tier STRING,
  genre_affinity_notes STRING,
  signal_basis STRING,
  last_updated TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.local_delight` (
  city_id STRING NOT NULL,
  local_phrases ARRAY<STRUCT<
    phrase STRING,
    phonetic STRING,
    meaning STRING,
    usage_context STRING
  >>,
  cultural_references ARRAY<STRING>,
  beloved_icons ARRAY<STRUCT<
    name STRING,
    domain STRING,
    reference_note STRING
  >>,
  crowd_moment_suggestions ARRAY<STRING>,
  music_or_remix_ideas ARRAY<STRING>,
  last_updated TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.campaigns` (
  campaign_id STRING NOT NULL,
  title STRING NOT NULL,
  campaign_type STRING NOT NULL,
  genre STRING,
  talent_roster ARRAY<STRING>,
  status STRING,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.campaign_stops` (
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  stop_date DATE,
  sequence_order INT64,
  event_format STRING
);

-- Written live by the Campaign Orchestrator (the "agents act" proof point):
-- one INSERT per city per campaign run, plus an UPDATE once the Cloud Run
-- delight-card renderer returns a URL.
CREATE TABLE IF NOT EXISTS `tour_intelligence.city_briefs` (
  brief_id STRING NOT NULL,
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  generated_at TIMESTAMP,
  status STRING,
  enthusiasm_score FLOAT64,
  culture_summary STRING,
  local_delight_summary STRING,
  talent_brief_json STRING,
  grounding_check_passed BOOL,
  grounding_check_notes STRING,
  delight_card_url STRING
);
