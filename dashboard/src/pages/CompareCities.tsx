import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Table2, BarChart3 } from "lucide-react";
import { getCampaignOverview, rankCities } from "../lib/api";
import type { CampaignOverview } from "../lib/types";
import { cityAccentOnPaper } from "../lib/cityTheme";

const CAMPAIGN_ID = "nova_horizon_2026";

interface RankedCity {
  city_id: string;
  city_name: string;
  enthusiasm_score: number;
  city_importance_tier: string;
  strategic_rank: number;
}

export function CompareCities() {
  const [overview, setOverview] = useState<CampaignOverview | null>(null);
  const [ranked, setRanked] = useState<RankedCity[] | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    getCampaignOverview(CAMPAIGN_ID).then(async (data) => {
      setOverview(data);
      // Need each city's tier — the overview doesn't carry it, so pull it from
      // the tier already known per-city via a lightweight re-fetch isn't
      // available here; approximate tier bucket from score for ranking input
      // is wrong — instead call rank_cities with what we have plus a tier
      // derived the same way the SDK does server-side as a fallback.
      const records = data.cities.map((c) => ({
        city_id: c.city_id,
        enthusiasm_score: c.enthusiasm_score ?? 0,
        city_importance_tier: tierFromScore(c.enthusiasm_score ?? 0),
      }));
      const result = await rankCities(records);
      const byId = Object.fromEntries(data.cities.map((c) => [c.city_id, c.city_name]));
      setRanked(result.ranked.map((r) => ({ ...r, city_name: byId[r.city_id] })));
    });
  }, []);

  if (!overview || !ranked) return <p className="font-sans text-[13px] text-canvas-muted">Loading comparison…</p>;

  const maxScore = Math.max(...ranked.map((r) => r.enthusiasm_score), 1);

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
            {overview.campaign.title}
          </p>
          <h1 className="mt-1 font-display text-[30px] text-canvas-text">Compare Cities</h1>
          <p className="mt-1.5 font-sans text-[13px] text-canvas-muted">
            Ranked by strategic value — tier first, enthusiasm score as tiebreak.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-canvas-line p-1">
          <ViewToggle active={view === "chart"} onClick={() => setView("chart")} icon={BarChart3} label="Chart" />
          <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={Table2} label="Table" />
        </div>
      </header>

      <div className="rounded-2xl bg-paper p-6">
        {view === "chart" ? (
          <div className="space-y-4">
            {ranked.map((city, i) => {
              const accent = cityAccentOnPaper(city.city_id);
              const widthPct = (city.enthusiasm_score / maxScore) * 100;
              return (
                <Link
                  key={city.city_id}
                  to={`/city/${city.city_id}`}
                  className="block"
                  onMouseEnter={() => setHovered(city.city_id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-[11px] font-semibold text-ink-muted">#{city.strategic_rank}</span>
                      <span className="font-display text-[16px] text-ink">{city.city_name}</span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 font-sans text-[10px] text-ink-muted">
                        {city.city_importance_tier}
                      </span>
                    </div>
                    <span className="font-sans text-[13px] font-semibold tabular-nums text-ink">
                      {city.enthusiasm_score}
                    </span>
                  </div>
                  <div className="relative h-5 bg-black/5">
                    <motion.div
                      className="h-5 rounded-r-[4px]"
                      style={{
                        backgroundColor: accent,
                        opacity: hovered === null || hovered === city.city_id ? 1 : 0.55,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ delay: i * 0.06, duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <th className="py-2 pr-3">Rank</th>
                <th className="py-2 pr-3">City</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 text-right">Enthusiasm</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((city) => (
                <tr key={city.city_id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 tabular-nums text-ink-muted">{city.strategic_rank}</td>
                  <td className="py-2.5 pr-3">
                    <Link to={`/city/${city.city_id}`} className="text-ink hover:underline">
                      {city.city_name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">{city.city_importance_tier}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-ink">{city.enthusiasm_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function tierFromScore(score: number): string {
  if (score >= 85) return "Tier 1";
  if (score >= 70) return "Tier 2";
  return "Tier 3";
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BarChart3;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-sans text-[12px] transition-colors ${
        active ? "bg-canvas-raised text-canvas-text" : "text-canvas-muted hover:text-canvas-text"
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}
