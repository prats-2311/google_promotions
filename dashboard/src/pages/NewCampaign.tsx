import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Loader2, Search, TrendingUp, CheckCircle2 } from "lucide-react";
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

// The native <input type="date"> silently shows empty for anything that
// isn't exactly this shape, and formatStopDate above renders "Invalid
// Date" for the same input -- the strategy chat's schema now asks the
// model for strict ISO, but a model is never a guaranteed-format source.
// Reject anything else here rather than let a malformed string reach form
// state and corrupt both displays; the user just gets an empty date to
// fill in themselves instead of a broken one.
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
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
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  async function handleFind() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await discoverVenues(cityName, country);
      setVenues(res.venues);
      setQueriesUsed(res.search_queries_used);
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
      {error && <p className="mt-1 font-sans text-[11px] text-red-300">Couldn't find venues: {error}</p>}

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
              <div key={i} className="flex items-start gap-1 rounded-md px-2 py-1.5 hover:bg-white/[0.05]">
                <button type="button" onClick={() => pick(v)} className="flex-1 text-left">
                  <span className="block font-sans text-[12px] text-ink">{v.name}</span>
                  <span className="block font-sans text-[10.5px] text-ink-muted">
                    {v.venue_type}
                    {v.approx_capacity ? ` · ${v.approx_capacity}` : ""}
                  </span>
                  {v.note && <span className="mt-0.5 block font-sans text-[10.5px] text-ink-muted">{v.note}</span>}
                </button>
                <a
                  href={v.source_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open source page — reviews, photos, real capacity/infrastructure details"
                  className="mt-0.5 shrink-0 text-ink-muted hover:text-ink"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
          {!loading && queriesUsed.length > 0 && (
            <p className="px-2 pt-1 font-mono text-[10px] leading-relaxed text-ink-muted/80">
              Searched: {queriesUsed.join(" · ")}
            </p>
          )}
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
  // What the assistant last suggested for each field -- lets applySuggestion
  // tell "the user typed over the assistant's guess" apart from "the field
  // still matches what was last suggested, safe to update live." Without
  // this, live partial fill-in would either never touch a field again after
  // the first suggestion, or blindly stomp on a manual edit every turn.
  const [lastSuggested, setLastSuggested] = useState<SuggestedCampaign | null>(null);

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

  // Fills the form live as the assistant confirms each field, without ever
  // clobbering something the user typed/toggled by hand: a scalar field
  // only updates while it still matches empty or the assistant's own last
  // guess (comparing against lastSuggested, not the raw current value,
  // is what tells "user hasn't touched this since" apart from "user typed
  // over it"). Stops use a diff against lastSuggested's own city set so a
  // city the assistant later drops disappears here too, while a city the
  // user checked manually is never removed out from under them.
  function applySuggestion(suggested: SuggestedCampaign) {
    if (title === "" || title === lastSuggested?.title) setTitle(suggested.title);
    if (genre === "" || genre === lastSuggested?.genre) setGenre(suggested.genre);
    if (
      (campaignType === CAMPAIGN_TYPES[0].value || campaignType === lastSuggested?.campaign_type) &&
      suggested.campaign_type
    ) {
      setCampaignType(suggested.campaign_type);
    }
    const lastSuggestedTalent = (lastSuggested?.talent_roster ?? []).join(", ");
    if ((talentRoster === "" || talentRoster === lastSuggestedTalent) && suggested.talent_roster.length > 0) {
      setTalentRoster(suggested.talent_roster.join(", "));
    }

    const sanitizedStops = suggested.stops.map((s) => ({
      ...s,
      stop_date: s.stop_date && isValidIsoDate(s.stop_date) ? s.stop_date : "",
    }));
    const suggestedIds = new Set(sanitizedStops.map((s) => s.city_id));
    const priorSuggestedIds = new Set((lastSuggested?.stops ?? []).map((s) => s.city_id));
    setStops((prev) => {
      const kept = prev.filter((s) => !priorSuggestedIds.has(s.city_id) || suggestedIds.has(s.city_id));
      const updated = kept.map((s) => {
        if (s.stop_date) return s;
        const match = sanitizedStops.find((x) => x.city_id === s.city_id);
        return match?.stop_date ? { ...s, stop_date: match.stop_date } : s;
      });
      const existingIds = new Set(updated.map((s) => s.city_id));
      const added = sanitizedStops
        .filter((s) => !existingIds.has(s.city_id) && cities.some((c) => c.city_id === s.city_id))
        .map((s) => ({ city_id: s.city_id, stop_date: s.stop_date }));
      return [...updated, ...added];
    });

    setLastSuggested(suggested);
  }

  const canSubmit =
    title.trim().length > 0 &&
    genre.trim().length > 0 &&
    stops.length > 0 &&
    stops.every((s) => s.stop_date.length > 0);

  // What's still missing, in plain language -- so a disabled Create button
  // explains itself instead of just sitting greyed out with no reason.
  const undatedStops = stops.filter((s) => !s.stop_date).length;
  const missing: string[] = [];
  if (!title.trim()) missing.push("Name the campaign");
  if (!genre.trim()) missing.push("Set a genre");
  if (stops.length === 0) missing.push("Select at least one city stop");
  if (undatedStops > 0) missing.push(`Pick a date for ${undatedStops} selected ${undatedStops === 1 ? "stop" : "stops"}`);

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
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 rounded font-sans text-[13px] text-canvas-muted outline-none transition-colors hover:text-canvas-text focus-visible:ring-2 focus-visible:ring-gold"
      >
        <ArrowLeft size={14} aria-hidden /> Back to campaign
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-gold" aria-hidden />
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">Set up a tour</p>
        </div>
        <h1 className="title-sheen mt-1.5 text-balance font-title text-[42px] leading-none">New Campaign</h1>
        <p className="mt-2 font-sans text-[13px] text-canvas-muted">
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
        <SectionHeader index={1} title="Campaign Details" hint="What is this tour, and who's on it?" />
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

        <div className="mt-8 border-t border-line pt-6">
          <SectionHeader
            index={2}
            title="City Stops"
            hint={stops.length > 0
              ? `${stops.length} selected · ${stops.length - undatedStops} dated`
              : "Pick the cities this tour will visit and set each date."}
          />
          <div className="space-y-2">
            {cities.map((city) => {
              const stop = stops.find((s) => s.city_id === city.city_id);
              const selected = !!stop;
              const accent = cityAccentOnPaper(city.city_id);
              return (
                <div
                  key={city.city_id}
                  className={`rounded-lg border px-3 py-2.5 transition-colors ${
                    selected ? "border-ink/15 bg-white/[0.03]" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCity(city.city_id)}
                      aria-pressed={selected}
                      className="flex flex-1 items-center gap-2.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
                        style={{
                          backgroundColor: selected ? accent : "transparent",
                          borderColor: selected ? accent : "rgba(240,238,230,0.3)",
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

        <div className="mt-8 border-t border-line pt-6">
          <SectionHeader
            index={3}
            title="Key Metrics to Consider"
            hint="Fetched for each city stop — curated data when available, live web search otherwise."
          />
          <div className="flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((metric) => {
              const selected = selectedMetrics.includes(metric.key);
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => toggleMetric(metric.key)}
                  aria-pressed={selected}
                  className={`rounded-full border px-3 py-1.5 font-sans text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/40 ${
                    selected
                      ? "border-gold/70 bg-gold/15 text-gold"
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
          <div className="mt-5 rounded-lg border border-red-300/20 bg-red-300/[0.06] px-3 py-2 font-sans text-[12px] text-red-300">
            Couldn't create the campaign: {error}
          </div>
        )}

        <div className="mt-8 border-t border-line pt-5">
          {/* Explain a disabled Create button instead of leaving it silently
              greyed out -- a live checklist of what's still required. */}
          {missing.length > 0 ? (
            <ul className="mb-3 space-y-1" aria-label="Steps still needed before creating">
              {missing.map((m) => (
                <li key={m} className="flex items-center gap-2 font-sans text-[12px] text-ink-muted">
                  <span className="size-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 flex items-center gap-1.5 font-sans text-[12px] font-medium text-emerald-300">
              <CheckCircle2 size={13} aria-hidden /> Ready to launch — {stops.length}{" "}
              {stops.length === 1 ? "stop" : "stops"} set.
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="btn-gold flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[13px] font-semibold text-on-gold outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {submitting ? "Creating…" : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Setting up a campaign is a genuine sequence (details → stops → metrics →
// create), so a numbered step marker here encodes real order, not decoration.
function SectionHeader({ index, title, hint }: { index: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-semibold tabular-nums text-paper">
        {index}
      </span>
      <div>
        <p className="font-display text-[13px] uppercase tracking-[0.08em] text-ink">{title}</p>
        {hint && <p className="mt-0.5 font-sans text-[12px] text-ink-muted">{hint}</p>}
      </div>
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
