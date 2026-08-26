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
}

export interface CampaignOverview {
  campaign: Campaign;
  cities: CityOverview[];
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
  high_probability_fan_questions: string[];
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

export interface CityDetail {
  campaign: Campaign;
  stop: CampaignStop;
  cultureNotes: CultureNotes;
  localDelight: LocalDelight;
  fanSignal: FanSignal | null;
  brief: CityBrief | null;
  demographicSnapshot: DemographicSnapshot | null;
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
}

export interface SuggestedCampaign {
  title: string;
  campaign_type: string;
  genre: string;
  talent_roster: string[];
  stops: NewCampaignStopInput[];
}

export interface StrategyChatResponse {
  reply: string;
  ready: boolean;
  suggested_campaign: SuggestedCampaign | null;
}
