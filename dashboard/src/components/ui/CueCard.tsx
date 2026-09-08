import type { ReactNode } from "react";

// The shared "paper" surface primitive -- every card in this app is meant to
// read as a physical production cue card, not a generic rounded SaaS box.
// Two things make that real instead of just named in a comment:
// 1. The top rail is punched like 16mm filmstrip perforation (radial-gradient
//    holes cut out of the accent color), not a flat color bar.
// 2. `meta` renders in JetBrains Mono, tabular -- a call-sheet's typewritten
//    stamp field, not a UI label. Reserved for that one job; body copy always
//    stays in Inter.
export function CueCard({
  accent,
  meta,
  title,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  accent: string;
  meta?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/[0.06] bg-paper shadow-[0_1px_2px_rgba(0,0,0,0.3),0_16px_32px_-16px_rgba(0,0,0,0.5)] ${className}`}>
      <div
        aria-hidden
        className="h-2.5"
        style={{
          backgroundColor: accent,
          backgroundImage: "radial-gradient(circle, var(--color-paper) 2.75px, transparent 3.25px)",
          backgroundSize: "14px 100%",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "7px center",
        }}
      />
      <div className={bodyClassName}>
        {meta && (
          <p className="mb-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted tabular-nums">
            {meta}
          </p>
        )}
        {title}
        {children}
      </div>
    </div>
  );
}
