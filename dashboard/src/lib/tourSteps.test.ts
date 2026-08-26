import { describe, expect, it } from "vitest";
import { TOUR_STEPS, findValidIndex, isStepValid } from "./tourSteps";

const ALL_PRESENT = () => true;
const NONE_PRESENT = () => false;

function exceptTargets(missing: string[]) {
  return (target: string) => !missing.includes(target);
}

describe("isStepValid", () => {
  it("center steps (no target) are always valid", () => {
    expect(isStepValid(TOUR_STEPS[0], NONE_PRESENT)).toBe(true);
  });

  it("targeted steps are valid only when their target exists", () => {
    const step = TOUR_STEPS.find((s) => s.target === "campaign-switcher")!;
    expect(isStepValid(step, ALL_PRESENT)).toBe(true);
    expect(isStepValid(step, NONE_PRESENT)).toBe(false);
  });
});

describe("findValidIndex", () => {
  it("returns the starting index unchanged when everything is present", () => {
    expect(findValidIndex(TOUR_STEPS, 2, 1, ALL_PRESENT)).toBe(2);
  });

  it("skips a single missing target and lands on the next valid one", () => {
    // Reproduces the real Nova Horizon scenario: every stop already final,
    // so "generate-briefs" never renders, but "compare-cities-nav" (the
    // step right after it) always exists in the sidebar.
    const exists = exceptTargets(["generate-briefs"]);
    const generateIndex = TOUR_STEPS.findIndex((s) => s.id === "generate");
    const compareIndex = TOUR_STEPS.findIndex((s) => s.id === "compare");
    expect(findValidIndex(TOUR_STEPS, generateIndex, 1, exists)).toBe(compareIndex);
  });

  it("skips multiple consecutive missing targets", () => {
    const exists = exceptTargets(["generate-briefs", "compare-cities-nav"]);
    const generateIndex = TOUR_STEPS.findIndex((s) => s.id === "generate");
    expect(findValidIndex(TOUR_STEPS, generateIndex, 1, exists)).toBe(null);
  });

  it("returns null when walking forward past the last step", () => {
    expect(findValidIndex(TOUR_STEPS, TOUR_STEPS.length, 1, ALL_PRESENT)).toBe(null);
  });

  it("walks backward correctly too, skipping missing targets", () => {
    const exists = exceptTargets(["generate-briefs"]);
    const generateIndex = TOUR_STEPS.findIndex((s) => s.id === "generate");
    const gridIndex = TOUR_STEPS.findIndex((s) => s.id === "grid");
    expect(findValidIndex(TOUR_STEPS, generateIndex, -1, exists)).toBe(gridIndex);
  });

  it("returns null when walking backward past the first step", () => {
    expect(findValidIndex(TOUR_STEPS, -1, -1, ALL_PRESENT)).toBe(null);
  });
});
