import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/source-tag";
import { Badge } from "@/components/ui/badge";
import type { CostSource } from "@/lib/business-costs/types";
import { cn } from "@/lib/cn";

/** One configurable cost area, with its current provenance on the header. */
export function CostSection({
  title,
  description,
  source,
  total,
  children,
}: {
  title: string;
  description: string;
  source: CostSource;
  /** Formatted contribution for the selected range. */
  total?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <SourceLabel source={source} />
          </span>
        }
        description={description}
        actions={
          total ? (
            <span className="tabular text-[12.5px] text-ink-secondary">{total} in range</span>
          ) : null
        }
      />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function SourceLabel({ source }: { source: CostSource }) {
  if (source === "incomplete") return <Badge tone="negative">Missing cost mapping</Badge>;
  if (source === "live") return <SourceTag source="live" />;
  if (source === "manual_real") return <SourceTag source="manual-real" />;
  if (source === "manual") return <SourceTag source="manual" />;
  if (source === "not_configured") return <SourceTag source="not-configured" />;
  return <SourceTag source="mock" />;
}

/** Compact form row used across every add-form on the page. */
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-8 w-full rounded-[5px] border border-line bg-surface px-2 text-[12.5px] text-ink tabular placeholder:text-ink-muted";

export const submitClass =
  "h-8 rounded-[5px] bg-ink px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90";

export function RemoveButton() {
  return (
    <button
      type="submit"
      className="rounded-[4px] border border-line px-2 py-0.5 text-[11px] text-ink-secondary transition-colors hover:border-red-200 hover:bg-negative-soft hover:text-negative"
    >
      Remove
    </button>
  );
}
