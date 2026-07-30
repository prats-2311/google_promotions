import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, ChevronDown, Wrench, GitBranch, MessageCircle } from "lucide-react";
import type { TraceStep } from "../lib/types";

const ICON_BY_KIND = {
  tool: Wrench,
  playbook: GitBranch,
  utterance: MessageCircle,
} as const;

export function ThinkingTrace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-line bg-canvas-raised">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <BrainCircuit size={16} className="text-gold shrink-0" />
        <span className="flex-1 font-sans text-[13px] font-medium text-canvas-text">
          How this brief was generated
        </span>
        <span className="font-sans text-[11px] text-canvas-muted">{steps.length} steps</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={15} className="text-canvas-muted" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <ol className="space-y-3 border-t border-canvas-line px-4 py-4">
              {steps.map((step, i) => {
                const Icon = ICON_BY_KIND[step.kind];
                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex gap-3"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-canvas-muted">
                      <Icon size={12} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] text-canvas-text">{step.label}</p>
                      {step.detail && (
                        <p className="mt-0.5 font-sans text-[12px] leading-relaxed text-canvas-muted">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
