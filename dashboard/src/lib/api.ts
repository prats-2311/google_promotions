import type { CampaignOverview, CityDetail } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export function getCampaignOverview(campaignId: string) {
  return getJson<CampaignOverview>(`/api/campaigns/${campaignId}/overview`);
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
