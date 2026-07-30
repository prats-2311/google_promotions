import type { CityDetail, TraceStep } from "./types";

// The live pipeline's raw detectIntent conversation trace isn't persisted
// per-brief today (orchestration_driver captures it transiently, in memory,
// during a run). Rather than fabricate reasoning text, this derives an
// honest, factual step sequence from the real data each brief actually
// carries — the tools that had to run to produce it, in the order the
// architecture requires, annotated with the real values each step produced.
export function deriveTrace(detail: CityDetail): TraceStep[] {
  const { stop, cultureNotes, fanSignal, localDelight, brief } = detail;
  const steps: TraceStep[] = [];

  steps.push({
    kind: "tool",
    label: "getCultureNotes",
    detail: `Retrieved etiquette, greeting style, and ${cultureNotes.donts.length} don't rules for ${stop.city_name}.`,
  });
  steps.push({
    kind: "playbook",
    label: "Culture Intelligence Agent",
    detail: cultureNotes.etiquette_notes,
  });

  if (fanSignal) {
    steps.push({
      kind: "tool",
      label: "getFanSignals + scoreEnthusiasm",
      detail: `${fanSignal.city_importance_tier} · ${fanSignal.enthusiasm_score}/100 · ${fanSignal.fan_behavior_style}`,
    });
    steps.push({
      kind: "playbook",
      label: "Fan Enthusiasm Agent",
      detail: fanSignal.signal_basis,
    });
  }

  steps.push({
    kind: "tool",
    label: "getLocalDelight",
    detail: `${localDelight.local_phrases.length} local phrases, ${localDelight.beloved_icons.length} beloved icon reference(s).`,
  });
  steps.push({ kind: "playbook", label: "Local Delight Agent" });

  if (brief) {
    steps.push({
      kind: "playbook",
      label: "Talent Prep Agent — draft synthesis",
      detail: "Combined culture, enthusiasm, and local delight signals into a draft talent brief.",
    });
    steps.push({
      kind: "tool",
      label: "checkGrounding",
      detail: brief.grounding_check_notes ?? undefined,
    });
    steps.push({
      kind: "utterance",
      label: brief.grounding_check_passed ? "Grounding check passed" : "Grounding check flagged an issue",
    });
    if (brief.delight_card_url) {
      steps.push({ kind: "tool", label: "renderDelightCard", detail: "Rendered final card to Cloud Storage." });
    }
    steps.push({
      kind: "tool",
      label: "insertCityBrief",
      detail: `Wrote a real row to tour_intelligence.city_briefs (${brief.brief_id}).`,
    });
  }

  return steps;
}
