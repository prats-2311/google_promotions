import { motion, useReducedMotion } from "framer-motion";

// Enthusiasm meter: the fill sweeps in on mount (springy, honest about the
// 0-100 scale) and runs a light-to-full gradient of the city's accent so the
// bar reads as lit neon rather than a flat block.
export function StatMeter({ value, accent }: { value: number; accent: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${accent} 55%, white) 0%, ${accent} 100%)`,
            boxShadow: `0 0 8px color-mix(in srgb, ${accent} 45%, transparent)`,
          }}
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="font-sans text-[13px] font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
