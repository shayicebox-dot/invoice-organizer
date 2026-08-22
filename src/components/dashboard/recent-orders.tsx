import type { RecentOrder } from '@/data/dashboard-source';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCount, formatMoney, formatShortDate } from '@/lib/utils/format';
import { money, type CurrencyCode } from '@/core/money';

type RecentOrdersProps = {
  readonly orders: readonly RecentOrder[];
  readonly currency: CurrencyCode;
};

const COLUMNS = ['Order', 'Date', 'Customer', 'Items', 'Total', 'Status'] as const;

/** Section 4 — the order list. Empty until Shopify is connected. */
export function RecentOrders({ orders, currency }: RecentOrdersProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>The most recent orders in the selected period.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-subtle first:pl-0 last:pr-0"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-2 py-12 text-center">
                    <span className="block text-sm text-foreground-muted">No orders to show</span>
                    <span className="mt-1 block text-xs text-foreground-subtle">
                      Orders appear here once Shopify is connected.
                    </span>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-2 py-2.5 font-medium text-foreground first:pl-0">
                      {order.reference}
                    </td>
                    <td className="numeric px-2 py-2.5 text-foreground-muted">
                      {formatShortDate(order.placedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-foreground-muted">{order.customer}</td>
                    <td className="numeric px-2 py-2.5 text-foreground-muted">
                      {formatCount(order.itemCount)}
                    </td>
                    <td className="numeric px-2 py-2.5 text-foreground">
                      {formatMoney(money(order.totalMinorUnits, currency))}
                    </td>
                    <td className="px-2 py-2.5 text-foreground-muted last:pr-0">{order.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
