import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  CheckCircle2, Clock, MapPin, Sparkles, Loader2, AlertTriangle, Info, Lightbulb,
  ShieldCheck, TrendingUp, Trophy, Gauge,
} from "lucide-react";
import { getCampaignOverview, generateBriefs, GenerationAlreadyInFlightError } from "../lib/api";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { StatMeter } from "../components/ui/StatMeter";
import { StatTile } from "../components/ui/StatTile";
import { CueCard } from "../components/ui/CueCard";
import { CampaignEditChat, CampaignEditChatToggle } from "../components/ui/CampaignEditChat";
import { useCampaignContext } from "../lib/campaignContext";
import { DashboardSkeleton } from "../components/ui/Skeletons";
import type { CampaignInsight, CityOverview } from "../lib/types";

// A tier string can arrive as "Tier 1", "tier_1", "1", etc. -- normalize to a
// short "T1" chip so the card badge stays compact regardless of source shape.
function tierBadge(tier: string | null): string | null {
  if (!tier) return null;
  const n = tier.match(/\d+/)?.[0];
  return n ? `T${n}` : tier.toUpperCase();
}

// The campaign's summary KPIs -- the at-a-glance strip the dashboard lacked.
// Averages only over cities that actually have a score, so a mid-generation
// campaign reads honestly instead of dragging the mean toward zero.
function campaignKpis(cities: CityOverview[]) {
  const scored = cities.filter((c) => c.enthusiasm_score != null);
  const avg = scored.length
    ? Math.round(scored.reduce((s, c) => s + (c.enthusiasm_score ?? 0), 0) / scored.length)
    : null;
  const top = scored.reduce<CityOverview | null>(
    (best, c) => (!best || (c.enthusiasm_score ?? 0) > (best.enthusiasm_score ?? 0) ? c : best),
    null,
  );
  const finalCount = cities.filter((c) => c.status === "final").length;
  const verified = cities.filter((c) => c.grounding_check_passed).length;
  return { avg, top, finalCount, verified, total: cities.length };
}

const SEVERITY_STYLE: Record<CampaignInsight["severity"], { icon: typeof AlertTriangle; className: string }> = {
  risk: { icon: AlertTriangle, className: "text-rose-700 bg-rose-950/10" },
  advisory: { icon: Lightbulb, className: "text-amber-700 bg-amber-950/10" },
  info: { icon: Info, className: "text-ink-muted bg-black/5" },
};

// The "insight that wasn't possible before": a synthesis pass over every
// stop's real, already-finalized brief, looking for patterns a planner
// going city-by-city would miss -- a theme with different valence at two
// stops, a real tension between two cities' guidance. Only rendered once
// there's at least one real finding; no forced "nothing to report" state.
function CampaignInsightsPanel({ insights }: { insights: CampaignInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="mt-8">
      <p className="mb-3 font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
        Cross-City Insights
      </p>
      <div className="space-y-3">
        {insights.map((insight, i) => {
          const { icon: Icon, className } = SEVERITY_STYLE[insight.severity];
          return (
            <div key={i} className="rounded-2xl bg-paper p-5">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${className}`}>
                  <Icon size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[16px] text-ink">{insight.title}</p>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-muted">{insight.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {insight.affected_cities.map((c) => (
                      <span key={c} className="rounded-full bg-black/5 px-2 py-0.5 font-sans text-[10.5px] text-ink-muted">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Polling interval while generation is in flight -- the agent pipeline takes
// real wall-clock minutes per city (multiple LLM turns against Dialogflow
// CX), so this just needs to be frequent enough to feel live, not tight.
const GENERATION_POLL_MS = 8000;

export function Dashboard() {
  const { activeCampaignId } = useCampaignContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();

  const { data, error } = useQuery({
    queryKey: ["campaignOverview", activeCampaignId],
    queryFn: () => getCampaignOverview(activeCampaignId),
    refetchInterval: isGenerating ? GENERATION_POLL_MS : false,
  });

  const hasPending = data ? data.cities.some((c) => c.status !== "final") : false;

  // Stop polling once every stop has a finalized brief -- data-driven, so
  // this also recovers correctly if the page was left open through the
  // whole run rather than relying only on the button-click-local state.
  useEffect(() => {
    if (isGenerating && !hasPending) setIsGenerating(false);
  }, [isGenerating, hasPending]);

  if (error) return <ErrorState message={String(error)} />;
  if (!data) return <DashboardSkeleton />;

  const kpis = campaignKpis(data.cities);
  const finalCount = kpis.finalCount;

  async function handleGenerate() {
    setTriggerError(null);
    setIsGenerating(true);
    try {
      await generateBriefs(activeCampaignId);
    } catch (err) {
      if (err instanceof GenerationAlreadyInFlightError) {
        // Not actually a failure -- a run is already going for this
        // campaign (e.g. a double-click, or a previous tab's click still in
        // flight). Keep polling instead of surfacing an error; the button
        // already correctly reads "Generating briefs…" either way.
        return;
      }
      setTriggerError(String(err));
      setIsGenerating(false);
    }
  }

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-gold" aria-hidden />
            <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
              {data.campaign.campaign_type.replace(/_/g, " ")} · {data.campaign.genre}
            </p>
          </div>
          <h1 className="mt-1.5 font-display text-[38px] leading-none text-canvas-text">{data.campaign.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CampaignEditChatToggle open={editOpen} onToggle={() => setEditOpen((v) => !v)} />
          {hasPending && (
            <button
              data-tour="generate-briefs"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gold px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {isGenerating ? "Generating briefs…" : "Generate Briefs"}
            </button>
          )}
        </div>
      </header>

      {/* Campaign summary strip -- the at-a-glance "call sheet header" the
          dashboard was missing. Every number here is real, derived from the
          same city data the grid below renders. */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="City Stops"
          value={kpis.total}
          hint={`${finalCount} of ${kpis.total} briefs finalized`}
          icon={<MapPin size={13} />}
        />
        <StatTile
          label="Avg Enthusiasm"
          value={kpis.avg != null ? kpis.avg : "—"}
          hint={kpis.avg != null ? "across scored stops / 100" : "awaiting brief generation"}
          icon={<Gauge size={13} />}
        />
        <StatTile
          label="Top Market"
          value={kpis.top ? kpis.top.city_name : "—"}
          hint={kpis.top ? `${kpis.top.enthusiasm_score}/100 fan enthusiasm` : "no scores yet"}
          accent={kpis.top ? cityAccentOnPaper(kpis.top.city_id) : undefined}
          icon={<Trophy size={13} />}
        />
        <StatTile
          label="Grounding Verified"
          value={`${kpis.verified}/${kpis.total}`}
          hint="briefs fact-checked vs. live sources"
          icon={<ShieldCheck size={13} />}
        />
      </div>

      {editOpen && (
        <CampaignEditChat
          campaignId={activeCampaignId}
          onClose={() => setEditOpen(false)}
          onApplied={() => queryClient.invalidateQueries({ queryKey: ["campaignOverview", activeCampaignId] })}
        />
      )}

      {triggerError && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2 font-sans text-[12px] text-red-200">
          Couldn't start brief generation: {triggerError}
        </div>
      )}

      <div data-tour="city-grid" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.cities.map((city, i) => {
          const accent = cityAccentOnPaper(city.city_id);
          const isFinal = city.status === "final";
          const tier = tierBadge(city.city_importance_tier);
          const metaParts = [`Stop ${city.sequence_order}`, city.stop_date];
          if (city.event_format) metaParts.push(city.event_format);
          return (
            <motion.div
              key={city.city_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: "easeOut" }}
            >
              <Link
                to={`/city/${city.city_id}`}
                className="group block transition-transform duration-200 hover:-translate-y-1"
              >
                <CueCard
                  accent={accent}
                  className="transition-shadow duration-200 group-hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_24px_44px_-18px_rgba(0,0,0,0.65)]"
                  meta={metaParts.join(" · ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate font-display text-[22px] text-ink">{city.city_name}</h2>
                      {tier && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
                          style={{ backgroundColor: `${accent}1f`, color: accent }}
                        >
                          {tier}
                        </span>
                      )}
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-sans text-[10px] font-medium ${
                        isFinal ? "bg-emerald-900/10 text-emerald-800" : "bg-black/5 text-ink-muted"
                      }`}
                    >
                      {isFinal ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                      {isFinal ? "Final" : "Pending"}
                    </span>
                  </div>

                  <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                        Fan Enthusiasm
                      </p>
                      {city.grounding_check_passed && (
                        <span className="flex items-center gap-1 font-sans text-[10px] font-medium text-emerald-700">
                          <ShieldCheck size={11} /> Verified
                        </span>
                      )}
                    </div>
                    <StatMeter value={city.enthusiasm_score ?? 0} accent={accent} />
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
                    <span className="flex items-center gap-1.5 font-sans text-[12px] text-ink-muted">
                      <MapPin size={12} />
                      City intelligence &amp; delight card
                    </span>
                    <TrendingUp
                      size={13}
                      className="text-ink-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      style={{ color: accent }}
                    />
                  </div>
                </CueCard>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <CampaignInsightsPanel insights={data.campaignInsights} />
    </motion.div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-4 py-3 font-sans text-[13px] text-red-200">
      Couldn't load the campaign: {message}
    </div>
  );
}
