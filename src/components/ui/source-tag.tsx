/**
 * Marks where a number came from.
 *
 * While the dashboard mixes real Shopify revenue with mock costs, every figure
 * on screen has to say which it is. The tag is deliberately plain — it labels
 * data, it is not a status indicator competing with the KPIs.
 */
import { cn } from "@/lib/cn";

export type DataSource = "live" | "mock" | "blend";

export function SourceTag({
  source,
  label,
  className,
}: {
  source: DataSource;
  /** Overrides the default text, e.g. the shop name on a live figure. */
  label?: string;
  className?: string;
}) {
  const isLive = source === "live";
  const isBlend = source === "blend";

  return (
    <span
      title={
        isBlend ? "Derived from live Shopify revenue and mock costs" : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.04em]",
        isLive && "border-emerald-200 bg-positive-soft text-positive",
        isBlend && "border-amber-200 bg-amber-50 text-amber-700",
        source === "mock" && "border-line bg-surface-sunken text-ink-muted",
        className,
      )}
    >
      {isLive ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-positive" /> : null}
      {label ?? (isLive ? "Live" : isBlend ? "Mixed" : "Mock")}
    </span>
  );
}
