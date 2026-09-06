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
  type LucideIcon,
} from "lucide-react";
import { StatMeter } from "../components/ui/StatMeter";
import { getCityDetail } from "../lib/api";
import type { CityDetail as CityDetailData, TalentBrief, TraceStep } from "../lib/types";
import { cityAccent, cityAccentOnPaper } from "../lib/cityTheme";
import { ThinkingTrace, type TraceStepItem } from "../components/ui/ThinkingTrace";
import { Tabs } from "../components/ui/Tabs";
import { deriveTrace } from "../lib/deriveTrace";
import { useCampaignContext } from "../lib/campaignContext";
import { CityDetailSkeleton } from "../components/ui/Skeletons";
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
} from "../lib/api";
import type { MonitorEvent, StopOutcome, VenueNotes, LocalCrewVendorsResponse } from "../lib/types";

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
}: {
  campaignId: string;
  cityId: string;
  cityName: string;
  accent: string;
  monitorType?: "cultural" | "safety";
  label?: string;
  icon?: LucideIcon;
  noDriftMessage?: string;
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

      {error && <p className="mt-3 font-sans text-[12px] text-red-800">Couldn't check for updates: {error}</p>}

      {!checking && events === null && !error && (
        <p className="mt-3 font-sans text-[12.5px] text-ink-muted">
          This brief reflects real, cited data as of when it was generated. Run a live check against Parallel's
          continuous monitoring to see whether anything relevant has changed since.
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
      ? "text-emerald-700"
      : outcome?.sentiment === "negative"
        ? "text-red-700"
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

      {error && <p className="mt-3 font-sans text-[12px] text-red-800">Couldn't check outcome: {error}</p>}

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
            {outcome.outcome_summary ?? outcome.notice ?? "No outcome summary available."}
          </p>
          {outcome.citations.length > 0 && (
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

      {error && <p className="mt-3 font-sans text-[12px] text-red-800">Couldn't search: {error}</p>}

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
      <Link to="/" className="mb-6 flex items-center gap-1.5 font-sans text-[13px] text-canvas-muted hover:text-canvas-text">
        <ArrowLeft size={14} /> Back to campaign
      </Link>

      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.16em]" style={{ color: accent }}>
            Stop {data.stop.sequence_order} · {data.stop.stop_date}
          </p>
          <h1 className="mt-1 font-display text-[38px] text-canvas-text">{data.stop.city_name}</h1>
          {data.fanSignal && (
            <p className="mt-1 font-sans text-[13px] text-canvas-muted">
              {data.fanSignal.city_importance_tier} · {data.fanSignal.enthusiasm_score}/100 enthusiasm ·{" "}
              {data.fanSignal.fan_behavior_style}
            </p>
          )}
        </div>
      </header>

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

function IntelligenceTab({ data, accent }: { data: CityDetailData; accent: string }) {
  const { cultureNotes, demographicSnapshot, campaign, stop, brief } = data;
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
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-700" /> {d}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={X} accent={accent} label="Avoid" />
        <ul className="mt-2 space-y-2">
          {cultureNotes.donts.map((d, i) => (
            <li key={i} className="flex gap-2 font-sans text-[13px] text-ink">
              <X size={14} className="mt-0.5 shrink-0 text-red-700" /> {d}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 font-sans text-[12px] italic text-ink-muted">
          {cultureNotes.humor_boundaries}
        </p>
      </div>
      {demographicSnapshot && <KeyMetricsCard snapshot={demographicSnapshot} accent={accent} />}
      {venueNotes && <VenueNotesCard notes={venueNotes} accent={accent} />}
      <LocalCrewVendorsCard cityName={stop.city_name} accent={accent} />
      <div className="lg:col-span-2">
        <CulturalDriftCheck campaignId={campaign.campaign_id} cityId={stop.city_id} cityName={stop.city_name} accent={accent} />
      </div>
      <div className="lg:col-span-2">
        <CulturalDriftCheck
          campaignId={campaign.campaign_id}
          cityId={stop.city_id}
          cityName={stop.city_name}
          accent={accent}
          monitorType="safety"
          label="Safety & Logistics Check"
          icon={ShieldAlert}
          noDriftMessage={`Checked just now — no notable safety or logistics concerns found for ${stop.city_name}.`}
        />
      </div>
      <div className="lg:col-span-2">
        <StopOutcomeCheck
          campaignId={campaign.campaign_id}
          cityId={stop.city_id}
          cityName={stop.city_name}
          campaignTitle={campaign.title}
          stopDate={stop.stop_date}
          accent={accent}
        />
      </div>
    </div>
  );
}

function KeyMetricsCard({ snapshot, accent }: { snapshot: NonNullable<CityDetailData["demographicSnapshot"]>; accent: string }) {
  const numberStats: { label: string; value: number }[] = [
    snapshot.population != null && { label: "Population", value: snapshot.population },
    snapshot.median_household_income_usd != null && {
      label: "Median income",
      value: snapshot.median_household_income_usd,
    },
    snapshot.median_age != null && { label: "Median age", value: snapshot.median_age },
  ].filter(Boolean) as { label: string; value: number }[];

  const listStats: { label: string; items: string[] }[] = [
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
        {snapshot.source === "parallel_live" && (
          <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            live search · confidence: {snapshot.confidence ?? "n/a"}
          </span>
        )}
      </div>

      {(snapshot.literacy_rate != null || snapshot.internet_penetration_rate != null) && (
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
        <div className="mt-3 space-y-3">
          {localDelight.local_phrases.map((p, i) => {
            const audioUrl = pronunciationAudio?.find((a) => a.phrase === p.phrase)?.audio_url;
            return (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  {audioUrl && <AudioPlayButton src={audioUrl} accent={accent} />}
                  <span className="font-display text-[16px] text-ink">{p.phrase}</span>
                </div>
                <span className="text-right font-sans text-[12px] italic text-ink-muted">{p.meaning}</span>
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
          <div className="overflow-hidden rounded-2xl bg-paper">
            <img
              src={brief.style_moodboard_url}
              alt={`Abstract style moodboard for ${data.stop.city_name}, grounded in local cultural motifs`}
              className="aspect-square w-full object-cover"
            />
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
            <li key={i} className="font-sans text-[13px] text-ink">{t}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={ShieldAlert} accent={accent} label="Avoid" />
        <ul className="mt-2 space-y-2">
          {brief.topics_to_avoid.map((t, i) => (
            <li key={i} className="font-sans text-[13px] text-ink">{t}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={Mic2} accent={accent} label="Pronounceable Local Lines" />
        <ul className="mt-2 space-y-2">
          {brief.pronounceable_local_lines.map((line, i) => {
            const n = normalizeLine(line);
            return (
              <li key={i} className="font-sans text-[13px] text-ink">
                {n.phrase} {n.meaning && <span className="italic text-ink-muted">— {n.meaning}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rounded-2xl bg-paper p-6 lg:col-span-2">
        <SectionLabel icon={MessageCircleQuestion} accent={accent} label="Likely Fan Questions & Talking Points" />
        <ul className="mt-2 space-y-3">
          {brief.high_probability_fan_questions.map((q, i) => {
            const n = normalizeFanQuestion(q);
            return (
              <li key={i} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="font-sans text-[13px] font-medium text-ink">{n.question}</p>
                {n.suggested_response && (
                  <p className="mt-1 font-sans text-[12.5px] leading-relaxed text-ink-muted">
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
