import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, MapPin } from "lucide-react";
import { getCampaignOverview } from "../lib/api";
import type { CampaignOverview } from "../lib/types";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { StatMeter } from "../components/ui/StatMeter";

const CAMPAIGN_ID = "nova_horizon_2026";

export function Dashboard() {
  const [data, setData] = useState<CampaignOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCampaignOverview(CAMPAIGN_ID).then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const finalCount = data.cities.filter((c) => c.status === "final").length;

  return (
    <div>
      <header className="mb-8">
        <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
          {data.campaign.campaign_type.replace(/_/g, " ")}
        </p>
        <h1 className="mt-1 font-display text-[34px] text-canvas-text">{data.campaign.title}</h1>
        <p className="mt-1.5 font-sans text-[13px] text-canvas-muted">
          {data.campaign.genre} · {data.cities.length} city stops · {finalCount} of {data.cities.length} briefs finalized
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>
  );
}

function LoadingState() {
  return <p className="font-sans text-[13px] text-canvas-muted">Loading campaign…</p>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-4 py-3 font-sans text-[13px] text-red-200">
      Couldn't load the campaign: {message}
    </div>
  );
}
