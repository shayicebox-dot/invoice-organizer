import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TableFrame, Td, Th } from "@/components/ui/table";
import { formatDateShort } from "@/lib/date-range";
import { formatNumber } from "@/lib/money";
import type { BusinessCostStatus } from "@/lib/data";

/**
 * The block that says why there is no profit figure.
 *
 * It appears only when an order line in the period has no pack assignment. The
 * arithmetic could produce a number regardless — it would just be a number that
 * understates cost and overstates profit, which is the failure this whole
 * mapping layer exists to prevent. So the profit rows are withheld and the
 * lines responsible are named, with a link to the page that fixes them.
 */
export function MappingGate({ costs }: { costs: BusinessCostStatus }) {
  if (costs.mappingComplete) return null;

  const rows = costs.unmapped;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">P&amp;L Incomplete</Badge>
        <h2 className="text-[13.5px] font-semibold text-ink">
          Net profit is not calculated for this period
        </h2>
      </div>

      <p className="mt-2 max-w-3xl text-[12.5px] leading-5 text-ink-secondary">
        {rows.length > 0 ? (
          <>
            {formatNumber(costs.unmappedLineItems)} order line
            {costs.unmappedLineItems === 1 ? "" : "s"} covering{" "}
            {formatNumber(costs.unmappedQuantity)} pack
            {costs.unmappedQuantity === 1 ? "" : "s"} could not be resolved to a 10, 20 or 50 pack,
            so no operational cost was applied to them. Every profit and margin figure is withheld
            until each one is assigned.
          </>
        ) : (
          <>
            {costs.lineItemError ??
              "Shopify line items could not be read for this period, so packs cannot be identified."}{" "}
            Profit is withheld rather than calculated from partial cost data.
          </>
        )}
      </p>

      {rows.length > 0 ? (
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
      ) : null}

      <Link
        href="/historical-mapping"
        className="mt-3 inline-flex items-center rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-muted"
      >
        Assign in Historical Product Mapping →
      </Link>
    </section>
  );
}
