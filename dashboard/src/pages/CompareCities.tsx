import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Table2, BarChart3, Trophy, Gauge, MapPin, Crown } from "lucide-react";
import { getCampaignOverview, rankCities } from "../lib/api";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { useCampaignContext } from "../lib/campaignContext";
import { StatTile } from "../components/ui/StatTile";
import { CompareCitiesSkeleton } from "../components/ui/Skeletons";

interface RankedCity {
  city_id: string;
  city_name: string;
  enthusiasm_score: number;
  city_importance_tier: string;
  strategic_rank: number;
}

// Count of cities in the top importance tier ("Tier 1", "tier_1", "1", …) --
// the strategic headline "how many must-win markets is this tour hitting".
function tierOneCount(cities: RankedCity[]): number {
  return cities.filter((c) => /\b1\b/.test(c.city_importance_tier)).length;
}

async function loadComparison(campaignId: string) {
  const overview = await getCampaignOverview(campaignId);
  // city_importance_tier now comes from the overview itself -- the BFF's
  // /overview route fetches each city's real fan_signals record (server/
  // index.js), so this is the actual curated tier, not a score-bucket guess.
  // A city can still genuinely lack a tier (no fan_signals row at all for an
  // unseeded city/genre combo) -- "Unranked" says that honestly rather than
  // inventing one.
  const records = overview.cities.map((c) => ({
    city_id: c.city_id,
    enthusiasm_score: c.enthusiasm_score ?? 0,
    city_importance_tier: c.city_importance_tier ?? "Unranked",
  }));
  const result = await rankCities(records);
  const byId = Object.fromEntries(overview.cities.map((c) => [c.city_id, c.city_name]));
  const ranked: RankedCity[] = result.ranked.map((r) => ({ ...r, city_name: byId[r.city_id] }));
  return { overview, ranked };
}

// After this long, the plain skeleton stops looking like normal loading and
// starts looking broken with no way to tell the difference -- surface an
// honest "still working" note instead of leaving it silent. The 30s request
// timeout (lib/api.ts) is what actually bounds a genuine hang; this is just
// about not leaving the person staring at nothing in the meantime.
const SLOW_LOAD_NOTICE_MS = 6000;

export function CompareCities() {
  const { activeCampaignId } = useCampaignContext();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hovered, setHovered] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const reduceMotion = useReducedMotion();

  const { data, error, isFetching } = useQuery({
    queryKey: ["compareCities", activeCampaignId],
    queryFn: () => loadComparison(activeCampaignId),
  });

  useEffect(() => {
    if (!isFetching) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_LOAD_NOTICE_MS);
    return () => clearTimeout(t);
  }, [isFetching]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-4 py-3 font-sans text-[13px] text-red-200">
        Couldn't load the comparison. Reload the page to try again.
        <p className="mt-1 font-mono text-[11px] text-red-300/70">{String(error)}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <CompareCitiesSkeleton />
        {slow && (
          <p className="mt-4 text-center font-sans text-[12px] text-canvas-muted">
            Still working on it — this shouldn't take more than a few seconds.
          </p>
        )}
      </div>
    );
  }
  const { overview, ranked } = data;
  const avgScore = ranked.length
    ? Math.round(ranked.reduce((s, c) => s + c.enthusiasm_score, 0) / ranked.length)
    : 0;
  const leader = ranked[0] ?? null;

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">
            {overview.campaign.title}
          </p>
          <h1 className="mt-1 text-balance font-display text-[32px] leading-none text-canvas-text">Compare Cities</h1>
          <p className="mt-2 max-w-2xl font-sans text-[13px] text-canvas-muted">
            Ranked by strategic value — importance tier first, fan enthusiasm as the tiebreak.
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-canvas-line p-1">
          <ViewToggle active={view === "chart"} onClick={() => setView("chart")} icon={BarChart3} label="Chart" />
          <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={Table2} label="Table" />
        </div>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Cities Compared"
          value={ranked.length}
          hint="stops in this campaign"
          icon={<MapPin size={13} />}
        />
        <StatTile
          label="Strategic #1"
          value={leader ? leader.city_name : "—"}
          hint={leader ? `${leader.city_importance_tier} · ${leader.enthusiasm_score}/100` : "no cities yet"}
          accent={leader ? cityAccentOnPaper(leader.city_id) : undefined}
          icon={<Trophy size={13} />}
        />
        <StatTile
          label="Avg Enthusiasm"
          value={avgScore}
          hint="mean across all stops / 100"
          icon={<Gauge size={13} />}
        />
        <StatTile
          label="Tier 1 Markets"
          value={`${tierOneCount(ranked)}/${ranked.length}`}
          hint="must-win markets on the route"
          icon={<Crown size={13} />}
        />
      </div>

      <div className="rounded-2xl bg-paper p-6">
        {view === "chart" ? (
          <div className="relative space-y-4">
            {/* Campaign-average reference line -- lets a reader see each city
                against the mean at a glance, not just against each other. The
                bars share a full-width 0-100 track, so a single line at
                avg% lands correctly across every row. */}
            {avgScore > 0 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center text-ink/25"
                style={{ left: `${avgScore}%` }}
              >
                <span className="w-px flex-1" style={{ backgroundImage: "repeating-linear-gradient(to bottom, currentColor 0 3px, transparent 3px 6px)" }} />
                <span className="mt-1 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-paper tabular-nums">
                  Avg {avgScore}
                </span>
              </div>
            )}
            {ranked.map((city, i) => {
              const accent = cityAccentOnPaper(city.city_id);
              // enthusiasm_score is hard-clamped to [0, 100] by the scoring
              // SDK (sdk/enthusiasm_scoring.py), so the score IS the percent
              // of the fixed scale -- not a percent of the current
              // comparison set's own max. Normalizing against the local max
              // (as this used to) makes any two similar or low scores both
              // render as full bars, which is actively misleading, not just
              // less pretty.
              const widthPct = city.enthusiasm_score;
              return (
                <Link
                  key={city.city_id}
                  to={`/city/${city.city_id}`}
                  className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                  onMouseEnter={() => setHovered(city.city_id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-ink-muted">
                        #{city.strategic_rank}
                      </span>
                      <span className="font-display text-[16px] text-ink">{city.city_name}</span>
                      {i === 0 && (
                        <Crown size={13} aria-hidden style={{ color: accent }} />
                      )}
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
                        opacity: hovered === null || hovered === city.city_id ? 1 : 0.5,
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
              {ranked.map((city) => {
                const accent = cityAccentOnPaper(city.city_id);
                return (
                  <tr key={city.city_id} className="border-b border-line transition-colors last:border-0 hover:bg-black/[0.025]">
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-ink-muted">{city.strategic_rank}</td>
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/city/${city.city_id}`}
                        className="inline-flex items-center gap-2 rounded text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink/40"
                      >
                        <span className="size-2 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
                        {city.city_name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{city.city_importance_tier}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-ink">{city.enthusiasm_score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
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
