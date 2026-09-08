export interface Campaign {
  campaign_id: string;
  title: string;
  campaign_type: string;
  genre: string;
  talent_roster: string[];
  status: string;
  selected_metrics: string[];
}

export interface CampaignStop {
  city_id: string;
  city_name: string;
  stop_date: string;
  sequence_order: number;
  event_format: string | null;
}

export interface CityOverview extends CampaignStop {
  status: string;
  enthusiasm_score: number | null;
  grounding_check_passed: boolean | null;
  delight_card_url: string | null;
  city_importance_tier: string | null;
}

export interface CampaignInsight {
  title: string;
  summary: string;
  severity: "info" | "advisory" | "risk";
  affected_cities: string[];
}

export interface CampaignOverview {
  campaign: Campaign;
  cities: CityOverview[];
  campaignInsights: CampaignInsight[];
}

export interface CultureNotes {
  city_id: string;
  etiquette_notes: string;
  greeting_style: string;
  media_behavior_notes: string;
  fan_interaction_style: string;
  dos: string[];
  donts: string[];
  humor_boundaries: string;
}

export interface LocalPhrase {
  phrase: string;
  phonetic: string;
  meaning: string;
  usage_context: string;
}

export interface BelovedIcon {
  name: string;
  domain: string;
  reference_note: string;
}

export interface LocalDelight {
  city_id: string;
  local_phrases: LocalPhrase[];
  cultural_references: string[];
  beloved_icons: BelovedIcon[];
  crowd_moment_suggestions: string[];
  music_or_remix_ideas: string[];
}

export interface FanSignal {
  city_id: string;
  genre: string;
  artist_type: string;
  enthusiasm_score: number;
  fan_behavior_style: string;
  city_importance_tier: string;
  genre_affinity_notes: string;
  signal_basis: string;
}

export interface TalentBrief {
  topics_to_lean_into: string[];
  topics_to_avoid: string[];
  pronounceable_local_lines: (string | { phrase: string; meaning?: string })[];
  // Object form (question + suggested_response) is the current shape; plain
  // strings are read for backward compatibility with briefs finalized
  // before talking points were added.
  high_probability_fan_questions: (string | { question: string; suggested_response?: string })[];
}

export interface CityBrief {
  brief_id: string;
  campaign_id: string;
  city_id: string;
  generated_at: string | null;
  status: string;
  enthusiasm_score: number | null;
  culture_summary: string | null;
  local_delight_summary: string | null;
  talent_brief_json: string | null;
  grounding_check_passed: boolean | null;
  grounding_check_notes: string | null;
  delight_card_url: string | null;
  demographic_snapshot_json: string | null;
  pronunciation_audio_json: string | null;
  style_moodboard_url: string | null;
  venue_notes_json: string | null;
}

export interface DemographicSnapshot {
  city_id?: string;
  source?: string;
  confidence?: "high" | "medium" | "low";
  literacy_rate: number | null;
  median_age: number | null;
  population: number | null;
  median_household_income_usd: number | null;
  internet_penetration_rate: number | null;
  dominant_social_platforms: string[];
  top_interest_categories: string[];
  notable_public_holidays: string[];
}

export interface MonitorCitation {
  url: string;
  title: string;
}

export interface MonitorEvent {
  event_date: string | null;
  summary: string | null;
  citations: MonitorCitation[];
}

export interface StopOutcome {
  source: "parallel_live";
  citations: MonitorCitation[];
  outcome_summary: string | null;
  sentiment: "positive" | "mixed" | "negative" | "unknown";
  confidence: "high" | "medium" | "low";
  notice?: string;
}

export interface StopSafetyChecklist {
  campaign_id: string;
  city_id: string;
  generated_at: string | null;
  showstop_manager_assigned: boolean | null;
  showstop_manager_name: string | null;
  capacity_confirmed: boolean | null;
}

export interface VisaRequirements {
  source: "parallel_live";
  citations: MonitorCitation[];
  search_queries_used: string[];
  visa_type: string | null;
  typical_lead_time_weeks: number | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

export interface SeasonalWeatherRisk {
  source: "parallel_live";
  citations: MonitorCitation[];
  search_queries_used: string[];
  risk_level: "high" | "medium" | "low" | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

export interface VenueCommutePoint {
  name: string;
  distance_or_travel_time: string;
}

export interface VenueNotes {
  source: string;
  citations: MonitorCitation[];
  capacity: string | null;
  typical_event_format: string | null;
  logistics_notes: string | null;
  technical_rider_notes: string | null;
  customs_notes: string | null;
  nearest_airport: VenueCommutePoint | null;
  nearest_railway_station: VenueCommutePoint | null;
  confidence: "high" | "medium" | "low";
}

export interface DiscoveredVenue {
  name: string;
  venue_type: string;
  approx_capacity: string | null;
  source_url: string;
  note: string | null;
}

export interface VenueDiscoveryResponse {
  source: string;
  venues: DiscoveredVenue[];
  citations: MonitorCitation[];
  search_queries_used: string[];
}

export interface LocalVendor {
  name: string;
  category: string;
  note: string | null;
  source_url: string;
}

export interface LocalCrewVendorsResponse {
  source: string;
  vendors: LocalVendor[];
  labor_notes: string | null;
  citations: MonitorCitation[];
  search_queries_used: string[];
}

export interface City {
  city_id: string;
  city_name: string;
  country: string | null;
  primary_language: string | null;
  timezone: string | null;
  region: string | null;
}

export interface BulkAddCitiesResponse {
  added: string[];
  skipped_existing: string[];
}

export interface GenreRecommendation {
  city_id: string;
  avg_enthusiasm_score: number;
  sample_size: number;
}

export interface GenreRecommendationsResponse {
  genre: string;
  recommendations: GenreRecommendation[];
}

export interface PronunciationAudio {
  phrase: string;
  audio_url: string | null;
  error?: string;
}

// The honest "thinking" behind a generated key-art image: the real grounded
// signals selected, the real event context, and the EXACT prompt sent to the
// image model -- never a reconstructed rationale (same discipline as
// deriveTrace, see dashboard/CLAUDE.md). null when the image predates this
// trace or came from the brief row.
export interface MoodboardTrace {
  style_notes: string;
  campaign_context: string | null;
  prompt: string;
  model: string;
  cached: boolean;
}

export interface CityDetail {
  campaign: Campaign;
  stop: CampaignStop;
  cultureNotes: CultureNotes;
  localDelight: LocalDelight;
  fanSignal: FanSignal | null;
  brief: CityBrief | null;
  demographicSnapshot: DemographicSnapshot | null;
  pronunciationAudio: PronunciationAudio[] | null;
  moodboardTrace: MoodboardTrace | null;
}

export interface TraceStep {
  kind: "tool" | "playbook" | "utterance";
  label: string;
  detail?: string;
}

export interface NewCampaignStopInput {
  city_id: string;
  stop_date: string;
  event_format?: string | null;
  venue_url?: string | null;
}

export interface NewCampaignInput {
  title: string;
  campaign_type: string;
  genre: string;
  talent_roster: string[];
  stops: NewCampaignStopInput[];
  selected_metrics: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Present when this assistant reply was regenerated from a live Parallel
  // search (a current-events question) -- the sources it answered from.
  citations?: MonitorCitation[];
}

export interface SuggestedCampaign {
  title: string;
  campaign_type: string;
  genre: string;
  talent_roster: string[];
  stops: NewCampaignStopInput[];
}

export interface FranchiseContext {
  title: string;
  is_real_property: boolean;
  source_type: string | null;
  synopsis: string | null;
  core_themes: string[];
  confidence: "high" | "medium" | "low";
}

export interface StrategyChatResponse {
  reply: string;
  ready: boolean;
  suggested_campaign: SuggestedCampaign | null;
  franchise_context: FranchiseContext | null;
  live_citations?: MonitorCitation[];
}

export interface ProposedCampaignChanges {
  title: string | null;
  genre: string | null;
  campaign_type: string | null;
  talent_roster: string[] | null;
  add_stops: { city_id: string; stop_date: string }[];
  remove_stop_city_ids: string[];
}

export interface CampaignEditChatResponse {
  reply: string;
  ready_to_apply: boolean;
  proposed_changes: ProposedCampaignChanges | null;
  franchise_context: FranchiseContext | null;
  live_citations?: MonitorCitation[];
}

export interface UpdatedCampaign {
  campaign_id: string;
  title: string;
  campaign_type: string;
  genre: string;
  talent_roster: string[];
  status: string;
  selected_metrics: string[];
}
