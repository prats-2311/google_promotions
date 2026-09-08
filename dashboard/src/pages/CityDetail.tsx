import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  X,
  Smile,
  Sparkles,
  Landmark,
  Users,
  Music4,
  ThumbsUp,
  ShieldAlert,
  MessageCircleQuestion,
  Mic2,
  ExternalLink,
  Wrench,
  GitBranch,
  MessageCircle,
  BarChart3,
  Building2,
  Plane,
  TrainFront,
  RadioTower,
  RefreshCw,
  Loader2,
  Newspaper,
  Search,
  Stamp,
  CloudRain,
  ClipboardCheck,
  Gauge,
  Crown,
  ShieldCheck,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { StatMeter } from "../components/ui/StatMeter";
import { StatTile } from "../components/ui/StatTile";
import { getCityDetail, getLiveMetric } from "../lib/api";
import type { CityDetail as CityDetailData, LiveMetricResult, TalentBrief, TraceStep } from "../lib/types";
import { cityAccent, cityAccentOnPaper } from "../lib/cityTheme";
import { ThinkingTrace, type TraceStepItem } from "../components/ui/ThinkingTrace";
import { Tabs } from "../components/ui/Tabs";
import { deriveTrace } from "../lib/deriveTrace";
import { useCampaignContext } from "../lib/campaignContext";
import { CityDetailSkeleton } from "../components/ui/Skeletons";
import { CardErrorBoundary } from "../components/CardErrorBoundary";
import { Accordion } from "../components/ui/Accordion";
import { CueCard } from "../components/ui/CueCard";
import { AudioPlayButton } from "../components/ui/AudioPlayButton";
import {
  createCityMonitor,
  triggerCityMonitor,
  getCityMonitorEvents,
  synthesizeStopOutcome,
  getStopOutcome,
  saveStopOutcome,
  getLocalCrewVendors,
  getVisaRequirements,
  getSeasonalWeatherRisk,
  getStopSafetyChecklist,
  saveStopSafetyChecklist,
} from "../lib/api";
import type {
  MonitorEvent,
  StopOutcome,
  VenueNotes,
  LocalCrewVendorsResponse,
  VisaRequirements,
  SeasonalWeatherRisk,
} from "../lib/types";

const DRIFT_POLL_MS = 8000;
// Real observed trigger-to-result latency is ~60-90s (Parallel actually
// searches and reasons over live results, it doesn't return instantly) --
// 12 polls at 8s gives ~96s before giving up and reporting "no updates
// found yet" rather than polling forever.
const DRIFT_MAX_POLLS = 12;

// Continuous grounding: a brief is generated once, weeks before a tour date
// -- this is the one thing in the whole app that can tell you what's
// changed in a city *since* generation, because it's backed by a real
// Parallel Monitor rather than a static document. Genuinely can't exist as
// a one-shot feature.
function CulturalDriftCheck({
  campaignId,
  cityId,
  cityName,
  accent,
  monitorType = "cultural",
  label = "Cultural Drift Check",
  icon = RadioTower,
  noDriftMessage,
  idleMessage,
}: {
  campaignId: string;
  cityId: string;
  cityName: string;
  accent: string;
  monitorType?: "cultural" | "safety";
  label?: string;
  icon?: LucideIcon;
  noDriftMessage?: string;
  idleMessage?: string;
}) {
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [events, setEvents] = useState<MonitorEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: eventsData, dataUpdatedAt } = useQuery({
    queryKey: ["cityMonitorEvents", monitorId],
    queryFn: () => getCityMonitorEvents(monitorId as string),
    enabled: Boolean(monitorId) && checking,
    refetchInterval: checking ? DRIFT_POLL_MS : false,
  });

  useEffect(() => {
    // dataUpdatedAt (not eventsData) drives this effect: React Query's
    // structural sharing returns the SAME object reference across polls
    // whenever consecutive responses are content-identical (e.g. repeated
    // {events: []} while nothing has changed yet), so keying off eventsData
    // silently stops firing after the first empty poll. dataUpdatedAt ticks
    // on every fetch regardless of content.
    if (!checking || !eventsData) return;
    if (eventsData.events.length > 0) {
      setEvents(eventsData.events);
      setChecking(false);
      return;
    }
    setPollCount((c) => {
      const next = c + 1;
      if (next >= DRIFT_MAX_POLLS) {
        setChecking(false);
        setEvents([]);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  async function handleCheck() {
    setError(null);
    setEvents(null);
    setPollCount(0);
    try {
      const { monitor_id } = await createCityMonitor(campaignId, cityId, cityName, monitorType);
      setMonitorId(monitor_id);
      await triggerCityMonitor(monitor_id);
      setChecking(true);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="rounded-2xl bg-paper p-6">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={icon} accent={accent} label={label} />
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-sans text-[11.5px] text-ink transition-colors hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {checking ? `Checking… (${pollCount + 1}/${DRIFT_MAX_POLLS})` : "Check for updates"}
        </button>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't check for updates: {error}</p>}

      {!checking && events === null && !error && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">
          {idleMessage ??
            "This brief reflects real, cited data as of when it was generated. Run a live check against Parallel's continuous monitoring to see whether anything culturally relevant has shifted since."}
        </p>
      )}

      {!checking && events !== null && events.length === 0 && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">
          {noDriftMessage ?? `Checked just now — no notable cultural or news drift found for ${cityName}.`}
        </p>
      )}

      {events && events.length > 0 && (
        <div className="mt-3 space-y-3">
          {events.map((event, i) => (
            <div key={i} className="border-t border-line pt-3 first:border-0 first:pt-0">
              {event.event_date && (
                <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                  {event.event_date}
                </p>
              )}
              <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink">{event.summary}</p>
              {event.citations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {event.citations.map((c, j) => (
                    <a
                      key={j}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
                    >
                      {c.title || c.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Post-tour retrospective: distinct from city_briefs.enthusiasm_score, which
// is only ever a pre-show prediction -- this is a real, live-searched
// after-the-fact result, only meaningful once the stop's date has passed.
// Persisted via /stop_outcomes so a re-visit doesn't need to re-search.
function StopOutcomeCheck({
  campaignId,
  cityId,
  cityName,
  campaignTitle,
  stopDate,
  accent,
}: {
  campaignId: string;
  cityId: string;
  cityName: string;
  campaignTitle: string;
  stopDate: string;
  accent: string;
}) {
  const isPast = new Date(stopDate) < new Date();
  const { data: cached } = useQuery({
    queryKey: ["stopOutcome", campaignId, cityId],
    queryFn: () => getStopOutcome(campaignId, cityId),
    enabled: isPast,
  });

  const [outcome, setOutcome] = useState<StopOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cached?.outcome_json) return;
    try {
      setOutcome(JSON.parse(cached.outcome_json));
    } catch {
      // malformed cached row -- fall through to letting the user re-check
    }
  }, [cached]);

  async function handleCheck() {
    setError(null);
    setChecking(true);
    try {
      const result = await synthesizeStopOutcome(campaignId, cityId, cityName, campaignTitle, stopDate);
      setOutcome(result);
      await saveStopOutcome(campaignId, cityId, result);
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }

  if (!isPast) return null;

  const sentimentClass =
    outcome?.sentiment === "positive"
      ? "text-emerald-300"
      : outcome?.sentiment === "negative"
        ? "text-red-300"
        : "text-ink-muted";

  return (
    <div className="rounded-2xl bg-paper p-6">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={Newspaper} accent={accent} label="Post-Show Outcome" />
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-sans text-[11.5px] text-ink transition-colors hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {checking ? "Checking real reaction…" : outcome ? "Re-check" : "Check real outcome"}
        </button>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't check outcome: {error}</p>}

      {!outcome && !checking && !error && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">
          This stop's date has passed. Run a live search for real press or fan reaction — distinct from the
          pre-show enthusiasm prediction above.
        </p>
      )}

      {outcome && (
        <div className="mt-3">
          <p className={`font-sans text-[12px] font-medium uppercase tracking-[0.06em] ${sentimentClass}`}>
            {outcome.sentiment}
            {outcome.confidence ? ` · ${outcome.confidence} confidence` : ""}
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-ink">
            {outcome.outcome_summary ??
              outcome.notice ??
              "No verifiable post-show coverage found yet — press and fan reaction can take a few days to surface; re-check later."}
          </p>
          {/* Citations only accompany a REAL outcome. When the search found
              nothing (unknown sentiment, no summary), its raw result links
              are keyword noise (e.g. colleges named like the campaign) --
              rendering them as "citations" would undercut the whole
              grounded-data story. */}
          {Boolean(outcome.outcome_summary) && outcome.sentiment !== "unknown" && outcome.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.citations.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
                >
                  {c.title || c.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local production ecosystem: a city-level reference fact with no curated
// seed data, purely on-demand (no persistence) -- staging/lighting/sound
// rental, catering, and local labor/union requirements for touring crew.
// Parallel's own Search API response never echoes back the objective/
// search_queries it was given -- the caller already knows what it sent, and
// we already construct these server-side in each _xxx_search() helper, so
// this just surfaces our own real values rather than a frontend guess.
function SearchedForLine({ queries }: { queries: string[] | undefined }) {
  if (!queries || queries.length === 0) return null;
  return (
    <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-muted/80">
      Searched: {queries.join(" · ")}
    </p>
  );
}

function LocalCrewVendorsCard({ cityName, accent }: { cityName: string; accent: string }) {
  const [result, setResult] = useState<LocalCrewVendorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFind() {
    setError(null);
    setLoading(true);
    try {
      setResult(await getLocalCrewVendors(cityName));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-paper p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={Wrench} accent={accent} label="Local Crew & Vendors" />
        <button
          type="button"
          onClick={handleFind}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-sans text-[11.5px] text-ink transition-colors hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {loading ? `Searching in ${cityName}…` : result ? "Refresh" : "Find local crew & vendors"}
        </button>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't search: {error}</p>}

      {!result && !loading && !error && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">
          Real, cited staging/lighting/sound rental and catering options in {cityName}, plus any local
          labor/union requirements for touring crew.
        </p>
      )}

      {result && result.vendors.length === 0 && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">No concrete local vendors found for {cityName}.</p>
      )}

      {result && result.vendors.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.vendors.map((v, i) => (
            <div key={i} className="border-t border-line pt-2 first:border-0 first:pt-0">
              <p className="font-sans text-[13px] text-ink">{v.name}</p>
              <p className="font-sans text-[11px] uppercase tracking-[0.06em] text-ink-muted">{v.category}</p>
              {v.note && <p className="mt-1 font-sans text-[12px] leading-relaxed text-ink-muted">{v.note}</p>}
            </div>
          ))}
        </div>
      )}

      {result?.labor_notes && (
        <p className="mt-3 border-t border-line pt-3 font-sans text-[12.5px] leading-relaxed text-ink-muted">
          {result.labor_notes}
        </p>
      )}

      {result && result.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {result.citations.map((c, i) => (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
            >
              {c.title || c.url}
            </a>
          ))}
        </div>
      )}
      {result && <SearchedForLine queries={result.search_queries_used} />}
    </div>
  );
}

// Visa/border timing risk: 2026 reporting shows O-1/P-1 touring-artist
// visas averaging 6-12 months processing -- genuinely computable against a
// stop_date, unlike most "logistics" facts. Nationality/destination are
// manual inputs since neither exists anywhere in the campaign schema today.
// Shared field styling for the operations-check cards -- same crisp
// treatment as the chat composer (visible border, well surface, gold focus).
const TOOL_INPUT_CLASS =
  "w-full rounded-lg border border-ink/15 bg-paper-raised px-2.5 py-2 font-sans text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/25";

function ToolField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function VisaRequirementsCard({ accent }: { accent: string }) {
  const [nationality, setNationality] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState<VisaRequirements | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    if (!nationality.trim() || !destination.trim()) return;
    setError(null);
    setLoading(true);
    try {
      setResult(await getVisaRequirements(nationality.trim(), destination.trim()));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-paper p-6">
      <SectionLabel icon={Stamp} accent={accent} label="Visa & Border Timing" />
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <ToolField label="Artist nationality">
          <input
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="e.g. Canadian"
            className={TOOL_INPUT_CLASS}
          />
        </ToolField>
        <ToolField label="Destination country">
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. India"
            className={TOOL_INPUT_CLASS}
          />
        </ToolField>
        <button
          type="button"
          onClick={handleCheck}
          disabled={loading || !nationality.trim() || !destination.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 font-sans text-[11.5px] font-medium text-ink outline-none transition-colors hover:border-gold hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Search size={12} aria-hidden />}
          {loading ? "Checking…" : "Check"}
        </button>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't check: {error}</p>}

      {result && (
        <div className="mt-3">
          <p className="font-sans text-[13px] text-ink">
            {result.visa_type ?? "No specific visa category found"}
            {result.typical_lead_time_weeks != null &&
              ` — ~${result.typical_lead_time_weeks} weeks typical lead time`}
          </p>
          {result.notes && (
            <p className="mt-1 font-sans text-[12.5px] leading-relaxed text-ink-muted">{result.notes}</p>
          )}
          {result.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {result.citations.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
                >
                  {c.title || c.url}
                </a>
              ))}
            </div>
          )}
          <SearchedForLine queries={result.search_queries_used} />
        </div>
      )}
    </div>
  );
}

function SeasonalWeatherRiskCard({ cityName, accent }: { cityName: string; accent: string }) {
  const [monthOrDate, setMonthOrDate] = useState("");
  const [result, setResult] = useState<SeasonalWeatherRisk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    if (!monthOrDate.trim()) return;
    setError(null);
    setLoading(true);
    try {
      setResult(await getSeasonalWeatherRisk(cityName, monthOrDate.trim()));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const riskClass =
    result?.risk_level === "high"
      ? "text-red-300"
      : result?.risk_level === "medium"
        ? "text-amber-700"
        : "text-emerald-300";

  return (
    <div className="rounded-2xl bg-paper p-6">
      <SectionLabel icon={CloudRain} accent={accent} label="Seasonal Weather Risk" />
      <div className="mt-3 flex items-end gap-2">
        <ToolField label="Month or date of the stop">
          <input
            value={monthOrDate}
            onChange={(e) => setMonthOrDate(e.target.value)}
            placeholder="e.g. October"
            className={TOOL_INPUT_CLASS}
          />
        </ToolField>
        <button
          type="button"
          onClick={handleCheck}
          disabled={loading || !monthOrDate.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 font-sans text-[11.5px] font-medium text-ink outline-none transition-colors hover:border-gold hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Search size={12} aria-hidden />}
          {loading ? "Checking…" : "Check"}
        </button>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't check: {error}</p>}

      {result && (
        <div className="mt-3">
          {result.risk_level && (
            <p className={`font-sans text-[12px] font-medium uppercase tracking-[0.06em] ${riskClass}`}>
              {result.risk_level} risk{result.confidence ? ` · ${result.confidence} confidence` : ""}
            </p>
          )}
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink">
            {result.notes ?? "No specific seasonal risk found for this window."}
          </p>
          {result.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {result.citations.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
                >
                  {c.title || c.url}
                </a>
              ))}
            </div>
          )}
          <SearchedForLine queries={result.search_queries_used} />
        </div>
      )}
    </div>
  );
}

// The real industry fix for crowd-crush disasters (the Showstop Procedure)
// is a named person with explicit authority, not a data problem -- this
// card is deliberately NOT AI-generated, a planner-filled checklist,
// matching the project's own "never fabricate a fact" discipline.
function StopSafetyChecklistCard({
  campaignId,
  cityId,
  accent,
}: {
  campaignId: string;
  cityId: string;
  accent: string;
}) {
  const { data: saved } = useQuery({
    queryKey: ["stopSafetyChecklist", campaignId, cityId],
    queryFn: () => getStopSafetyChecklist(campaignId, cityId),
  });

  const [assigned, setAssigned] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [capacityConfirmed, setCapacityConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    setAssigned(Boolean(saved.showstop_manager_assigned));
    setManagerName(saved.showstop_manager_name ?? "");
    setCapacityConfirmed(Boolean(saved.capacity_confirmed));
    setSavedAt(saved.generated_at);
  }, [saved]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await saveStopSafetyChecklist(campaignId, cityId, {
        showstop_manager_assigned: assigned,
        showstop_manager_name: managerName.trim() || null,
        capacity_confirmed: capacityConfirmed,
      });
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-paper p-6">
      <SectionLabel icon={ClipboardCheck} accent={accent} label="Safety Checklist" />
      <p className="mt-2 font-sans text-[12px] text-ink-muted">
        The Showstop Procedure is a named person with explicit authority to stop the show — filled in by the
        planner, never AI-generated.
      </p>
      <div className="mt-3 max-w-md space-y-3">
        <label className="flex items-center gap-2.5 font-sans text-[13px] text-ink">
          <input
            type="checkbox"
            checked={assigned}
            onChange={(e) => setAssigned(e.target.checked)}
            className="size-4 accent-gold"
          />
          Showstop manager assigned
        </label>
        <ToolField label="Showstop manager name">
          <input
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="e.g. Jordan Blake"
            className={TOOL_INPUT_CLASS}
          />
        </ToolField>
        <label className="flex items-center gap-2.5 font-sans text-[13px] text-ink">
          <input
            type="checkbox"
            checked={capacityConfirmed}
            onChange={(e) => setCapacityConfirmed(e.target.checked)}
            className="size-4 accent-gold"
          />
          Venue capacity confirmed with venue
        </label>
      </div>

      {error && <p className="mt-3 font-sans text-[12px] text-red-300">Couldn't save: {error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-gold flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-sans text-[12px] font-semibold text-on-gold outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
          {saving ? "Saving…" : "Save checklist"}
        </button>
        {savedAt && !saving && (
          <p className="font-sans text-[11px] text-ink-muted">
            Saved{" "}
            {new Date(savedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

const TRACE_ICON_BY_KIND: Record<TraceStep["kind"], React.ReactNode> = {
  tool: <Wrench className="w-3.5 h-3.5" />,
  playbook: <GitBranch className="w-3.5 h-3.5" />,
  utterance: <MessageCircle className="w-3.5 h-3.5" />,
};

function toTraceSteps(steps: TraceStep[]): TraceStepItem[] {
  return steps.map((step, i) => ({
    id: `${i}-${step.label}`,
    title: step.label,
    status: "success",
    icon: TRACE_ICON_BY_KIND[step.kind],
    content: step.detail ? <p>{step.detail}</p> : undefined,
  }));
}

const TABS = ["intelligence", "delight", "brief"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  intelligence: "Culture Intelligence",
  delight: "Delight Card",
  brief: "Talent Brief",
};

function normalizeLine(line: string | { phrase: string; meaning?: string }) {
  return typeof line === "string" ? { phrase: line, meaning: undefined } : line;
}

function normalizeFanQuestion(q: string | { question: string; suggested_response?: string }) {
  return typeof q === "string" ? { question: q, suggested_response: undefined } : q;
}

export function CityDetail() {
  const { cityId = "" } = useParams();
  const { activeCampaignId } = useCampaignContext();
  const { data } = useQuery({
    queryKey: ["cityDetail", activeCampaignId, cityId],
    queryFn: () => getCityDetail(activeCampaignId, cityId),
  });
  const [tab, setTab] = useState<Tab>("delight");
  const reduceMotion = useReducedMotion();

  if (!data) return <CityDetailSkeleton />;

  const accent = cityAccent(cityId);
  const accentPaper = cityAccentOnPaper(cityId);
  const brief: TalentBrief | null = data.brief?.talent_brief_json ? JSON.parse(data.brief.talent_brief_json) : null;

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 rounded font-sans text-[13px] text-canvas-muted outline-none transition-colors hover:text-canvas-text focus-visible:ring-2 focus-visible:ring-gold"
      >
        <ArrowLeft size={14} aria-hidden /> Back to campaign
      </Link>

      <header className="mb-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: accent }}>
          Stop {data.stop.sequence_order} · {data.stop.stop_date}
          {data.stop.event_format ? ` · ${data.stop.event_format}` : ""}
        </p>
        <h1 className="title-sheen mt-1.5 text-balance font-title text-[46px] leading-none">
          {data.stop.city_name}
        </h1>
        {data.fanSignal && (
          <p className="mt-2 font-sans text-[13px] text-canvas-muted">{data.fanSignal.fan_behavior_style}</p>
        )}
      </header>

      {/* City-level summary strip -- mirrors the dashboard's KPI tiles so a
          planner drilling in keeps the same at-a-glance vocabulary. Only the
          real fan-signal/brief fields; nothing is invented when a field is
          genuinely absent. */}
      {data.fanSignal && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Fan Enthusiasm"
            value={`${data.fanSignal.enthusiasm_score}`}
            hint="strategic score / 100"
            accent={accentPaper}
            icon={<Gauge size={13} />}
          />
          <StatTile
            label="Importance Tier"
            value={data.fanSignal.city_importance_tier}
            hint="market priority for this tour"
            icon={<Crown size={13} />}
          />
          <StatTile
            label="Grounding"
            value={
              data.brief?.grounding_check_passed == null
                ? "—"
                : data.brief.grounding_check_passed
                  ? "Verified"
                  : "Review"
            }
            hint="fact-checked vs. live sources"
            icon={<ShieldCheck size={13} />}
          />
          <StatTile
            label="Artist Fit"
            value={data.fanSignal.artist_type.replace(/_/g, " ")}
            hint={`${data.campaign.genre} audience match`}
            icon={<Clapperboard size={13} />}
          />
        </div>
      )}

      {data.brief && (
        <div className="mb-6">
          <ThinkingTrace title="How this brief was generated" steps={toTraceSteps(deriveTrace(data))} defaultExpanded={false} />
        </div>
      )}

      <div className="mb-6">
        <Tabs items={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))} value={tab} onChange={setTab} accent={accent} />
      </div>

      {tab === "intelligence" && <IntelligenceTab data={data} accent={accentPaper} />}
      {tab === "delight" && <DelightTab data={data} accent={accentPaper} />}
      {tab === "brief" && <BriefTab brief={brief} accent={accentPaper} cardUrl={data.brief?.delight_card_url ?? null} />}
    </motion.div>
  );
}

// The curated metric keys the demographic snapshot can natively render --
// anything else selected for this stop/campaign is a campaigner-defined
// custom metric, resolved on demand via live search below.
const KNOWN_METRIC_KEYS = new Set([
  "literacy_rate", "median_household_income_usd", "population", "median_age",
  "internet_penetration_rate", "dominant_social_platforms", "top_interest_categories",
  "notable_public_holidays",
]);

function IntelligenceTab({ data, accent }: { data: CityDetailData; accent: string }) {
  const { cultureNotes, demographicSnapshot, campaign, stop, brief } = data;
  // Per-stop override beats the campaign-level selection when present.
  const effectiveMetrics = stop.stop_metrics?.length ? stop.stop_metrics : campaign.selected_metrics;
  const customMetrics = (effectiveMetrics ?? []).filter((m) => !KNOWN_METRIC_KEYS.has(m));
  let venueNotes: VenueNotes | null = null;
  if (brief?.venue_notes_json) {
    try {
      venueNotes = JSON.parse(brief.venue_notes_json);
    } catch {
      venueNotes = null;
    }
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={Smile} accent={accent} label="Greeting &amp; Etiquette" />
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink">{cultureNotes.greeting_style}</p>
        <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-muted">{cultureNotes.etiquette_notes}</p>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={Users} accent={accent} label="Media &amp; Fan Behavior" />
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink">{cultureNotes.media_behavior_notes}</p>
        <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-muted">{cultureNotes.fan_interaction_style}</p>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={Check} accent={accent} label="Lean Into" />
        <ul className="mt-2 space-y-2">
          {cultureNotes.dos.map((d, i) => (
            <li key={i} className="flex gap-2 font-sans text-[13px] text-ink">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" /> {d}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={X} accent={accent} label="Avoid" />
        <ul className="mt-2 space-y-2">
          {cultureNotes.donts.map((d, i) => (
            <li key={i} className="flex gap-2 font-sans text-[13px] text-ink">
              <X size={14} className="mt-0.5 shrink-0 text-red-300" /> {d}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 font-sans text-[12px] italic text-ink-muted">
          {cultureNotes.humor_boundaries}
        </p>
      </div>
      {(demographicSnapshot || customMetrics.length > 0) && (
        <CardErrorBoundary>
          <KeyMetricsCard
            snapshot={demographicSnapshot}
            accent={accent}
            cityName={stop.city_name}
            customMetrics={customMetrics}
          />
        </CardErrorBoundary>
      )}
      {venueNotes && (
        <CardErrorBoundary>
          <VenueNotesCard notes={venueNotes} accent={accent} />
        </CardErrorBoundary>
      )}
      <CardErrorBoundary>
        <LocalCrewVendorsCard cityName={stop.city_name} accent={accent} />
      </CardErrorBoundary>

      {/* The on-demand tools below were a stack of five near-identical
          full-width slabs -- grouping them under one labeled rule and
          reflowing to half-width halves the scroll and makes the zone read
          as a toolbox, not filler. */}
      <div className="mt-3 flex items-center gap-3 lg:col-span-2" aria-hidden>
        <span className="h-px flex-1 bg-canvas-line" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-canvas-muted">
          Live Operations Checks · real web lookups, on demand
        </span>
        <span className="h-px flex-1 bg-canvas-line" />
      </div>

      <CardErrorBoundary>
        <CulturalDriftCheck campaignId={campaign.campaign_id} cityId={stop.city_id} cityName={stop.city_name} accent={accent} />
      </CardErrorBoundary>
      <CardErrorBoundary>
        <CulturalDriftCheck
          campaignId={campaign.campaign_id}
          cityId={stop.city_id}
          cityName={stop.city_name}
          accent={accent}
          monitorType="safety"
          label="Safety & Logistics Check"
          icon={ShieldAlert}
          idleMessage={`Run a live check for new safety advisories, transit disruptions, or venue-area incidents reported in ${stop.city_name} since this brief was generated.`}
          noDriftMessage={`Checked just now — no notable safety or logistics concerns found for ${stop.city_name}.`}
        />
      </CardErrorBoundary>
      <CardErrorBoundary>
        <VisaRequirementsCard accent={accent} />
      </CardErrorBoundary>
      <CardErrorBoundary>
        <SeasonalWeatherRiskCard cityName={stop.city_name} accent={accent} />
      </CardErrorBoundary>
      <div className="lg:col-span-2">
        <CardErrorBoundary>
          <StopOutcomeCheck
            campaignId={campaign.campaign_id}
            cityId={stop.city_id}
            cityName={stop.city_name}
            campaignTitle={campaign.title}
            stopDate={stop.stop_date}
            accent={accent}
          />
        </CardErrorBoundary>
      </div>
      <div className="lg:col-span-2">
        <CardErrorBoundary>
          <StopSafetyChecklistCard campaignId={campaign.campaign_id} cityId={stop.city_id} accent={accent} />
        </CardErrorBoundary>
      </div>
    </div>
  );
}

function CustomMetricRow({ metric, cityName, accent }: { metric: string; cityName: string; accent: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveMetricResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setError(null);
    setLoading(true);
    try {
      setResult(await getLiveMetric(cityName, metric));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-paper-raised px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-sans text-[12.5px] font-medium text-ink">{metric}</p>
        {!result && (
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1 font-sans text-[11px] font-medium text-ink outline-none transition-colors hover:border-gold hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Search size={11} aria-hidden />}
            {loading ? "Searching…" : "Fetch live"}
          </button>
        )}
        {result && (
          <span className="font-sans text-[13px] font-semibold tabular-nums" style={{ color: accent }}>
            {result.value ?? "not established by sources"}
          </span>
        )}
      </div>
      {error && <p className="mt-1 font-sans text-[11px] text-red-300">Couldn't fetch: {error}</p>}
      {result && (
        <div className="mt-1">
          {result.note && <p className="font-sans text-[11.5px] leading-relaxed text-ink-muted">{result.note}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-sans text-[10.5px] text-ink-muted">
            <span className="font-mono uppercase tracking-[0.08em]">live · {result.confidence} confidence</span>
            {result.citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                {c.title || c.url}
              </a>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

function KeyMetricsCard({
  snapshot,
  accent,
  cityName,
  customMetrics,
}: {
  snapshot: CityDetailData["demographicSnapshot"];
  accent: string;
  cityName: string;
  customMetrics: string[];
}) {
  const numberStats: { label: string; value: number }[] = snapshot == null ? [] : [
    snapshot.population != null && { label: "Population", value: snapshot.population },
    snapshot.median_household_income_usd != null && {
      label: "Median income",
      value: snapshot.median_household_income_usd,
    },
    snapshot.median_age != null && { label: "Median age", value: snapshot.median_age },
  ].filter(Boolean) as { label: string; value: number }[];

  const listStats: { label: string; items: string[] }[] = snapshot == null ? [] : [
    snapshot.top_interest_categories?.length && { label: "Top interests", items: snapshot.top_interest_categories },
    snapshot.dominant_social_platforms?.length && {
      label: "Social platforms",
      items: snapshot.dominant_social_platforms,
    },
    snapshot.notable_public_holidays?.length && { label: "Public holidays", items: snapshot.notable_public_holidays },
  ].filter(Boolean) as { label: string; items: string[] }[];

  return (
    <div className="rounded-2xl bg-paper p-6 lg:col-span-2">
      <div className="flex items-center justify-between">
        <SectionLabel icon={BarChart3} accent={accent} label="Key Metrics" />
        {snapshot?.source === "parallel_live" && (
          <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            live search · confidence: {snapshot.confidence ?? "n/a"}
          </span>
        )}
      </div>

      {snapshot != null && (snapshot.literacy_rate != null || snapshot.internet_penetration_rate != null) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {snapshot.literacy_rate != null && (
            <div>
              <p className="mb-1 font-sans text-[11px] text-ink-muted">Literacy rate</p>
              <StatMeter value={Math.round(snapshot.literacy_rate)} accent={accent} />
            </div>
          )}
          {snapshot.internet_penetration_rate != null && (
            <div>
              <p className="mb-1 font-sans text-[11px] text-ink-muted">Internet penetration</p>
              <StatMeter value={Math.round(snapshot.internet_penetration_rate)} accent={accent} />
            </div>
          )}
        </div>
      )}

      {numberStats.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {numberStats.map((s) => (
            <div key={s.label}>
              <p className="font-sans text-[11px] text-ink-muted">{s.label}</p>
              <p className="font-sans text-[15px] font-semibold tabular-nums text-ink">{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {listStats.map((s) => (
        <div key={s.label} className="mt-4">
          <p className="mb-1.5 font-sans text-[11px] text-ink-muted">{s.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {s.items.map((item) => (
              <span
                key={item}
                className="rounded-full border border-line bg-paper-raised px-2.5 py-1 font-sans text-[11px] text-ink"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}

      {customMetrics.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Custom metrics for this stop · resolved by live search
          </p>
          <div className="space-y-2">
            {customMetrics.map((m) => (
              <CustomMetricRow key={m} metric={m} cityName={cityName} accent={accent} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VenueNotesCard({ notes, accent }: { notes: VenueNotes; accent: string }) {
  return (
    <div className="rounded-2xl bg-paper p-6 lg:col-span-2">
      <div className="flex items-center justify-between">
        <SectionLabel icon={Building2} accent={accent} label="Venue Notes" />
        <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          extracted from venue URL · confidence: {notes.confidence}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {notes.capacity && (
          <div>
            <p className="font-sans text-[11px] text-ink-muted">Capacity</p>
            <p className="font-sans text-[15px] font-semibold text-ink">{notes.capacity}</p>
          </div>
        )}
        {notes.typical_event_format && (
          <div>
            <p className="font-sans text-[11px] text-ink-muted">Typical format</p>
            <p className="font-sans text-[15px] font-semibold text-ink">{notes.typical_event_format}</p>
          </div>
        )}
      </div>
      {notes.logistics_notes && (
        <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-muted">{notes.logistics_notes}</p>
      )}
      {notes.technical_rider_notes && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Technical Rider
          </p>
          <p className="font-sans text-[13px] leading-relaxed text-ink-muted">{notes.technical_rider_notes}</p>
        </div>
      )}
      {notes.customs_notes && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Customs & Import
          </p>
          <p className="font-sans text-[13px] leading-relaxed text-ink-muted">{notes.customs_notes}</p>
        </div>
      )}
      {(notes.nearest_airport || notes.nearest_railway_station) && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
          {notes.nearest_airport && (
            <div className="flex items-start gap-2">
              <Plane size={14} className="mt-0.5 shrink-0 text-ink-muted" />
              <div>
                <p className="font-sans text-[12.5px] text-ink">{notes.nearest_airport.name}</p>
                <p className="font-sans text-[11px] text-ink-muted">
                  {notes.nearest_airport.distance_or_travel_time}
                </p>
              </div>
            </div>
          )}
          {notes.nearest_railway_station && (
            <div className="flex items-start gap-2">
              <TrainFront size={14} className="mt-0.5 shrink-0 text-ink-muted" />
              <div>
                <p className="font-sans text-[12.5px] text-ink">{notes.nearest_railway_station.name}</p>
                <p className="font-sans text-[11px] text-ink-muted">
                  {notes.nearest_railway_station.distance_or_travel_time}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {notes.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {notes.citations.map((c, i) => (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[11px] text-ink-muted underline hover:text-ink"
            >
              {c.title || c.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DelightTab({ data, accent }: { data: CityDetailData; accent: string }) {
  const { localDelight, pronunciationAudio, brief } = data;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <CueCard className="lg:col-span-3" accent={accent} meta={`${data.campaign.title} · Delight Card`}>
        <SectionLabel icon={Sparkles} accent={accent} label="Local Language Moment" />
        <div className="mt-3 space-y-2.5">
          {localDelight.local_phrases.map((p, i) => {
            const audioUrl = pronunciationAudio?.find((a) => a.phrase === p.phrase)?.audio_url;
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg bg-paper-raised px-3.5 py-2.5"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {audioUrl && <AudioPlayButton src={audioUrl} accent={accent} />}
                  <div className="min-w-0">
                    {/* Sentence case, not the mono-uppercase label voice --
                        these are human words the talent will actually say. */}
                    <span className="block font-sans text-[15px] font-semibold text-ink">{p.phrase}</span>
                    {p.phonetic && (
                      <span className="block font-mono text-[10.5px] text-ink-muted">{p.phonetic}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-right font-sans text-[12px] italic text-ink-muted">{p.meaning}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <SectionLabel icon={Landmark} accent={accent} label="Beloved Icons &amp; References" />
          <Accordion
            className="mt-1"
            accent={accent}
            type="multiple"
            items={localDelight.beloved_icons.map((icon, i) => ({
              id: `${icon.name}-${i}`,
              title: icon.name,
              content: icon.reference_note,
            }))}
          />
        </div>
      </CueCard>

      <div className="lg:col-span-2 space-y-5">
        {brief?.style_moodboard_url && (
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-paper">
            <img
              src={brief.style_moodboard_url}
              alt={`Abstract key art for ${data.stop.city_name}, generated from grounded local motifs`}
              className="aspect-square w-full object-cover"
            />
            {/* The agent's honest "thinking" for this image: the real
                grounded signals it selected, the event context, and the
                exact prompt it sent -- never a fabricated rationale
                (dashboard/CLAUDE.md's deriveTrace discipline). */}
            {data.moodboardTrace && (
              <div className="p-4">
                <Accordion
                  accent={accent}
                  type="single"
                  items={[
                    {
                      id: "moodboard-trace",
                      title: "How this key art was generated",
                      meta: data.moodboardTrace.cached ? "cached" : "freshly generated",
                      content: (
                        <div className="space-y-2.5">
                          <div>
                            <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                              1 · Grounded signals selected
                            </p>
                            <p className="mt-0.5 text-[12px] leading-relaxed">{data.moodboardTrace.style_notes}</p>
                          </div>
                          {data.moodboardTrace.campaign_context && (
                            <div>
                              <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                                2 · Event context applied
                              </p>
                              <p className="mt-0.5 text-[12px] leading-relaxed">{data.moodboardTrace.campaign_context}</p>
                            </div>
                          )}
                          <div>
                            <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                              3 · Exact prompt sent to {data.moodboardTrace.model}
                            </p>
                            <p className="mt-0.5 rounded-lg bg-paper-raised p-2.5 font-mono text-[10.5px] leading-relaxed">
                              {data.moodboardTrace.prompt}
                            </p>
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
        <div className="rounded-2xl bg-paper p-6">
          <SectionLabel icon={Users} accent={accent} label="Crowd Moments" />
          <ul className="mt-2 space-y-2">
            {localDelight.crowd_moment_suggestions.map((c, i) => (
              <li key={i} className="font-sans text-[13px] leading-relaxed text-ink">{c}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-paper p-6">
          <SectionLabel icon={Music4} accent={accent} label="Entrance Cue" />
          <ul className="mt-2 space-y-2">
            {localDelight.music_or_remix_ideas.map((m, i) => (
              <li key={i} className="font-sans text-[13px] leading-relaxed text-ink">{m}</li>
            ))}
          </ul>
        </div>
        {brief?.delight_card_url && (
          <a
            href={brief.delight_card_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-canvas-line bg-canvas-raised px-4 py-3 font-sans text-[12px] text-canvas-text hover:border-gold/50"
          >
            <ExternalLink size={13} /> View rendered delight card artifact
          </a>
        )}
      </div>
    </div>
  );
}

function BriefTab({ brief, accent, cardUrl }: { brief: TalentBrief | null; accent: string; cardUrl: string | null }) {
  if (!brief) {
    return <p className="font-sans text-[13px] text-canvas-muted">No finalized talent brief for this city yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={ThumbsUp} accent={accent} label="Lean Into" />
        <ul className="mt-2 space-y-2">
          {brief.topics_to_lean_into.map((t, i) => (
            <li key={i} className="flex gap-2 font-sans text-[13px] text-ink">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={ShieldAlert} accent={accent} label="Avoid" />
        <ul className="mt-2 space-y-2">
          {brief.topics_to_avoid.map((t, i) => (
            <li key={i} className="flex gap-2 font-sans text-[13px] text-ink">
              <X size={14} className="mt-0.5 shrink-0 text-red-300" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={Mic2} accent={accent} label="Pronounceable Local Lines" />
        <ul className="mt-2 space-y-2.5">
          {brief.pronounceable_local_lines.map((line, i) => {
            const n = normalizeLine(line);
            return (
              <li key={i} className="flex items-baseline gap-2 font-sans text-[13.5px] text-ink">
                <span className="size-1.5 shrink-0 self-center rounded-full" style={{ backgroundColor: accent }} aria-hidden />
                <span className="font-medium">{n.phrase}</span>
                {n.meaning && <span className="italic text-[12px] text-ink-muted">— {n.meaning}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6 lg:col-span-2">
        <SectionLabel icon={MessageCircleQuestion} accent={accent} label="Likely Fan Questions & Talking Points" />
        <ul className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {brief.high_probability_fan_questions.map((q, i) => {
            const n = normalizeFanQuestion(q);
            return (
              <li key={i} className="rounded-lg bg-paper-raised p-3.5">
                <p className="font-sans text-[13px] font-medium text-ink">"{n.question}"</p>
                {n.suggested_response && (
                  <p
                    className="mt-1.5 border-l-2 pl-2.5 font-sans text-[12.5px] leading-relaxed text-ink-muted"
                    style={{ borderColor: accent }}
                  >
                    {n.suggested_response}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {cardUrl && (
        <div className="lg:col-span-2">
          <a
            href={cardUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-canvas-line bg-canvas-raised px-4 py-3 font-sans text-[12px] text-canvas-text hover:border-gold/50"
          >
            <ExternalLink size={13} /> Open printable delight card
          </a>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, accent, label }: { icon: typeof Sparkles; accent: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} style={{ color: accent }} />
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</p>
    </div>
  );
}
