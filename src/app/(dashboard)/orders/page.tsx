import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/dashboard/kpi-cards";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { getOrders, getRangeReport, getStores } from "@/lib/data";
import { percentChange } from "@/lib/finance";
import { formatMoney, formatNumber } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison, formatDateShort } from "@/lib/date-range";
import type { OrderFinancialStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Orders" };

const ORDER_LIMIT = 60;

const STATUS_LABELS: Record<OrderFinancialStatus, string> = {
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  pending: "Pending",
};

const STATUS_TONES: Record<OrderFinancialStatus, BadgeTone> = {
  paid: "positive",
  partially_refunded: "warning",
  refunded: "negative",
  pending: "neutral",
};

export default async function OrdersPage(props: PageProps<"/orders">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [report, orders] = await Promise.all([
    getRangeReport(view.scope, view.range, view.previous),
    getOrders(view.scope, view.range.start, view.range.end, ORDER_LIMIT),
  ]);

  const { summary, previous } = report;
  const comparison = describeComparison(view.range);
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${view.scopeLabel} · ${view.range.label}. Contribution is what each order left after product, shipping and processing costs.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Orders"
          value={formatNumber(summary.orders)}
          delta={
            previous.orders === 0 ? null : (summary.orders - previous.orders) / Math.abs(previous.orders)
          }
          deltaCaption={comparison}
          footnote={`${formatNumber(summary.unitsSold)} units`}
        />
        <StatTile
          label="Net Revenue"
          value={formatMoney(summary.netSales, summary.currency)}
          delta={percentChange(summary.netSales, previous.netSales)}
          deltaCaption={comparison}
        />
        <StatTile
          label="AOV"
          value={formatMoney(summary.averageOrderValue, summary.currency)}
          delta={percentChange(summary.averageOrderValue, previous.averageOrderValue)}
          deltaCaption={comparison}
        />
        <StatTile
          label="Refunds"
          value={formatMoney(summary.refunds, summary.currency)}
          delta={percentChange(summary.refunds, previous.refunds)}
          deltaCaption={comparison}
          higherIsBetter={false}
        />
      </div>

      <Card>
        <CardHeader
          title="Recent orders"
          description={`Showing the ${Math.min(orders.length, ORDER_LIMIT)} most recent orders in this period.`}
        />
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
                <Th align="right">COGS</Th>
                <Th align="right">Shipping</Th>
                <Th align="right">Fees</Th>
                <Th align="right">Contribution</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <EmptyRow colSpan={12}>No orders in this period.</EmptyRow>
              ) : (
                orders.map(({ order, cogs, contribution }) => (
                  <tr key={order.id} className="transition-colors hover:bg-surface-muted">
                    <Td className="pr-4 font-medium tabular">{order.orderNumber}</Td>
                    <Td className="pr-4 text-ink-secondary">{formatDateShort(order.date)}</Td>
                    <Td className="pr-4 text-ink-secondary">
                      {storeNames.get(order.storeId) ?? "—"}
                    </Td>
                    <Td className="pr-4 text-ink-secondary">{order.customerName}</Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {order.itemCount}
                    </Td>
                    <Td align="right" numeric>
                      {formatMoney(order.grossSales, order.currency)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {order.discounts === 0 ? "—" : formatMoney(order.discounts, order.currency)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(cogs, order.currency)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(order.shippingCost, order.currency)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(order.paymentFees, order.currency)}
                    </Td>
                    <Td
                      align="right"
                      numeric
                      className={cn("font-semibold", contribution < 0 && "text-negative")}
                    >
                      {formatMoney(contribution, order.currency)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[order.financialStatus]}>
                        {STATUS_LABELS[order.financialStatus]}
                      </Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableFrame>
        </div>
        <p className="mt-4 text-[11.5px] leading-5 text-ink-muted">
          Order contribution excludes marketing spend and fixed overhead — those are period costs
          and appear in the P&amp;L, not on individual orders.
        </p>
      </Card>
    </div>
  );
}
