import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "positive" | "negative" | "info" | "warning";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-sunken text-ink-secondary",
  positive: "border-emerald-200 bg-positive-soft text-positive",
  negative: "border-red-200 bg-negative-soft text-negative",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small filled dot, used to key a status or a chart series. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
