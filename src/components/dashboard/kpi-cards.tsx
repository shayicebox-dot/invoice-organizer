import type { ReactNode } from "react";

import { Delta } from "@/components/ui/delta";
import { cn } from "@/lib/cn";

/**
 * Standard stat tile: label, value, delta. Values use proportional figures —
 * `tabular` is reserved for columns that have to line up.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaCaption,
  higherIsBetter = true,
  deltaUnit = "percent",
  footnote,
}: {
  label: string;
  value: string;
  delta: number | null;
  deltaCaption?: string;
  higherIsBetter?: boolean;
  deltaUnit?: "percent" | "points";
  footnote?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[12px] font-medium text-ink-muted">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em] text-ink">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Delta
          value={delta}
          caption={deltaCaption}
          higherIsBetter={higherIsBetter}
          unit={deltaUnit}
        />
      </div>
      {footnote ? <p className="mt-2 text-[11.5px] text-ink-muted">{footnote}</p> : null}
    </div>
  );
}

/**
 * The one number the product exists for. Exactly one hero figure per view.
 */
export function NetProfitTile({
  value,
  isLoss,
  delta,
  deltaCaption,
  marginLabel,
  contributionLabel,
  className,
}: {
  value: string;
  isLoss: boolean;
  delta: number | null;
  deltaCaption?: string;
  marginLabel: string;
  contributionLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,16,18,0.04)]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          Net Profit
        </span>
        <span className="rounded-full border border-line bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-ink-muted">
          Operating
        </span>
      </div>

      <p
        className={cn(
          "mt-3 text-[48px] font-semibold leading-none tracking-[-0.02em]",
          isLoss ? "text-negative" : "text-ink",
        )}
      >
        {value}
      </p>

      <div className="mt-3">
        <Delta value={delta} caption={deltaCaption} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 border-t border-line pt-3 text-[12px]">
        <div>
          <dt className="text-ink-muted">Net margin</dt>
          <dd className="tabular mt-0.5 font-medium text-ink">{marginLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Contribution profit</dt>
          <dd className="tabular mt-0.5 font-medium text-ink">{contributionLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
