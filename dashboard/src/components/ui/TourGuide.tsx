import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { TOUR_STEPS, findValidIndex, type TourStep } from "../../lib/tourSteps";

const SEEN_KEY = "tourSeenV1";
const PAD = 8;
const CARD_WIDTH = 300;

export function hasSeenTour(): boolean {
  return localStorage.getItem(SEEN_KEY) === "1";
}

export function TourGuide({ active, onClose }: { active: boolean; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const reduceMotion = useReducedMotion();

  const step = TOUR_STEPS[stepIndex];

  const finish = useCallback(() => {
    localStorage.setItem(SEEN_KEY, "1");
    setStepIndex(0);
    onClose();
  }, [onClose]);

  // Purely presentational -- just keeps `rect` in sync with the current
  // step's target (and with layout changes while it's showing). Skip
  // decisions are resolved synchronously in next()/back() below, against
  // live DOM state at click time, never through a reactive effect: an
  // effect-driven "detect missing, then skip" approach is inherently one
  // render behind (the freshly-skipped-to step's own found/missing state
  // isn't knowable until *another* render/effect pass), which caused a real
  // bug here -- skipping past a missing "Generate Briefs" target could also
  // wrongly skip the next, perfectly valid step right behind it, because the
  // skip-effect re-ran on the stale "missing" value carried over from the
  // step it had just skipped, one render before its own fresh measurement
  // had landed.
  useEffect(() => {
    if (!active) return;
    function measure() {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  if (!active) return null;

  function targetExists(target: string) {
    return !!document.querySelector(`[data-tour="${target}"]`);
  }
  function next() {
    const found = findValidIndex(TOUR_STEPS, stepIndex + 1, 1, targetExists);
    if (found === null) finish();
    else setStepIndex(found);
  }
  function back() {
    const found = findValidIndex(TOUR_STEPS, stepIndex - 1, -1, targetExists);
    if (found !== null) setStepIndex(found);
  }

  const cardPos = computeCardPosition(step, rect);

  return (
    <AnimatePresence>
      <Bands rect={step.target ? rect : null} onSkip={finish} />
      {rect && (
        <div
          className="pointer-events-none fixed z-[101] rounded-lg border-2 border-gold"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}
      <motion.div
        key={step.id}
        initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        className="fixed z-[102] rounded-2xl bg-paper p-5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
        style={{ width: CARD_WIDTH, ...cardPos }}
      >
        <button
          onClick={finish}
          aria-label="Skip tour"
          className="absolute right-3 top-3 text-ink-muted hover:text-ink"
        >
          <X size={14} />
        </button>
        <p className="pr-4 font-display text-[16px] text-ink">{step.title}</p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === stepIndex ? "var(--color-gold)" : "rgba(20,21,26,0.15)" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 font-sans text-[12px]">
            {stepIndex > 0 && (
              <button onClick={back} className="text-ink-muted hover:text-ink">
                Back
              </button>
            )}
            <button onClick={next} className="rounded-md bg-gold px-3 py-1.5 font-semibold text-ink hover:opacity-90">
              {stepIndex >= TOUR_STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function computeCardPosition(step: TourStep, rect: DOMRect | null): { top?: number; left?: number; bottom?: number; right?: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect || step.placement === "center") {
    return { top: vh / 2 - 90, left: vw / 2 - CARD_WIDTH / 2 };
  }
  if (step.pinBottomRight) {
    return { bottom: 24, right: 24 };
  }
  let top = rect.top;
  let left = rect.right + 16;
  if (step.placement === "left") left = rect.left - CARD_WIDTH - 16;
  if (step.placement === "bottom") {
    top = rect.bottom + 16;
    left = rect.left;
  }
  if (step.placement === "top") {
    top = rect.top - 16 - 140;
    left = rect.left;
  }
  left = Math.min(Math.max(left, 16), vw - CARD_WIDTH - 16);
  top = Math.min(Math.max(top, 16), vh - 180);
  return { top, left };
}

function Bands({ rect, onSkip }: { rect: DOMRect | null; onSkip: () => void }) {
  const scrim = "rgba(11,12,16,0.72)";
  if (!rect) {
    return <div className="fixed inset-0 z-[100]" style={{ backgroundColor: scrim }} onClick={onSkip} />;
  }
  const top = Math.max(rect.top - PAD, 0);
  const bottom = rect.bottom + PAD;
  const left = Math.max(rect.left - PAD, 0);
  const right = rect.right + PAD;
  return (
    <>
      <div className="fixed z-[100]" style={{ top: 0, left: 0, right: 0, height: top, backgroundColor: scrim }} onClick={onSkip} />
      <div className="fixed z-[100]" style={{ top: bottom, left: 0, right: 0, bottom: 0, backgroundColor: scrim }} onClick={onSkip} />
      <div className="fixed z-[100]" style={{ top, left: 0, width: left, height: bottom - top, backgroundColor: scrim }} onClick={onSkip} />
      <div className="fixed z-[100]" style={{ top, left: right, right: 0, height: bottom - top, backgroundColor: scrim }} onClick={onSkip} />
    </>
  );
}
