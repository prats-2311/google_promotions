import type { Campaign, CampaignOverview, CityDetail, ChatMessage, LiveMetricResult, NewCampaignInput, StrategyChatResponse, GenreRecommendationsResponse, MonitorEvent, StopOutcome, City, BulkAddCitiesResponse, VenueDiscoveryResponse, LocalCrewVendorsResponse, VisaRequirements, SeasonalWeatherRisk, StopSafetyChecklist, FranchiseContext, CampaignEditChatResponse, UpdatedCampaign } from "./types";

// Defense in depth alongside the BFF's own callTool timeout (server/index.js)
// -- a request that somehow hangs past this still rejects instead of leaving
// a query stuck on its loading skeleton forever with nothing to show.
const REQUEST_TIMEOUT_MS = 30000;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export function getCampaignOverview(campaignId: string) {
  return getJson<CampaignOverview>(`/api/campaigns/${campaignId}/overview`);
}

// Turn the Delight Card's entrance-cue text into a real Lyria music clip.
// Slow path (real music generation, ~10-30s fresh; instant when cached).
export async function generateEntranceSting(
  cityId: string,
  cityName: string,
  stingIdea: string,
  campaignContext: string
) {
  const res = await fetch("/api/entrance-sting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_id: cityId, city_name: cityName, sting_idea: stingIdea, campaign_context: campaignContext }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`entrance sting failed: ${res.status}`);
  return res.json() as Promise<{ sting_url: string; generation_trace: { prompt: string; model: string; cached: boolean } }>;
}

// Resolve a campaigner-named custom metric for a city via live search --
// slow path (Parallel + Gemini), fetched on demand from the city page.
export async function getLiveMetric(cityName: string, metric: string) {
  const res = await fetch("/api/live-metric-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_name: cityName, metric }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`live metric failed: ${res.status}`);
  return res.json() as Promise<LiveMetricResult>;
}

// Server tier of the two-tier assistant-chat history (localStorage is the
// instant tier): read on mount to adopt a session started on another
// device; written fire-and-forget after every turn -- sync must never
// break the chat itself.
export function getChatSession(sessionKey: string) {
  return getJson<{ session_key: string; messages: ChatMessage[]; context: unknown; updated_at: string | null }>(
    `/api/chat-session?session_key=${encodeURIComponent(sessionKey)}`
  );
}

export async function saveChatSession(sessionKey: string, messages: ChatMessage[], context: unknown = null) {
  const res = await fetch("/api/chat-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_key: sessionKey, messages, context }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`chat-session save failed: ${res.status}`);
  return res.json() as Promise<{ session_key: string; status: string }>;
}

// Assembles + renders the whole-campaign executive tour book (the boss-facing
// document) -- the BFF gathers every stop's real data and the renderer
// service lays it out; nothing is generated at render time. 60s timeout: it
// fans out across every stop's lookups before rendering.
export async function generateTourBook(campaignId: string) {
  const res = await fetch("/api/tour-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`tour book failed: ${res.status}`);
  return res.json() as Promise<{ tour_book_url: string }>;
}

export function listCampaigns() {
  return getJson<{ campaigns: Campaign[] }>("/api/campaigns");
}

export function getGenreRecommendations(genre: string) {
  return getJson<GenreRecommendationsResponse>(`/api/genre-recommendations?genre=${encodeURIComponent(genre)}`);
}

export async function createCityMonitor(
  campaignId: string,
  cityId: string,
  cityName: string,
  monitorType: "cultural" | "safety" = "cultural"
) {
  const res = await fetch("/api/city-monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaign_id: campaignId,
      city_id: cityId,
      city_name: cityName,
      monitor_type: monitorType,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`create city monitor failed: ${res.status}`);
  return res.json() as Promise<{ monitor_id: string; created: boolean }>;
}

export async function triggerCityMonitor(monitorId: string) {
  const res = await fetch("/api/trigger-city-monitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monitor_id: monitorId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`trigger city monitor failed: ${res.status}`);
  return res.json() as Promise<{ status: string }>;
}

export function getCityMonitorEvents(monitorId: string) {
  return getJson<{ events: MonitorEvent[] }>(`/api/city-monitor-events?monitor_id=${encodeURIComponent(monitorId)}`);
}

export async function synthesizeStopOutcome(
  campaignId: string,
  cityId: string,
  cityName: string,
  campaignTitle: string,
  stopDate: string
) {
  const res = await fetch("/api/synthesize-stop-outcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaign_id: campaignId,
      city_id: cityId,
      city_name: cityName,
      campaign_title: campaignTitle,
      stop_date: stopDate,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`synthesize stop outcome failed: ${res.status}`);
  return res.json() as Promise<StopOutcome>;
}

export function getStopOutcome(campaignId: string, cityId: string) {
  return getJson<{ campaign_id: string; city_id: string; generated_at: string | null; outcome_json: string | null }>(
    `/api/stop-outcomes?campaign_id=${encodeURIComponent(campaignId)}&city_id=${encodeURIComponent(cityId)}`
  );
}

export async function saveStopOutcome(campaignId: string, cityId: string, outcome: StopOutcome) {
  const res = await fetch("/api/stop-outcomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, city_id: cityId, outcome_json: JSON.stringify(outcome) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`save stop outcome failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; city_id: string; status: string }>;
}

export async function getLocalCrewVendors(cityName: string, country?: string | null) {
  const res = await fetch("/api/local-crew-vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_name: cityName, ...(country ? { country } : {}) }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`local crew & vendors lookup failed: ${res.status}`);
  return res.json() as Promise<LocalCrewVendorsResponse>;
}

export async function discoverVenues(cityName: string, country?: string | null) {
  const res = await fetch("/api/discover-venues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_name: cityName, ...(country ? { country } : {}) }),
    // Real Parallel Search + Gemini synthesis, not instant.
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`discover venues failed: ${res.status}`);
  return res.json() as Promise<VenueDiscoveryResponse>;
}

export async function getVisaRequirements(artistNationality: string, destinationCountry: string) {
  const res = await fetch("/api/visa-requirements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artist_nationality: artistNationality, destination_country: destinationCountry }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`visa requirements lookup failed: ${res.status}`);
  return res.json() as Promise<VisaRequirements>;
}

export async function getSeasonalWeatherRisk(cityName: string, monthOrDate: string, country?: string | null) {
  const res = await fetch("/api/seasonal-weather-risk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_name: cityName, month_or_date: monthOrDate, ...(country ? { country } : {}) }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`seasonal weather risk lookup failed: ${res.status}`);
  return res.json() as Promise<SeasonalWeatherRisk>;
}

export function getStopSafetyChecklist(campaignId: string, cityId: string) {
  return getJson<StopSafetyChecklist>(
    `/api/stop-safety-checklist?campaign_id=${encodeURIComponent(campaignId)}&city_id=${encodeURIComponent(cityId)}`
  );
}

export async function saveStopSafetyChecklist(
  campaignId: string,
  cityId: string,
  fields: { showstop_manager_assigned: boolean; showstop_manager_name: string | null; capacity_confirmed: boolean }
) {
  const res = await fetch("/api/stop-safety-checklist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, city_id: cityId, ...fields }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`save stop safety checklist failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; city_id: string; status: string }>;
}

export function listCities() {
  return getJson<{ cities: City[] }>("/api/cities");
}

export async function bulkAddCities(cityNames: string[]) {
  const res = await fetch("/api/bulk-add-cities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_names: cityNames }),
    // Real Parallel Task API research for multiple cities takes longer than
    // the default 30s budget -- give it real room rather than a false
    // timeout. Matches the BFF's own signal for this route and
    // tour_data_api's gunicorn --timeout, so no layer gives up before the
    // others.
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`bulk add cities failed: ${res.status}`);
  return res.json() as Promise<BulkAddCitiesResponse>;
}

export async function createCampaign(input: NewCampaignInput) {
  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`create campaign failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; status: string }>;
}

export async function updateCampaign(
  campaignId: string,
  partial: Partial<{
    title: string;
    genre: string;
    campaign_type: string;
    talent_roster: string[];
    selected_metrics: string[];
  }>
) {
  const res = await fetch("/api/update-campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, ...partial }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`update campaign failed: ${res.status}`);
  return res.json() as Promise<UpdatedCampaign>;
}

export async function addCampaignStops(campaignId: string, stops: { city_id: string; stop_date: string }[]) {
  const res = await fetch("/api/add-campaign-stops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, stops }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`add campaign stops failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; status: string; count: number }>;
}

export async function removeCampaignStop(campaignId: string, cityId: string) {
  const res = await fetch("/api/remove-campaign-stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, city_id: cityId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`remove campaign stop failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; city_id: string; status: string }>;
}

export async function chatAboutCampaignEdit(
  campaignId: string,
  messages: ChatMessage[],
  franchiseContext: FranchiseContext | null = null
) {
  const res = await fetch("/api/campaign-edit-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: campaignId, messages, franchise_context: franchiseContext }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`campaign edit chat failed: ${res.status}`);
  return res.json() as Promise<CampaignEditChatResponse>;
}

export async function chatAboutStrategy(
  messages: ChatMessage[],
  strategyText: string | null,
  franchiseContext: FranchiseContext | null = null
) {
  const res = await fetch("/api/campaign-strategy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, strategy_text: strategyText, franchise_context: franchiseContext }),
    // Matches the BFF's own signal for this route -- a turn that triggers
    // franchise-context research chains up to 4 calls.
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`campaign strategy chat failed: ${res.status}`);
  return res.json() as Promise<StrategyChatResponse>;
}

export class GenerationAlreadyInFlightError extends Error {}

export async function generateBriefs(campaignId: string) {
  const res = await fetch(`/api/campaigns/${campaignId}/generate-briefs`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => null);
    throw new GenerationAlreadyInFlightError(body?.error || "Briefs are already being generated for this campaign.");
  }
  if (!res.ok) throw new Error(`generate-briefs failed: ${res.status}`);
  return res.json() as Promise<{ status: string; operation: string }>;
}

export function getCityDetail(campaignId: string, cityId: string) {
  return getJson<CityDetail>(`/api/campaigns/${campaignId}/cities/${cityId}`);
}

export async function rankCities(cityRecords: { city_id: string; enthusiasm_score: number; city_importance_tier: string }[]) {
  const res = await fetch("/api/rank-cities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_records: cityRecords }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`rank-cities failed: ${res.status}`);
  return res.json() as Promise<{ ranked: Array<{ city_id: string; enthusiasm_score: number; city_importance_tier: string; strategic_rank: number }> }>;
}
