import { motion } from "framer-motion";

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

// Animated-underline tabs, shared layoutId so the indicator slides between
// tabs rather than jumping -- previously inline in CityDetail.tsx, pulled
// out once it became clear the same pattern deserved to be a real component
// instead of one-off JSX.
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  accent,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  accent: string;
}) {
  return (
    <div className="flex gap-1 border-b border-canvas-line" role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`relative rounded-t-md px-4 py-2.5 font-sans text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${
              active ? "text-canvas-text" : "text-canvas-muted hover:text-canvas-text"
            }`}
          >
            {item.label}
            {active && (
              <motion.div layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5" style={{ backgroundColor: accent }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
