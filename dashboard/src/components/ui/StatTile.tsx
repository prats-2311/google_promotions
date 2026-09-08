import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Campaign-level KPI tile for the summary strips -- the "call-sheet header"
// the dashboard was missing. Lives on the canvas (not on a card), so it
// reads as chrome/context, not as one of the content cards. Surface is a
// faint top-lit gradient with a hairline border (Premiere Noir layering);
// any accent stays a thin top edge that never fights the number. Tiles
// spring up on mount -- pass `delay` to stagger a row.
export function StatTile({
  label,
  value,
  hint,
  accent,
  icon,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  icon?: ReactNode;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
      className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.055] to-white/[0.015] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            backgroundImage: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 30%, transparent))`,
          }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-canvas-muted">
          {label}
        </p>
        {icon && <span className="shrink-0 text-canvas-muted" aria-hidden>{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[26px] leading-none tracking-tight text-canvas-text tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 font-sans text-[11.5px] leading-tight text-canvas-muted">{hint}</p>
      )}
    </motion.div>
  );
}
