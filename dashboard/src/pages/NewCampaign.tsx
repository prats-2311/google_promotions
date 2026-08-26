import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { createCampaign } from "../lib/api";
import { useCampaignContext } from "../lib/campaignContext";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { StrategyChat } from "../components/ui/StrategyChat";
import type { SuggestedCampaign } from "../lib/types";

const SUPPORTED_CITIES = [
  { city_id: "mumbai", city_name: "Mumbai" },
  { city_id: "london", city_name: "London" },
  { city_id: "tokyo", city_name: "Tokyo" },
  { city_id: "sao_paulo", city_name: "São Paulo" },
  { city_id: "new_york", city_name: "New York" },
];

const CAMPAIGN_TYPES = [
  { value: "film_promo_tour", label: "Film Promo Tour" },
  { value: "music_world_tour", label: "Music World Tour" },
];

// Reusable across campaigns -- city_demographics is city-level, not tied to
// any one campaign's genre. Selecting a metric here is what triggers the
// orchestration driver's curated-then-live-Parallel-Search-fallback fetch
// for each of this campaign's city stops (see run_campaign.py:_fetch_key_metrics).
const METRIC_OPTIONS = [
  { key: "literacy_rate", label: "Literacy rate" },
  { key: "median_household_income_usd", label: "Median income" },
  { key: "population", label: "Population" },
  { key: "median_age", label: "Median age" },
  { key: "internet_penetration_rate", label: "Internet penetration" },
  { key: "dominant_social_platforms", label: "Dominant social platforms" },
  { key: "top_interest_categories", label: "Top interest categories" },
  { key: "notable_public_holidays", label: "Public holidays" },
];

interface StopEntry {
  city_id: string;
  stop_date: string;
}

// The native <input type="date"> renders in whatever dd/mm/yyyy vs mm/dd/yyyy
// order the browser/OS locale uses, with no visible label -- typing digits in
// the "wrong" order (or landing on the wrong segment) silently produces an
// incomplete value with zero feedback, since onChange only fires once every
// segment is valid. This formats the underlying value (always ISO
// yyyy-mm-dd, independent of display locale) into an unambiguous, spelled-out
// date right next to the field, so a mistyped/incomplete date is immediately
// visible instead of looking like it worked.
function formatStopDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function NewCampaign() {
  const navigate = useNavigate();
  const { setActiveCampaignId, refresh } = useCampaignContext();

  const [title, setTitle] = useState("");
  const [campaignType, setCampaignType] = useState(CAMPAIGN_TYPES[0].value);
  const [genre, setGenre] = useState("");
  const [talentRoster, setTalentRoster] = useState("");
  const [stops, setStops] = useState<StopEntry[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCity(cityId: string) {
    setStops((prev) =>
      prev.some((s) => s.city_id === cityId)
        ? prev.filter((s) => s.city_id !== cityId)
        : [...prev, { city_id: cityId, stop_date: "" }]
    );
  }

  function setStopDate(cityId: string, date: string) {
    setStops((prev) => prev.map((s) => (s.city_id === cityId ? { ...s, stop_date: date } : s)));
  }

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  function applySuggestion(suggested: SuggestedCampaign) {
    setTitle(suggested.title);
    setCampaignType(suggested.campaign_type);
    setGenre(suggested.genre);
    setTalentRoster(suggested.talent_roster.join(", "));
    setStops(
      suggested.stops
        .filter((s) => SUPPORTED_CITIES.some((c) => c.city_id === s.city_id))
        .map((s) => ({ city_id: s.city_id, stop_date: s.stop_date }))
    );
  }

  const canSubmit =
    title.trim().length > 0 &&
    genre.trim().length > 0 &&
    stops.length > 0 &&
    stops.every((s) => s.stop_date.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCampaign({
        title: title.trim(),
        campaign_type: campaignType,
        genre: genre.trim(),
        talent_roster: talentRoster
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        stops: [...stops]
          .sort((a, b) => a.stop_date.localeCompare(b.stop_date))
          .map((s) => ({ city_id: s.city_id, stop_date: s.stop_date })),
        selected_metrics: selectedMetrics,
      });
      refresh();
      setActiveCampaignId(result.campaign_id);
      navigate("/");
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-6 flex items-center gap-1.5 font-sans text-[13px] text-canvas-muted hover:text-canvas-text">
        <ArrowLeft size={14} /> Back to campaign
      </Link>

      <header className="mb-8">
        <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">Set up a tour</p>
        <h1 className="mt-1 font-display text-[30px] text-canvas-text">New Campaign</h1>
        <p className="mt-1.5 font-sans text-[13px] text-canvas-muted">
          Stops are limited to the five cities with full culture, fan, and delight coverage.
        </p>
      </header>

      <StrategyChat onSuggestion={applySuggestion} />

      <form onSubmit={handleSubmit} className="rounded-2xl bg-paper p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Campaign Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midnight Frequency"
              className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-sans text-[13px] text-ink outline-none focus:border-ink/30"
            />
          </Field>
          <Field label="Genre">
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g. synth-pop"
              className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-sans text-[13px] text-ink outline-none focus:border-ink/30"
            />
          </Field>
          <Field label="Campaign Type">
            <select
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-sans text-[13px] text-ink outline-none focus:border-ink/30"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Talent Roster">
            <input
              value={talentRoster}
              onChange={(e) => setTalentRoster(e.target.value)}
              placeholder="comma-separated, e.g. lead singer, director"
              className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-sans text-[13px] text-ink outline-none focus:border-ink/30"
            />
          </Field>
        </div>

        <div className="mt-6">
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            City Stops
          </p>
          <div className="space-y-2">
            {SUPPORTED_CITIES.map((city) => {
              const stop = stops.find((s) => s.city_id === city.city_id);
              const selected = !!stop;
              const accent = cityAccentOnPaper(city.city_id);
              return (
                <div
                  key={city.city_id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    selected ? "border-ink/15 bg-black/[0.02]" : "border-line"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCity(city.city_id)}
                    className="flex flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
                      style={{
                        backgroundColor: selected ? accent : "transparent",
                        borderColor: selected ? accent : "rgba(20,21,26,0.2)",
                      }}
                    >
                      {selected && <Check size={11} className="text-white" />}
                    </span>
                    <span className="font-sans text-[13px] text-ink">{city.city_name}</span>
                  </button>
                  {selected && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-sans text-[12px] ${stop.stop_date ? "text-ink" : "text-ink-muted italic"}`}
                      >
                        {stop.stop_date ? formatStopDate(stop.stop_date) : "Pick a date"}
                      </span>
                      <input
                        type="date"
                        min={TODAY_ISO}
                        value={stop.stop_date}
                        onChange={(e) => setStopDate(city.city_id, e.target.value)}
                        className="rounded-md border border-line bg-paper-raised px-2 py-1 font-sans text-[12px] text-ink outline-none focus:border-ink/30"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Key Metrics to Consider
          </p>
          <p className="mb-2 font-sans text-[12px] text-ink-muted">
            Fetched for each city stop — from curated data when available, live web search otherwise.
          </p>
          <div className="flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((metric) => {
              const selected = selectedMetrics.includes(metric.key);
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => toggleMetric(metric.key)}
                  className={`rounded-full border px-3 py-1.5 font-sans text-[12px] transition-colors ${
                    selected
                      ? "border-gold bg-gold/15 text-ink"
                      : "border-line bg-paper-raised text-ink-muted hover:text-ink"
                  }`}
                >
                  {metric.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-red-900/20 bg-red-950/5 px-3 py-2 font-sans text-[12px] text-red-800">
            Couldn't create the campaign: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? "Creating…" : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
