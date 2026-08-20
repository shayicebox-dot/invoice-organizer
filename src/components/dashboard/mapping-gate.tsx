import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TableFrame, Td, Th } from "@/components/ui/table";
import { formatDateShort } from "@/lib/date-range";
import { formatNumber } from "@/lib/money";
import type { BusinessCostStatus, Completeness } from "@/lib/data";

/**
 * The block that says why there is no profit figure.
 *
 * Profit is the bottom of a subtraction, so it inherits every gap above it: an
 * order that was never loaded, a line with no cost, an ad platform that came
 * back short. The arithmetic still balances in every one of those cases — it is
 * simply wrong in the flattering direction, which is the kind of wrong that
 * gets believed. So the profit rows are withheld, and each gap is named with
 * the work that closes it.
 */
export function MappingGate({
  costs,
  completeness,
}: {
  costs: BusinessCostStatus;
  completeness: Completeness;
}) {
  if (completeness.complete) return null;

  const rows = costs.unmapped;
  const limit = costs.historyLimit;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">P&amp;L Incomplete</Badge>
        <h2 className="text-[13.5px] font-semibold text-ink">
          Net profit is not calculated for this period
        </h2>
      </div>

      <ul className="mt-2 max-w-3xl space-y-1.5 text-[12.5px] leading-5 text-ink-secondary">
        {completeness.reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span aria-hidden className="mt-px text-amber-700">
              •
            </span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {limit ? (
        <p className="mt-2 max-w-3xl text-[12.5px] leading-5 text-ink-muted">
          Request the <code className="font-mono text-[11.5px]">read_all_orders</code> scope from
          Shopify to report on more than the last 60 days.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="mt-3">
            <TableFrame>
              <thead>
                <tr>
                  <Th>Unmapped product</Th>
                  <Th>SKU</Th>
                  <Th align="right">Line items</Th>
                  <Th align="right">Packs</Th>
                  <Th>First seen</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <Td className="pr-4 font-medium">
                      {[row.title, row.variantTitle].filter(Boolean).join(" · ") ||
                        row.lineName ||
                        "(unnamed line item)"}
                    </Td>
                    <Td className="pr-4 font-mono text-[11.5px] text-ink-secondary">
                      {row.sku ?? "—"}
                    </Td>
                    <Td align="right" numeric>
                      {formatNumber(row.lineItems)}
                    </Td>
                    <Td align="right" numeric>
                      {formatNumber(row.quantity)}
                    </Td>
                    <Td className="pr-4 text-ink-secondary">{formatDateShort(row.firstSeen)}</Td>
                    <Td className="pr-4 text-ink-secondary">{formatDateShort(row.lastSeen)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </div>

          <Link
            href="/historical-mapping"
            className="mt-3 inline-flex items-center rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-muted"
          >
            Assign in Historical Product Mapping →
          </Link>
        </>
      ) : null}
    </section>
  );
}
