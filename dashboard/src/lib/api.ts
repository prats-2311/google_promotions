import type { Campaign, CampaignOverview, CityDetail, ChatMessage, NewCampaignInput, StrategyChatResponse } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export function getCampaignOverview(campaignId: string) {
  return getJson<CampaignOverview>(`/api/campaigns/${campaignId}/overview`);
}

export function listCampaigns() {
  return getJson<{ campaigns: Campaign[] }>("/api/campaigns");
}

export async function createCampaign(input: NewCampaignInput) {
  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create campaign failed: ${res.status}`);
  return res.json() as Promise<{ campaign_id: string; status: string }>;
}

export async function chatAboutStrategy(messages: ChatMessage[], strategyText: string | null) {
  const res = await fetch("/api/campaign-strategy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, strategy_text: strategyText }),
  });
  if (!res.ok) throw new Error(`campaign strategy chat failed: ${res.status}`);
  return res.json() as Promise<StrategyChatResponse>;
}

export class GenerationAlreadyInFlightError extends Error {}

export async function generateBriefs(campaignId: string) {
  const res = await fetch(`/api/campaigns/${campaignId}/generate-briefs`, { method: "POST" });
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
  });
  if (!res.ok) throw new Error(`rank-cities failed: ${res.status}`);
  return res.json() as Promise<{ ranked: Array<{ city_id: string; enthusiasm_score: number; city_importance_tier: string; strategic_rank: number }> }>;
}
