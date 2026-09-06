import { useRef, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2, AlertTriangle, Sparkles } from "lucide-react";

export type TraceStepStatus = "pending" | "active" | "success" | "error";

export interface TraceStepItem {
  id: string;
  title: string;
  status: TraceStepStatus;
  icon?: React.ReactNode;
  duration?: string;
  content?: React.ReactNode;
}

// Shimmer-while-working header, mirrors the Claude/Gemini "Thinking" pattern
// (see dashboard/CLAUDE.md's note on this component) -- adapted from a 21st.dev
// component (id 23592, "Thinking" by theshanelevine) onto this project's own
// design tokens rather than pasted with its own (--ink/--surface/--hover),
// since those don't exist in src/index.css's @theme block.
export function ThinkingTrace({
  title = "How this brief was generated",
  steps,
  defaultExpanded = false,
}: {
  title?: string;
  steps: TraceStepItem[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openStepIds, setOpenStepIds] = useState<Set<string>>(new Set());
  const reduceMotion = useReducedMotion();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  useLayoutEffect(() => {
    if (!expanded || !timelineRef.current) return;
    setLineHeight(timelineRef.current.offsetHeight);
  }, [expanded, openStepIds, steps]);

  const working = steps.some((s) => s.status === "active");

  function toggleStep(id: string) {
    setOpenStepIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-canvas-line bg-canvas-raised">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
      >
        <Sparkles size={15} className={working ? "text-gold" : "text-canvas-muted"} />
        {working ? (
          <span
            className="bg-clip-text font-sans text-[13px] font-medium text-transparent"
            style={{
              backgroundImage: "linear-gradient(90deg, var(--color-canvas-muted) 35%, var(--color-canvas-text) 50%, var(--color-canvas-muted) 65%)",
              backgroundSize: "200% 100%",
              animation: reduceMotion ? undefined : "shimmer 1.4s linear infinite",
            }}
          >
            {title}
          </span>
        ) : (
          <span className="font-sans text-[13px] font-medium text-canvas-text">{title}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="font-sans text-[11px] tabular-nums text-canvas-muted">{steps.length} steps</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
            <ChevronDown size={14} className="text-canvas-muted" />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="relative px-5 pb-5">
              <span
                aria-hidden
                className="absolute left-[26px] w-px bg-canvas-line"
                style={{ top: 4, height: Math.max(lineHeight - 8, 0) }}
              />
              <div ref={timelineRef} className="flex flex-col">
                {steps.map((step) => {
                  const isOpen = openStepIds.has(step.id);
                  return (
                    <div key={step.id} className="relative flex gap-3 py-1.5">
                      <span
                        className={`relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-4 ring-canvas-raised ${
                          step.status === "success"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : step.status === "active"
                              ? "bg-gold/15 text-gold"
                              : step.status === "error"
                                ? "bg-rose-500/15 text-rose-400"
                                : "bg-canvas text-canvas-muted"
                        }`}
                      >
                        {step.status === "success" ? (
                          <Check size={12} />
                        ) : step.status === "active" ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : step.status === "error" ? (
                          <AlertTriangle size={12} />
                        ) : (
                          step.icon ?? <span className="size-1.5 rounded-full bg-current" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 pb-1">
                        <button
                          type="button"
                          disabled={!step.content}
                          onClick={() => toggleStep(step.id)}
                          className={`flex w-full items-center gap-2 rounded-md text-left ${step.content ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <span className="font-sans text-[13px] text-canvas-text/90">{step.title}</span>
                          {step.duration && (
                            <span className="font-sans text-[11px] tabular-nums text-canvas-muted">{step.duration}</span>
                          )}
                          {step.content && (
                            <ChevronDown
                              size={12}
                              className={`ml-auto shrink-0 text-canvas-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          )}
                        </button>
                        {step.content && isOpen && (
                          <div className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-canvas-muted">{step.content}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
