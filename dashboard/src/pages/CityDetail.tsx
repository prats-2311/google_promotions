import { useState } from "react";
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
} from "lucide-react";
import { StatMeter } from "../components/ui/StatMeter";
import { getCityDetail } from "../lib/api";
import type { CityDetail as CityDetailData, TalentBrief, TraceStep } from "../lib/types";
import { cityAccent, cityAccentOnPaper } from "../lib/cityTheme";
import { AgentPlanning, type PlanStep } from "../components/ui/agent-planning";
import { deriveTrace } from "../lib/deriveTrace";
import { useCampaignContext } from "../lib/campaignContext";
import { CityDetailSkeleton } from "../components/ui/Skeletons";
import { Accordion } from "../components/ui/Accordion";

const TRACE_ICON_BY_KIND: Record<TraceStep["kind"], React.ReactNode> = {
  tool: <Wrench className="w-3.5 h-3.5" />,
  playbook: <GitBranch className="w-3.5 h-3.5" />,
  utterance: <MessageCircle className="w-3.5 h-3.5" />,
};

function toPlanSteps(steps: TraceStep[]): PlanStep[] {
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
          <AgentPlanning title="How this brief was generated" steps={toPlanSteps(deriveTrace(data))} defaultExpanded={false} />
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-canvas-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2.5 font-sans text-[13px] transition-colors ${
              tab === t ? "text-canvas-text" : "text-canvas-muted hover:text-canvas-text"
            }`}
          >
            {TAB_LABEL[t]}
            {tab === t && (
              <motion.div layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5" style={{ backgroundColor: accent }} />
            )}
          </button>
        ))}
      </div>

      {tab === "intelligence" && <IntelligenceTab data={data} accent={accentPaper} />}
      {tab === "delight" && <DelightTab data={data} accent={accentPaper} />}
      {tab === "brief" && <BriefTab brief={brief} accent={accentPaper} cardUrl={data.brief?.delight_card_url ?? null} />}
    </motion.div>
  );
}

function IntelligenceTab({ data, accent }: { data: CityDetailData; accent: string }) {
  const { cultureNotes, demographicSnapshot } = data;
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

function DelightTab({ data, accent }: { data: CityDetailData; accent: string }) {
  const { localDelight, brief } = data;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3 rounded-2xl bg-paper overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: accent }} />
        <div className="p-6">
          <SectionLabel icon={Sparkles} accent={accent} label="Local Language Moment" />
          <div className="mt-3 space-y-3">
            {localDelight.local_phrases.map((p, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="font-display text-[16px] text-ink">{p.phrase}</span>
                <span className="text-right font-sans text-[12px] italic text-ink-muted">{p.meaning}</span>
              </div>
            ))}
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
        </div>
      </div>

      <div className="lg:col-span-2 space-y-5">
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
      <div className="rounded-2xl bg-paper p-6">
        <SectionLabel icon={MessageCircleQuestion} accent={accent} label="Likely Fan Questions" />
        <ul className="mt-2 space-y-2">
          {brief.high_probability_fan_questions.map((q, i) => (
            <li key={i} className="font-sans text-[13px] text-ink">{q}</li>
          ))}
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
