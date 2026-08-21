import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/dashboard/kpi-cards";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { InfoIcon } from "@/components/ui/icons";
import { getLiveOrders, getLiveRangeReport, getStores } from "@/lib/data";
import { percentChange } from "@/lib/finance";
import { formatMoney, formatNumber } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison, formatDateShort } from "@/lib/date-range";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Orders" };

const ORDER_LIMIT = 60;

/** Shopify's own financial statuses, rendered as the merchant sees them. */
const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partly paid",
  PARTIALLY_REFUNDED: "Partly refunded",
  REFUNDED: "Refunded",
  PENDING: "Pending",
  AUTHORIZED: "Authorized",
  VOIDED: "Voided",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
};

const STATUS_TONES: Record<string, BadgeTone> = {
  PAID: "positive",
  PARTIALLY_PAID: "warning",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "negative",
  PENDING: "neutral",
  AUTHORIZED: "info",
  VOIDED: "negative",
  EXPIRED: "neutral",
  UNKNOWN: "neutral",
};

export default async function OrdersPage(props: PageProps<"/orders">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [report, orders] = await Promise.all([
    getLiveRangeReport(view.scope, view.range, view.previous),
    getLiveOrders(view.range.start, view.range.end, ORDER_LIMIT),
  ]);

  const { summary, previous } = report;
  const comparison = describeComparison(view.range);
  const storeName = orders.storeName;
  const ratePercent = (orders.variableRate * 100).toFixed(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${storeName ?? "Shopify"} · ${view.range.label}. Every row below is a real Shopify order.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Orders"
          value={formatNumber(summary.orders)}
          delta={
            previous.orders === 0
              ? null
              : (summary.orders - previous.orders) / Math.abs(previous.orders)
          }
          deltaCaption={comparison}
          source="live"
          footnote={`${formatNumber(summary.unitsSold)} units`}
        />
        <StatTile
          label="Net Revenue"
          value={formatMoney(summary.netSales, summary.currency)}
          delta={percentChange(summary.netSales, previous.netSales)}
          deltaCaption={comparison}
          source="live"
        />
        <StatTile
          label="AOV"
          value={formatMoney(summary.averageOrderValue, summary.currency)}
          delta={percentChange(summary.averageOrderValue, previous.averageOrderValue)}
          deltaCaption={comparison}
          source="live"
        />
        <StatTile
          label="Sales reversals"
          value={formatMoney(summary.salesReversals, summary.currency)}
          delta={percentChange(summary.salesReversals, previous.salesReversals)}
          deltaCaption={comparison}
          higherIsBetter={false}
          source="live"
        />
      </div>

      <Card>
        <CardHeader
          title="Recent orders"
          description={
            orders.error
              ? "Order detail could not be loaded from Shopify."
              : `The ${formatNumber(orders.rows.length)} most recent Shopify orders in this period.`
          }
          actions={<Badge tone="positive">Shopify Live</Badge>}
        />

        {orders.error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-negative-soft px-3 py-2.5 text-[12.5px] leading-5 text-negative">
            <strong className="font-semibold">Unavailable.</strong> {orders.error}
            {orders.missing.length > 0 ? ` Missing: ${orders.missing.join(", ")}.` : ""} No sample
            data is shown in its place.
          </p>
        ) : (
          <div className="mt-3">
            <TableFrame>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Date</Th>
                  <Th>Store</Th>
                  <Th>Customer</Th>
                  <Th align="right">Items</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Discount</Th>
                  <Th align="right">Refunded</Th>
                  <Th align="right">Operational cost</Th>
                  <Th align="right">Variable {ratePercent}%</Th>
                  <Th align="right">Contribution</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {orders.rows.length === 0 ? (
                  <EmptyRow colSpan={12}>No Shopify orders in this period.</EmptyRow>
                ) : (
                  orders.rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-surface-muted">
                      <Td className="pr-4 font-medium tabular">{row.orderNumber}</Td>
                      <Td className="pr-4 text-ink-secondary">{formatDateShort(row.date)}</Td>
                      <Td className="pr-4 text-ink-secondary">{storeName ?? "—"}</Td>
                      <Td
                        className={cn(
                          "pr-4",
                          row.customerName ? "text-ink-secondary" : "text-ink-muted",
                        )}
                      >
                        {row.customerName ?? "Guest customer"}
                      </Td>
                      <Td align="right" numeric className="text-ink-secondary">
                        {row.itemCount}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(row.grossSales, row.currency)}
                      </Td>
                      <Td align="right" numeric className="text-ink-secondary">
                        {row.discounts === 0 ? "—" : formatMoney(row.discounts, row.currency)}
                      </Td>
                      <Td align="right" numeric className="text-ink-secondary">
                        {row.refunded === 0 ? "—" : formatMoney(row.refunded, row.currency)}
                      </Td>
                      <Td
                        align="right"
                        numeric
                        className={cn(
                          "text-ink-secondary",
                          row.operationalCost === null && "text-amber-700",
                        )}
                      >
                        {row.operationalCost === null
                          ? "Unmapped"
                          : formatMoney(row.operationalCost, row.currency)}
                      </Td>
                      <Td align="right" numeric className="text-ink-secondary">
                        {formatMoney(row.variableCost, row.currency)}
                      </Td>
                      <Td
                        align="right"
                        numeric
                        className={cn(
                          "font-semibold",
                          row.contribution === null && "text-amber-700",
                          row.contribution !== null && row.contribution < 0 && "text-negative",
                        )}
                      >
                        {row.contribution === null
                          ? "Unavailable"
                          : formatMoney(row.contribution, row.currency)}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>
                          {row.cancelled
                            ? "Cancelled"
                            : (STATUS_LABELS[row.status] ?? row.status)}
                        </Badge>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableFrame>
          </div>
        )}

        <div className="mt-4 space-y-2 text-[11.5px] leading-5 text-ink-muted">
          <p className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 shrink-0" width={13} height={13} />
            <span>
              <strong className="font-semibold text-ink">Operational cost</strong> is the pack
              model applied to this order&rsquo;s own line items — product, shipping, storage and
              pick &amp; pack in one figure, which is how the business buys and ships. There is no
              separate shipping or payment-fee number per order: processing sits inside the{" "}
              {ratePercent}% of net revenue shown beside it. Marketing spend and fixed overhead are
              period costs and appear in the P&amp;L, not on an order.
            </span>
          </p>
          {!orders.customerNamesAvailable && !orders.error ? (
            <p>
              Customer names are protected data. Shopify releases them only to apps holding{" "}
              <code className="font-mono text-[11px]">read_customers</code> and approved for
              protected customer data, so every row reads <em>Guest customer</em> until that is
              granted. No name is ever generated.
            </p>
          ) : null}
          <p>
            These rows read each order&rsquo;s current totals, the way Shopify admin shows them.
            They will not tie exactly to the P&amp;L over a period: an item added to a June order in
            August is August revenue in the statement and part of that June order here.
          </p>
        </div>
      </Card>
    </div>
  );
}
