import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Search, TrendingUp } from "lucide-react";
import { createCampaign, discoverVenues, getGenreRecommendations, listCities } from "../lib/api";
import { useCampaignContext } from "../lib/campaignContext";
import { cityAccentOnPaper } from "../lib/cityTheme";
import { StrategyChat } from "../components/ui/StrategyChat";
import type { DiscoveredVenue, SuggestedCampaign } from "../lib/types";

const GENRE_DEBOUNCE_MS = 500;

// Cross-campaign learning: real historical enthusiasm outcomes for this
// genre, aggregated across every past campaign's finalized briefs -- not a
// static seed table. Naturally silent until enough campaigns have actually
// run; an empty state here just means "no signal yet," not an error, so it
// renders nothing rather than a forced null-state message.
function GenreHistoricalHint({ genre }: { genre: string }) {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const trimmed = genre.trim();
    if (!trimmed) {
      setDebounced("");
      return;
    }
    const t = setTimeout(() => setDebounced(trimmed), GENRE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [genre]);

  const { data } = useQuery({
    queryKey: ["genreRecommendations", debounced],
    queryFn: () => getGenreRecommendations(debounced),
    enabled: debounced.length > 0,
  });

  const top = data?.recommendations?.[0];
  if (!top) return null;

  return (
    <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[11.5px] text-ink-muted">
      <TrendingUp size={12} className="text-gold" />
      {top.city_id} historically drove the highest fan enthusiasm ({Math.round(top.avg_enthusiasm_score)}/100 avg
      across {top.sample_size} past {top.sample_size === 1 ? "stop" : "stops"}) for this genre
    </p>
  );
}

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
  venue_url?: string;
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

// Venue discovery: rather than requiring the campaign creator to already
// have a specific venue URL in hand, a real Parallel Search surfaces actual
// candidate venues for this city to pick from. Manual URL paste stays as a
// fallback for a venue that doesn't turn up in search.
function VenueField({
  cityName,
  country,
  venueUrl,
  onChange,
}: {
  cityName: string;
  country: string | null;
  venueUrl: string;
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<DiscoveredVenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  async function handleFind() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await discoverVenues(cityName, country);
      setVenues(res.venues);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function pick(venue: DiscoveredVenue) {
    onChange(venue.source_url);
    setPickedName(venue.name);
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={venueUrl}
          onChange={(e) => {
            onChange(e.target.value);
            setPickedName(null);
          }}
          placeholder="Venue or promoter URL (optional) — pulls capacity, logistics & commute notes"
          className="w-full rounded-md border border-line bg-paper-raised px-2 py-1.5 font-sans text-[12px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-ink/30"
        />
        <button
          type="button"
          onClick={handleFind}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1.5 font-sans text-[11.5px] text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          Find venues
        </button>
      </div>

      {pickedName && (
        <p className="mt-1 font-sans text-[11px] text-ink-muted">Selected: {pickedName}</p>
      )}
      {error && <p className="mt-1 font-sans text-[11px] text-red-800">Couldn't find venues: {error}</p>}

      {open && (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-line bg-paper-raised p-1.5">
          {loading && (
            <p className="px-2 py-1.5 font-sans text-[11.5px] text-ink-muted">
              Searching real venues in {cityName}…
            </p>
          )}
          {!loading && venues?.length === 0 && (
            <p className="px-2 py-1.5 font-sans text-[11.5px] text-ink-muted">
              No venues found — try pasting a URL directly.
            </p>
          )}
          {!loading &&
            venues?.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(v)}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-black/[0.03]"
              >
                <span className="block font-sans text-[12px] text-ink">{v.name}</span>
                <span className="block font-sans text-[10.5px] text-ink-muted">
                  {v.venue_type}
                  {v.approx_capacity ? ` · ${v.approx_capacity}` : ""}
                </span>
              </button>
            ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-0.5 px-2 py-1 font-sans text-[10.5px] text-ink-muted underline"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export function NewCampaign() {
  const navigate = useNavigate();
  const { setActiveCampaignId, refresh } = useCampaignContext();

  const { data: citiesData } = useQuery({ queryKey: ["cities"], queryFn: listCities });
  const cities = citiesData?.cities ?? [];

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

  function setVenueUrl(cityId: string, url: string) {
    setStops((prev) => prev.map((s) => (s.city_id === cityId ? { ...s, venue_url: url } : s)));
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
        .filter((s) => cities.some((c) => c.city_id === s.city_id))
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
          .map((s) => ({
            city_id: s.city_id,
            stop_date: s.stop_date,
            ...(s.venue_url?.trim() ? { venue_url: s.venue_url.trim() } : {}),
          })),
        selected_metrics: selectedMetrics,
      });
      // Must await the campaigns list refresh before setting the new id
      // active -- otherwise campaignContext's self-heal effect sees the
      // brand-new campaign missing from the still-stale list and reverts
      // straight back to whichever campaign was active before.
      await refresh();
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
          {cities.length > 0 ? (
            <>
              Stops can be any of the {cities.length} known cities — need one that's missing?{" "}
              <Link to="/cities/add" className="text-gold underline hover:no-underline">
                Add it first
              </Link>
              .
            </>
          ) : (
            "Loading known cities…"
          )}
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
            <GenreHistoricalHint genre={genre} />
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
            {cities.map((city) => {
              const stop = stops.find((s) => s.city_id === city.city_id);
              const selected = !!stop;
              const accent = cityAccentOnPaper(city.city_id);
              return (
                <div
                  key={city.city_id}
                  className={`rounded-lg border px-3 py-2.5 transition-colors ${
                    selected ? "border-ink/15 bg-black/[0.02]" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-3">
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
                  {selected && (
                    <VenueField
                      cityName={city.city_name}
                      country={city.country}
                      venueUrl={stop.venue_url ?? ""}
                      onChange={(url) => setVenueUrl(city.city_id, url)}
                    />
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
