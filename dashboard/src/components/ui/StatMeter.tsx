export function StatMeter({ value, accent }: { value: number; accent: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: accent }}
        />
      </div>
      <span className="font-sans text-[13px] font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
