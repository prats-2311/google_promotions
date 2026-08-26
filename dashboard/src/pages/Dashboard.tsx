import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, MapPin, Sparkles, Loader2 } from "lucide-react";
import { getCampaignOverview, generateBriefs } from "../lib/api";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { StatMeter } from "../components/ui/StatMeter";
import { useCampaignContext } from "../lib/campaignContext";
import { DashboardSkeleton } from "../components/ui/Skeletons";

// Polling interval while generation is in flight -- the agent pipeline takes
// real wall-clock minutes per city (multiple LLM turns against Dialogflow
// CX), so this just needs to be frequent enough to feel live, not tight.
const GENERATION_POLL_MS = 8000;

export function Dashboard() {
  const { activeCampaignId } = useCampaignContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

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

  const finalCount = data.cities.filter((c) => c.status === "final").length;

  async function handleGenerate() {
    setTriggerError(null);
    setIsGenerating(true);
    try {
      await generateBriefs(activeCampaignId);
    } catch (err) {
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
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
            {data.campaign.campaign_type.replace(/_/g, " ")}
          </p>
          <h1 className="mt-1 font-display text-[34px] text-canvas-text">{data.campaign.title}</h1>
          <p className="mt-1.5 font-sans text-[13px] text-canvas-muted">
            {data.campaign.genre} · {data.cities.length} city stops · {finalCount} of {data.cities.length} briefs finalized
          </p>
        </div>
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
      </header>
      {triggerError && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2 font-sans text-[12px] text-red-200">
          Couldn't start brief generation: {triggerError}
        </div>
      )}

      <div data-tour="city-grid" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.cities.map((city, i) => {
          const accent = cityAccentOnPaper(city.city_id);
          const isFinal = city.status === "final";
          return (
            <motion.div
              key={city.city_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: "easeOut" }}
            >
              <Link
                to={`/city/${city.city_id}`}
                className="group block overflow-hidden rounded-2xl bg-paper shadow-[0_1px_2px_rgba(0,0,0,0.3),0_16px_32px_-16px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-1"
              >
                <div className="h-1.5" style={{ backgroundColor: accent }} />
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-sans text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                        Stop {city.sequence_order} · {city.stop_date}
                      </p>
                      <h2 className="mt-0.5 font-display text-[22px] text-ink">{city.city_name}</h2>
                    </div>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-1 font-sans text-[10px] font-medium ${
                        isFinal ? "bg-emerald-900/10 text-emerald-800" : "bg-black/5 text-ink-muted"
                      }`}
                    >
                      {isFinal ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                      {isFinal ? "Final" : "Pending"}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="mb-1.5 font-sans text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                      Fan Enthusiasm
                    </p>
                    <StatMeter value={city.enthusiasm_score ?? 0} accent={accent} />
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 font-sans text-[12px] text-ink-muted">
                    <MapPin size={12} />
                    <span>View city intelligence &amp; delight card</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
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
