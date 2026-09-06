"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Ported from a 21st.dev component (id 23530, "Accordion" by ddoemonn),
// adapted onto this project's own design tokens (paper/ink/line, no dark:
// variants -- this app has no light/dark toggle, see dashboard/CLAUDE.md)
// and this project's existing framer-motion dependency instead of adding
// the separate `motion` package the original ships with (same team, same
// API, no reason to carry both). Kept the AccordionItem/Accordion export
// names and the `accent` prop from the previous hand-rolled version so
// CityDetail.tsx's call site needed zero changes.
//
// The one thing this genuinely fixes over the previous version: animating
// to a *measured pixel height* (via ResizeObserver) rather than the string
// "auto" -- framer-motion's height:"auto" spring is the exact thing the
// previous version's own comment documented as unreliable (got stuck
// mid-transition). This measures real height instead, sidestepping the bug.

const EASE = [0.23, 1, 0.32, 1] as const;
const EXIT_EASE = [0.4, 0, 1, 1] as const;
const DISCLOSE = { type: "spring", stiffness: 480, damping: 40, mass: 0.6 } as const;
const CHEVRON = { type: "spring", stiffness: 700, damping: 46, mass: 0.5 } as const;
const NONE: readonly string[] = [];

type Inertable = HTMLElement & { inert?: boolean };

function useAutoHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = el.getBoundingClientRect().height;
      setHeight((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    read();
    setReady(true);
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, height, ready };
}

interface AccordionEntry {
  id: string;
}

interface AccordionHeaderProps {
  id: string;
  ref: (node: HTMLButtonElement | null) => void;
  type: "button";
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  "aria-expanded": boolean;
  "aria-controls": string;
}

interface AccordionPanelProps {
  id: string;
  role: "region";
  "aria-labelledby": string;
  "aria-hidden": true | undefined;
}

function useAccordion({
  items,
  type = "single",
  defaultOpen = NONE,
  collapsible = true,
}: {
  items: readonly AccordionEntry[];
  type?: "single" | "multiple";
  defaultOpen?: readonly string[];
  collapsible?: boolean;
}) {
  const base = useId();
  const [open, setOpen] = useState<string[]>(() => (type === "single" ? defaultOpen.slice(0, 1) : defaultOpen.slice()));
  const headers = useRef(new Map<string, HTMLButtonElement>());
  const binders = useRef(new Map<string, (node: HTMLButtonElement | null) => void>());

  const headerRef = useCallback((id: string) => {
    const cached = binders.current.get(id);
    if (cached) return cached;
    const bind = (node: HTMLButtonElement | null) => {
      if (node) headers.current.set(id, node);
      else headers.current.delete(id);
    };
    binders.current.set(id, bind);
    return bind;
  }, []);

  const isOpen = useCallback((id: string) => open.includes(id), [open]);

  const toggle = useCallback(
    (id: string) => {
      const active = open.includes(id);
      if (active && !collapsible && type === "single") return;
      if (type === "single") {
        setOpen(active ? [] : [id]);
        return;
      }
      setOpen(active ? open.filter((x) => x !== id) : [...open, id]);
    },
    [open, type, collapsible]
  );

  const order = useMemo(() => items.map((item) => item.id), [items]);

  const move = useCallback(
    (id: string, delta: number, edge: "first" | "last" | null) => {
      if (order.length === 0) return;
      const at = order.indexOf(id);
      if (at < 0) return;
      const next = edge === "first" ? 0 : edge === "last" ? order.length - 1 : (at + delta + order.length) % order.length;
      headers.current.get(order[next])?.focus();
    },
    [order]
  );

  const headerProps = useCallback(
    (id: string): AccordionHeaderProps => ({
      id: `${base}-header-${id}`,
      ref: headerRef(id),
      type: "button" as const,
      onClick: () => toggle(id),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(id, 1, null);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(id, -1, null);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(id, 0, "first");
        } else if (event.key === "End") {
          event.preventDefault();
          move(id, 0, "last");
        }
      },
      "aria-expanded": open.includes(id),
      "aria-controls": `${base}-panel-${id}`,
    }),
    [base, open, toggle, move, headerRef]
  );

  const panelProps = useCallback(
    (id: string): AccordionPanelProps => ({
      id: `${base}-panel-${id}`,
      role: "region" as const,
      "aria-labelledby": `${base}-header-${id}`,
      "aria-hidden": open.includes(id) ? undefined : true,
    }),
    [base, open]
  );

  return { isOpen, headerProps, panelProps };
}

export interface AccordionItem {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  meta?: React.ReactNode;
}

interface AccordionProps {
  items: readonly AccordionItem[];
  type?: "single" | "multiple";
  defaultOpen?: readonly string[];
  collapsible?: boolean;
  accent?: string;
  maxPanelHeight?: number;
  className?: string;
}

export function Accordion({
  items,
  type = "single",
  defaultOpen = NONE,
  collapsible = true,
  accent,
  maxPanelHeight = 220,
  className = "",
}: AccordionProps) {
  const reduced = useReducedMotion();
  const entries = useMemo(() => items.map(({ id }) => ({ id })), [items]);
  const { isOpen, headerProps, panelProps } = useAccordion({ items: entries, type, defaultOpen, collapsible });

  return (
    <div className={`divide-y divide-line ${className}`}>
      {items.map((item) => (
        <AccordionRow
          key={item.id}
          item={item}
          open={isOpen(item.id)}
          reduced={Boolean(reduced)}
          accent={accent}
          maxPanelHeight={maxPanelHeight}
          header={headerProps(item.id)}
          panel={panelProps(item.id)}
        />
      ))}
    </div>
  );
}

function AccordionRow({
  item,
  open,
  reduced,
  accent,
  maxPanelHeight,
  header,
  panel,
}: {
  item: AccordionItem;
  open: boolean;
  reduced: boolean;
  accent?: string;
  maxPanelHeight: number;
  header: AccordionHeaderProps;
  panel: AccordionPanelProps;
}) {
  const { ref, height, ready } = useAutoHeight();

  useEffect(() => {
    const el = ref.current as Inertable | null;
    if (!el) return;
    el.inert = !open;
    return () => {
      el.inert = false;
    };
  }, [ref, open]);

  return (
    <div>
      <div role="heading" aria-level={3}>
        <button
          {...header}
          className="-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors hover:bg-black/[0.03] focus-visible:bg-black/[0.03]"
        >
          <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-ink">{item.title}</span>
          {item.meta && <span className="shrink-0 font-sans text-[11px] tabular-nums text-ink-muted">{item.meta}</span>}
          <motion.svg
            width="14"
            height="14"
            viewBox="0 0 256 256"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
            style={{ color: accent }}
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : CHEVRON}
          >
            <path d="M208 96l-80 80-80-80" stroke="currentColor" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" className={accent ? "" : "text-ink-muted"} />
          </motion.svg>
        </button>
      </div>
      <motion.div
        initial={false}
        animate={ready ? { height: open ? height : 0 } : {}}
        transition={reduced ? { duration: 0 } : DISCLOSE}
        style={{ overflow: "hidden", height: ready ? undefined : open ? "auto" : 0 }}
      >
        <div
          {...panel}
          ref={ref}
          style={{ maxHeight: maxPanelHeight, overflowY: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable" }}
        >
          <motion.div
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : open ? { duration: 0.18, ease: EASE } : { duration: 0.14, ease: EXIT_EASE }}
            className="pb-3 font-sans text-[13px] leading-relaxed text-ink-muted"
          >
            {item.content}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default Accordion;
