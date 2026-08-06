import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
