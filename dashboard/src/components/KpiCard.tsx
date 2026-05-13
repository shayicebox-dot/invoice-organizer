import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function KpiCard({
  label,
  value,
  delta,
  hint,
  accent,
}: {
  label: string;
  value: string;
  delta?: number; // -0.12 = -12%
  hint?: string;
  accent?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={clsx("card card-h p-4", accent && "ring-1 ring-accent/30")}>
      <div className="text-xs uppercase tracking-wider text-ink-dim">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {delta !== undefined && (
          <div
            className={clsx(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              up ? "bg-accent-soft text-accent" : "bg-red-950/40 text-danger",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta * 100).toFixed(1)}%
          </div>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}
