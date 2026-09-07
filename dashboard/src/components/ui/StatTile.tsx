import type { ReactNode } from "react";

// Campaign-level KPI tile for the dashboard's summary strip -- the
// "call-sheet header" the dashboard was missing. Lives on the dark canvas
// (not paper), so it reads as chrome/context, not as one of the city cards.
// Follows the dataviz stat-tile rules: a big tabular number carries the
// value, a mono uppercase label names it, and any accent is a thin edge, not
// a fill fighting the number for attention.
export function StatTile({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-canvas-line bg-canvas-raised/70 px-4 py-3.5">
      {accent && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ backgroundColor: accent }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-canvas-muted">
          {label}
        </p>
        {icon && <span className="shrink-0 text-canvas-muted">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[26px] leading-none tracking-tight text-canvas-text tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 font-sans text-[11.5px] leading-tight text-canvas-muted">{hint}</p>
      )}
    </div>
  );
}
