import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Globe2, Loader2, Sparkles, MapPin } from "lucide-react";
import { bulkAddCities, listCities } from "../lib/api";
import type { BulkAddCitiesResponse } from "../lib/types";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </span>
      {hint && <span className="mb-1.5 block font-sans text-[12px] text-ink-muted">{hint}</span>}
      {children}
    </label>
  );
}

// Real phases of what /bulk_add_cities actually does server-side (see its
// docstring in cloud_run/tour_data_api/main.py) -- not a fake progress bar.
// There's no server push to know exactly which phase is active right now
// (that would need real streaming plumbing this app doesn't have), so this
// just cycles through the genuine steps on a timer while the request is in
// flight, honest about the KIND of work happening without claiming to show
// literal live search results.
const RESEARCH_PHASES = [
  "Creating a Parallel research task…",
  "Researching region, country, and primary language…",
  "Cross-checking timezone and details…",
  "Almost there — saving to your city library…",
] as const;
const RESEARCH_PHASE_INTERVAL_MS = 5000;

function useResearchPhase(active: boolean): string {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const id = setInterval(() => {
      setPhase((p) => Math.min(p + 1, RESEARCH_PHASES.length - 1));
    }, RESEARCH_PHASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  return RESEARCH_PHASES[phase];
}

export function AddCities() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["cities"], queryFn: listCities });
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkAddCitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const researchPhase = useResearchPhase(submitting);

  const cityNames = input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cityNames.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await bulkAddCities(cityNames);
      setResult(res);
      setInput("");
      await queryClient.invalidateQueries({ queryKey: ["cities"] });
    } catch (err) {
      setError(String(err));
    } finally {
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
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-canvas-muted">Expand Coverage</p>
        </div>
        <h1 className="mt-1.5 text-balance font-display text-[38px] leading-none text-canvas-text">Add Cities</h1>
        <p className="mt-2 font-sans text-[13px] text-canvas-muted">
          Real Parallel Task API research per city — region, country, primary language, and timezone, not a bare
          placeholder row. New cities become selectable in New Campaign as soon as research finishes.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-paper p-6">
        <Field label="City names" hint="One per line, or comma-separated.">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"Seoul\nBerlin\nLagos"}
            rows={4}
            spellCheck={false}
            className="w-full resize-none rounded-lg border border-line bg-paper-raised px-3 py-2 font-sans text-[13px] text-ink outline-none transition-colors focus:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink/20"
          />
        </Field>

        {error && <p className="mt-3 font-sans text-[12px] text-red-800">Couldn't add cities: {error}</p>}

        <button
          type="submit"
          disabled={cityNames.length === 0 || submitting}
          className="mt-4 flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-sans text-[13px] font-medium text-paper outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {submitting
            ? `Researching ${cityNames.length} ${cityNames.length === 1 ? "city" : "cities"}…`
            : cityNames.length > 0
              ? `Research & Add ${cityNames.length} ${cityNames.length === 1 ? "City" : "Cities"}`
              : "Research & Add Cities"}
        </button>

        {submitting && (
          <p className="mt-3 flex items-center gap-1.5 font-sans text-[12px] text-ink-muted" aria-live="polite">
            <Loader2 size={11} className="animate-spin shrink-0" aria-hidden />
            {researchPhase} This is real research, not a placeholder — it can take up to a couple of minutes.
          </p>
        )}

        {result && (
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            {result.added.length > 0 && (
              <div>
                <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Added
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.added.map((id) => (
                    <span
                      key={id}
                      className="flex items-center gap-1 rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2.5 py-1 font-sans text-[11px] text-emerald-800"
                    >
                      <Check size={11} aria-hidden /> {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.skipped_existing.length > 0 && (
              <div>
                <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Already existed
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.skipped_existing.map((id) => (
                    <span
                      key={id}
                      className="rounded-full border border-line bg-paper-raised px-2.5 py-1 font-sans text-[11px] text-ink-muted"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </form>

      <div className="mt-6 rounded-2xl bg-paper p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe2 size={14} className="text-ink-muted" aria-hidden />
            <p className="font-display text-[13px] uppercase tracking-[0.08em] text-ink">City Library</p>
          </div>
          <span className="rounded-full bg-black/5 px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-ink-muted">
            {data?.cities.length ?? (isLoading ? "…" : 0)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {data?.cities.map((city) => {
            const location = [city.country, city.region].filter(Boolean).join(" · ");
            return (
              <div
                key={city.city_id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.025]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin size={12} className="shrink-0 text-ink-muted/60" aria-hidden />
                  <span className="truncate font-sans text-[13px] text-ink">{city.city_name}</span>
                </span>
                {location && (
                  <span className="truncate font-sans text-[11px] text-ink-muted">{location}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
