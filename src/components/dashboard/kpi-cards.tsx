import type { ReactNode } from "react";

import { Delta } from "@/components/ui/delta";
import { type DataSource, SourceTag } from "@/components/ui/source-tag";
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
  source,
}: {
  label: string;
  value: string;
  delta: number | null;
  deltaCaption?: string;
  higherIsBetter?: boolean;
  deltaUnit?: "percent" | "points";
  footnote?: ReactNode;
  /** Omit to leave the tile unlabelled. */
  source?: DataSource;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-muted">{label}</p>
        {source ? <SourceTag source={source} /> : null}
      </div>
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
  note,
  withheld = false,
  className,
}: {
  value: string;
  isLoss: boolean;
  delta: number | null;
  deltaCaption?: string;
  marginLabel: string;
  contributionLabel: string;
  /**
   * True when a cost input is missing, so no profit figure is shown at all.
   * A partial cost total would make this number look better than the truth.
   */
  withheld?: boolean;
  /** Shown under the hero figure, e.g. that it blends live and mock inputs. */
  note?: ReactNode;
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
          "mt-3 font-semibold leading-none tracking-[-0.02em]",
          withheld
            ? "text-[28px] text-amber-700"
            : cn("text-[48px]", isLoss ? "text-negative" : "text-ink"),
        )}
      >
        {withheld ? "INCOMPLETE" : value}
      </p>

      <div className="mt-3">{withheld ? null : <Delta value={delta} caption={deltaCaption} />}</div>

      {note ? <p className="mt-2 text-[11px] leading-4 text-ink-muted">{note}</p> : null}

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
