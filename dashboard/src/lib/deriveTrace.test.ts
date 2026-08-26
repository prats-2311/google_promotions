import { describe, expect, it } from "vitest";
import { deriveTrace } from "./deriveTrace";
import type { CityDetail } from "./types";

function baseDetail(overrides: Partial<CityDetail> = {}): CityDetail {
  return {
    campaign: {
      campaign_id: "c1", title: "Nova Horizon", campaign_type: "music_world_tour",
      genre: "pop", talent_roster: ["Artist X"], status: "active", selected_metrics: [],
    },
    stop: { city_id: "mumbai", city_name: "Mumbai", stop_date: "2026-09-01", sequence_order: 1, event_format: "arena" },
    cultureNotes: {
      city_id: "mumbai", etiquette_notes: "be warm", greeting_style: "Namaste",
      media_behavior_notes: "x", fan_interaction_style: "y", dos: ["a"], donts: ["b", "c"], humor_boundaries: "z",
    },
    localDelight: {
      city_id: "mumbai", local_phrases: [{ phrase: "Namaste", phonetic: "n", meaning: "hello", usage_context: "opener" }],
      cultural_references: ["Bollywood"], beloved_icons: [{ name: "actor", domain: "film", reference_note: "note" }],
      crowd_moment_suggestions: [], music_or_remix_ideas: [],
    },
    fanSignal: null,
    brief: null,
    demographicSnapshot: null,
    ...overrides,
  };
}

describe("deriveTrace", () => {
  it("always includes the Culture Intelligence steps", () => {
    const steps = deriveTrace(baseDetail());
    const labels = steps.map((s) => s.label);
    expect(labels).toContain("getCultureNotes");
    expect(labels).toContain("Culture Intelligence Agent");
  });

  it("reports the real donts count, not a placeholder", () => {
    const steps = deriveTrace(baseDetail());
    const cultureStep = steps.find((s) => s.label === "getCultureNotes");
    expect(cultureStep?.detail).toContain("2 don't rules");
  });

  it("omits Fan Enthusiasm steps entirely when fanSignal is null", () => {
    const steps = deriveTrace(baseDetail({ fanSignal: null }));
    expect(steps.some((s) => s.label.includes("Fan Enthusiasm"))).toBe(false);
  });

  it("includes Fan Enthusiasm steps when fanSignal is present", () => {
    const steps = deriveTrace(baseDetail({
      fanSignal: {
        city_id: "mumbai", genre: "pop", artist_type: "musician", enthusiasm_score: 91,
        fan_behavior_style: "loud", city_importance_tier: "Tier 1", genre_affinity_notes: "n", signal_basis: "historical data",
      },
    }));
    const labels = steps.map((s) => s.label);
    expect(labels).toContain("Fan Enthusiasm Agent");
    expect(steps.find((s) => s.label === "getFanSignals + scoreEnthusiasm")?.detail).toContain("Tier 1");
  });

  it("omits Talent Prep / grounding-check / insert steps when brief is null", () => {
    const steps = deriveTrace(baseDetail({ brief: null }));
    const labels = steps.map((s) => s.label);
    expect(labels).not.toContain("checkGrounding");
    expect(labels).not.toContain("insertCityBrief");
  });

  it("includes grounding-check and insert steps once a brief exists", () => {
    const steps = deriveTrace(baseDetail({
      brief: {
        brief_id: "b1", campaign_id: "c1", city_id: "mumbai", generated_at: "2026-07-28T00:00:00Z",
        status: "final", enthusiasm_score: 91, culture_summary: "s", local_delight_summary: "d",
        talent_brief_json: "{}", grounding_check_passed: true, grounding_check_notes: "all clear",
        delight_card_url: "https://x/card.html", demographic_snapshot_json: null,
      },
    }));
    const labels = steps.map((s) => s.label);
    expect(labels).toContain("checkGrounding");
    expect(labels).toContain("insertCityBrief");
    expect(labels).toContain("renderDelightCard");
    expect(steps.find((s) => s.label === "Grounding check passed")).toBeTruthy();
  });

  it("labels a failed grounding check as flagged, not passed", () => {
    const steps = deriveTrace(baseDetail({
      brief: {
        brief_id: "b1", campaign_id: "c1", city_id: "mumbai", generated_at: null,
        status: "needs_review", enthusiasm_score: 91, culture_summary: "s", local_delight_summary: "d",
        talent_brief_json: "{}", grounding_check_passed: false, grounding_check_notes: "issue found",
        delight_card_url: null, demographic_snapshot_json: null,
      },
    }));
    expect(steps.find((s) => s.label === "Grounding check flagged an issue")).toBeTruthy();
    expect(steps.some((s) => s.label === "renderDelightCard")).toBe(false);
  });

  it("real brief_id is embedded in the insert step detail, not a placeholder", () => {
    const steps = deriveTrace(baseDetail({
      brief: {
        brief_id: "nova_horizon_2026-mumbai-live-001", campaign_id: "c1", city_id: "mumbai",
        generated_at: null, status: "final", enthusiasm_score: 91, culture_summary: "s",
        local_delight_summary: "d", talent_brief_json: "{}", grounding_check_passed: true,
        grounding_check_notes: "ok", delight_card_url: null, demographic_snapshot_json: null,
      },
    }));
    const insertStep = steps.find((s) => s.label === "insertCityBrief");
    expect(insertStep?.detail).toContain("nova_horizon_2026-mumbai-live-001");
  });
});
