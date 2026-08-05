import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

// Framer Motion's height:"auto" spring animations don't reliably settle
// (confirmed: got stuck mid-transition at a fractional height/opacity and
// never completed) -- a tween is what ThinkingTrace.tsx already uses
// successfully for the same height:0->auto pattern. Keep the spring for the
// chevron rotation below, where it's just a transform, not a layout property.
const PANEL_TRANSITION = { duration: 0.25, ease: "easeInOut" } as const;

export interface AccordionItem {
  id: string;
  title: string;
  meta?: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  type?: "single" | "multiple";
  defaultOpen?: string[];
  accent?: string;
  className?: string;
}

export function Accordion({ items, type = "single", defaultOpen = [], accent, className = "" }: AccordionProps) {
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const reduceMotion = useReducedMotion();
  const baseId = useId();

  function toggle(id: string) {
    setOpen((prev) => {
      const isOpen = prev.includes(id);
      if (type === "single") return isOpen ? [] : [id];
      return isOpen ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = (index + dir + items.length) % items.length;
    (document.getElementById(`${baseId}-header-${next}`) as HTMLButtonElement | null)?.focus();
  }

  return (
    <div className={`divide-y divide-line ${className}`}>
      {items.map((item, i) => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id}>
            <button
              id={`${baseId}-header-${i}`}
              type="button"
              onClick={() => toggle(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              aria-expanded={isOpen}
              aria-controls={`${baseId}-panel-${i}`}
              className="flex w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="font-sans text-[13px] text-ink">{item.title}</span>
                {item.meta && <span className="ml-2 font-sans text-[11px] text-ink-muted">{item.meta}</span>}
              </span>
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="shrink-0"
              >
                <ChevronDown size={14} style={{ color: accent }} className={accent ? "" : "text-ink-muted"} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`${baseId}-panel-${i}`}
                  role="region"
                  aria-labelledby={`${baseId}-header-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : PANEL_TRANSITION}
                  className="overflow-hidden"
                >
                  <div className="pb-3 font-sans text-[13px] leading-relaxed text-ink-muted">{item.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
