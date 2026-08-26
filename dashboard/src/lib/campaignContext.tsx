import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns } from "./api";
import type { Campaign } from "./types";

const DEFAULT_CAMPAIGN_ID = "nova_horizon_2026";
const STORAGE_KEY = "activeCampaignId";

interface CampaignContextValue {
  campaigns: Campaign[];
  activeCampaignId: string;
  activeCampaign: Campaign | null;
  setActiveCampaignId: (id: string) => void;
  refresh: () => void;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [activeCampaignId, setActiveCampaignIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_CAMPAIGN_ID
  );

  const { data, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: listCampaigns,
  });
  const campaigns = data?.campaigns ?? [];
  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const setActiveCampaignId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveCampaignIdState(id);
  }, []);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.campaign_id === activeCampaignId) ?? null,
    [campaigns, activeCampaignId]
  );

  // Self-heal a stale activeCampaignId (a deleted campaign, a stale bookmark,
  // a shared link) rather than leaving the app hung -- the overview fetch
  // for a nonexistent campaign_id 502s, and every page here just shows a
  // loading skeleton forever with no way out, since there's no signal that
  // distinguishes "still fetching" from "will never succeed." Once the real
  // campaigns list has loaded and the stored id isn't in it, fall back to a
  // real campaign automatically.
  useEffect(() => {
    if (!data) return;
    if (campaigns.length === 0) return;
    const stillExists = campaigns.some((c) => c.campaign_id === activeCampaignId);
    if (!stillExists) setActiveCampaignId(campaigns[0].campaign_id);
  }, [data, campaigns, activeCampaignId, setActiveCampaignId]);

  const value = useMemo(
    () => ({ campaigns, activeCampaignId, activeCampaign, setActiveCampaignId, refresh }),
    [campaigns, activeCampaignId, activeCampaign, setActiveCampaignId, refresh]
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaignContext() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaignContext must be used within a CampaignProvider");
  return ctx;
}
