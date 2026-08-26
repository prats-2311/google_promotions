export interface TourStep {
  id: string;
  target: string | null;
  title: string;
  body: string;
  placement: "center" | "top" | "bottom" | "left" | "right";
  pinBottomRight?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "intro",
    target: null,
    placement: "center",
    title: "Welcome to Tour Intelligence",
    body: "A multi-agent system that generates city-specific culture intelligence, fan-enthusiasm scoring, and localization guidance for entertainment tours. Here's a 30-second look around.",
  },
  {
    id: "switcher",
    target: "campaign-switcher",
    placement: "right",
    title: "Your campaigns",
    body: "Switch between tours here, or start a brand new one.",
  },
  {
    id: "grid",
    target: "city-grid",
    placement: "bottom",
    pinBottomRight: true,
    title: "Every stop, at a glance",
    body: "Each card is a tour stop. Click any city to see its culture intelligence, delight card, and talent brief.",
  },
  {
    id: "generate",
    target: "generate-briefs",
    placement: "bottom",
    title: "Bring a city to life",
    body: "New stops start Pending. One click here runs the real multi-agent pipeline — Culture Intelligence, Fan Enthusiasm, Local Delight, and Talent Prep — live.",
  },
  {
    id: "compare",
    target: "compare-cities-nav",
    placement: "right",
    title: "Compare & rank",
    body: "See every stop ranked by strategic importance and fan enthusiasm, side by side.",
  },
];

export function isStepValid(step: TourStep, exists: (target: string) => boolean): boolean {
  return !step.target || exists(step.target);
}

export function findValidIndex(
  steps: TourStep[],
  from: number,
  dir: 1 | -1,
  exists: (target: string) => boolean
): number | null {
  for (let i = from; i >= 0 && i < steps.length; i += dir) {
    if (isStepValid(steps[i], exists)) return i;
  }
  return null;
}
