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

-- General, campaign/genre-independent city facts (literacy, income, interests,
-- digital habits) -- distinct from fan_signals, which is genre-scoped. Selected
-- per-campaign via campaigns.selected_metrics; curated for the 5 demo cities,
-- with the same Parallel-Search-live-fallback pattern as culture_notes/local_delight
-- for any other city (see tour_data_api/CLAUDE.md).
CREATE TABLE IF NOT EXISTS `tour_intelligence.city_demographics` (
  city_id STRING NOT NULL,
  literacy_rate FLOAT64,
  median_age FLOAT64,
  population INT64,
  median_household_income_usd FLOAT64,
  internet_penetration_rate FLOAT64,
  dominant_social_platforms ARRAY<STRING>,
  top_interest_categories ARRAY<STRING>,
  notable_public_holidays ARRAY<STRING>,
  source STRING,
  last_updated TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.campaigns` (
  campaign_id STRING NOT NULL,
  title STRING NOT NULL,
  campaign_type STRING NOT NULL,
  genre STRING,
  talent_roster ARRAY<STRING>,
  status STRING,
  created_at TIMESTAMP,
  selected_metrics ARRAY<STRING>
);

CREATE TABLE IF NOT EXISTS `tour_intelligence.campaign_stops` (
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  stop_date DATE,
  sequence_order INT64,
  event_format STRING,
  venue_url STRING
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
  delight_card_url STRING,
  demographic_snapshot_json STRING,
  pronunciation_audio_json STRING,
  venue_notes_json STRING,
  style_moodboard_url STRING
);

-- A Parallel Monitor is created on demand (not at brief-finalization time),
-- well after the city_briefs row is written -- and city_briefs rows sit in
-- BigQuery's streaming-insert buffer for up to ~90 minutes during which
-- UPDATE fails outright. A separate insert-once table sidesteps that
-- entirely rather than trying to retrofit an UPDATE onto city_briefs. One
-- row per campaign+city (idempotent creation checks this table first before
-- calling Parallel again).
-- monitor_type distinguishes cultural drift ('cultural') from safety/
-- logistics drift ('safety') -- two independent Parallel Monitors per city,
-- different query focus, same underlying infrastructure. Existing rows
-- predate this column and are all 'cultural' (backfilled below).
CREATE TABLE IF NOT EXISTS `tour_intelligence.city_monitors` (
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  monitor_type STRING,
  monitor_id STRING NOT NULL,
  created_at TIMESTAMP
);

-- One row per finalized stop once its date has passed and a retrospective
-- has been run -- the real, actual outcome (press/fan reaction), distinct
-- from the pre-show *predicted* enthusiasm_score on city_briefs. Closes the
-- loop cross-campaign learning would otherwise only ever guess at.
CREATE TABLE IF NOT EXISTS `tour_intelligence.stop_outcomes` (
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  generated_at TIMESTAMP,
  outcome_json STRING
);

-- One row per planner-filled day-of-show safety/capacity checklist entry --
-- explicitly NOT AI-synthesized (no Parallel/Gemini call), a manual
-- planner-input record, same insert-only/latest-by-generated_at shape as
-- stop_outcomes above.
CREATE TABLE IF NOT EXISTS `tour_intelligence.stop_safety_checklist` (
  campaign_id STRING NOT NULL,
  city_id STRING NOT NULL,
  generated_at TIMESTAMP,
  showstop_manager_assigned BOOL,
  showstop_manager_name STRING,
  capacity_confirmed BOOL
);

-- One row per campaign-insights synthesis run (a rerun after new stops finish
-- produces another row; consumers take the latest by generated_at, same
-- pattern as city_briefs). Written once at the end of a full campaign run,
-- after every stop's real city_briefs row already exists.
CREATE TABLE IF NOT EXISTS `tour_intelligence.campaign_insights` (
  campaign_id STRING NOT NULL,
  generated_at TIMESTAMP,
  insights_json STRING
);

-- CREATE TABLE IF NOT EXISTS is a no-op against tables that already exist
-- live in this dataset -- these ALTERs are what actually patch them when this
-- script is re-run against the already-provisioned liifecalling-academy project.
ALTER TABLE `tour_intelligence.campaigns`
  ADD COLUMN IF NOT EXISTS selected_metrics ARRAY<STRING>;

ALTER TABLE `tour_intelligence.city_briefs`
  ADD COLUMN IF NOT EXISTS demographic_snapshot_json STRING;

ALTER TABLE `tour_intelligence.city_briefs`
  ADD COLUMN IF NOT EXISTS pronunciation_audio_json STRING;

ALTER TABLE `tour_intelligence.city_briefs`
  ADD COLUMN IF NOT EXISTS venue_notes_json STRING;

ALTER TABLE `tour_intelligence.city_briefs`
  ADD COLUMN IF NOT EXISTS style_moodboard_url STRING;

ALTER TABLE `tour_intelligence.campaign_stops`
  ADD COLUMN IF NOT EXISTS venue_url STRING;

ALTER TABLE `tour_intelligence.city_monitors`
  ADD COLUMN IF NOT EXISTS monitor_type STRING;

-- Full campaign editing (title/genre/roster/stops, post-creation): an
-- UPDATE would hit the streaming-buffer limitation on a just-inserted row
-- (see bigquery/CLAUDE.md), so an edit is a new row, not a mutation --
-- same insert-only "latest revision wins" pattern city_briefs already uses
-- (QUALIFY ROW_NUMBER() ... ORDER BY updated_at DESC = 1 at read time).
-- created_at stays frozen at the original insert across every revision;
-- updated_at is what each new revision bumps.
ALTER TABLE `tour_intelligence.campaigns`
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Same pattern for stops: adding a city, changing its date, and removing it
-- are all just a new row for that (campaign_id, city_id) with a fresher
-- updated_at -- removal is `removed = true` on the newest row rather than
-- an actual DELETE, which would hit the same streaming-buffer wall.
ALTER TABLE `tour_intelligence.campaign_stops`
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

ALTER TABLE `tour_intelligence.campaign_stops`
  ADD COLUMN IF NOT EXISTS removed BOOL;

-- Server-backed assistant chat history (2026-09-09): the strategy chat and
-- the campaign edit chat persist their transcript + context here so a
-- conversation survives across devices, not just refreshes (localStorage
-- remains the fast first tier). Insert-only latest-wins, same pattern as
-- campaigns/city_briefs: every save is a new row, reads take the newest
-- updated_at per session_key -- never UPDATE (streaming buffer).
CREATE TABLE IF NOT EXISTS `tour_intelligence.chat_sessions` (
  session_key STRING NOT NULL,
  messages_json STRING,
  context_json STRING,
  updated_at TIMESTAMP
);
