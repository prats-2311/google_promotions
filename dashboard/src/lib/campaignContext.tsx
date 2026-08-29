import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  refresh: () => Promise<unknown>;
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
  // Returns the refetch promise -- a caller that's about to setActiveCampaignId
  // to a brand-new id (just-created campaign) needs to await this first, or
  // the self-heal effect below races against the still-stale campaigns list
  // and reverts the new id right back (a real bug caught by testing this live).
  const refresh = useCallback(() => refetch(), [refetch]);

  // Every id ever explicitly activated this session (not just loaded from
  // localStorage on mount) -- see the self-heal effect below for why this
  // has to be an unconditional trust list, not a time-based grace window.
  const explicitlySetIdsRef = useRef<Set<string>>(new Set());

  const setActiveCampaignId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    explicitlySetIdsRef.current.add(id);
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
  //
  // Two real bugs this caused, both caught by testing live, not in theory:
  // right after creating a campaign, setActiveCampaignId(newId) fires, and
  // this effect can see the new id "missing" from `campaigns` and revert it.
  // A first fix tried awaiting the refetch before activating the new id; a
  // second tried a time-based grace window. Neither reliably closed the gap
  // -- BigQuery's streaming-insert visibility delay is not a fixed client-
  // side render-timing race, it's server-side and its latency isn't
  // bounded, so no clock-based window can be trusted to be long enough.
  // The actually-correct fix: once an id has been *explicitly* activated
  // this session (a real create, a real switch -- not just inherited from
  // localStorage on mount), trust it unconditionally and never let this
  // list-membership heuristic revert it. It'll simply stop needing to act
  // once the list eventually catches up. Self-heal still protects the
  // original scenario this was built for -- an id that arrived purely from
  // localStorage and was never touched this session.
  useEffect(() => {
    if (!data) return;
    if (campaigns.length === 0) return;
    const stillExists = campaigns.some((c) => c.campaign_id === activeCampaignId);
    if (stillExists) return;
    if (explicitlySetIdsRef.current.has(activeCampaignId)) return;
    setActiveCampaignId(campaigns[0].campaign_id);
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
