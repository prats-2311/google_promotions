import type { Campaign, CampaignOverview, CityDetail, ChatMessage, NewCampaignInput, StrategyChatResponse, GenreRecommendationsResponse, MonitorEvent, StopOutcome, City, BulkAddCitiesResponse, VenueDiscoveryResponse, LocalCrewVendorsResponse } from "./types";

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

export function listCities() {
  return getJson<{ cities: City[] }>("/api/cities");
}

export async function bulkAddCities(cityNames: string[]) {
  const res = await fetch("/api/bulk-add-cities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_names: cityNames }),
    // Real Parallel Task API research for multiple cities takes longer than
    // the default 30s budget -- give it real room rather than a false timeout.
    signal: AbortSignal.timeout(120000),
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

export async function chatAboutStrategy(messages: ChatMessage[], strategyText: string | null) {
  const res = await fetch("/api/campaign-strategy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, strategy_text: strategyText }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
