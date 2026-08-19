import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Period-over-period change. `higherIsBetter` is false for cost metrics, where
 * an increase is bad news and should read red.
 */
export function Delta({
  value,
  caption,
  higherIsBetter = true,
  unit = "percent",
  className,
}: {
  value: number | null;
  caption?: string;
  higherIsBetter?: boolean;
  /**
   * `percent` for a relative change, `points` when the metric is itself a
   * percentage and the difference is in percentage points.
   */
  unit?: "percent" | "points";
  className?: string;
}) {
  if (value === null) {
    return (
      <span className={cn("text-[12px] text-ink-muted", className)}>
        {caption ? `— ${caption}` : "—"}
      </span>
    );
  }

  const isUp = value > 0;
  const isFlat = Math.abs(value) < 0.0005;
  const isGood = isFlat ? null : isUp === higherIsBetter;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-medium tabular",
        isGood === null && "text-ink-muted",
        isGood === true && "text-positive",
        isGood === false && "text-negative",
        className,
      )}
    >
      <Arrow direction={isFlat ? "flat" : isUp ? "up" : "down"} />
      {unit === "points"
        ? `${(Math.abs(value) * 100).toFixed(1)} pts`
        : formatPercent(Math.abs(value), 1)}
      {caption ? <span className="font-normal text-ink-muted">{caption}</span> : null}
    </span>
  );
}

function Arrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "flat") {
    return (
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{ transform: direction === "down" ? "rotate(180deg)" : undefined }}
    >
      <path
        d="M5 8.5V2M5 2L2 5M5 2l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
