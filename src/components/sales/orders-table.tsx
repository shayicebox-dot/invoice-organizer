import type { SalesOrder } from '@/core/metrics/sales';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCount, formatMoney, formatShortDate } from '@/lib/utils/format';

type OrdersTableProps = {
  readonly orders: readonly SalesOrder[];
};

const COLUMNS = ['Order', 'Date', 'Customer', 'Gross', 'Discounts', 'Refunds', 'Net'] as const;

/**
 * Every order in the period, with its line items.
 *
 * Line items are shown beneath their order rather than in a separate view, so
 * a net figure can be traced to the products that produced it without leaving
 * the screen.
 */
export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            Every order Shopify reported in this period, newest first, with its line items.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`px-2 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-subtle first:pl-0 last:pr-0 ${
                      column === 'Order' || column === 'Date' || column === 'Customer'
                        ? 'text-left'
                        : 'text-right'
                    }`}
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
                    <span className="block text-sm text-foreground-muted">
                      No orders in this period
                    </span>
                    <span className="mt-1 block text-xs text-foreground-subtle">
                      Shopify reported no orders between these dates.
                    </span>
                  </td>
                </tr>
              ) : (
                orders.map((order) => <OrderRows key={order.id} order={order} />)
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderRows({ order }: { readonly order: SalesOrder }) {
  return (
    <>
      <tr className="border-b border-border-subtle">
        <td className="px-2 py-2.5 font-medium text-foreground first:pl-0">
          {order.orderNumber}
          {order.isCancelled ? (
            <span className="ml-2 text-xs font-normal text-negative">Cancelled</span>
          ) : null}
        </td>
        <td className="numeric px-2 py-2.5 text-foreground-muted">
          {formatShortDate(order.businessDate)}
        </td>
        <td className="px-2 py-2.5 text-foreground-muted">{order.customer ?? 'Guest'}</td>
        <td className="numeric px-2 py-2.5 text-right text-foreground-muted">
          {formatMoney(order.grossSales)}
        </td>
        <td className="numeric px-2 py-2.5 text-right text-foreground-muted">
          {formatMoney(order.discounts)}
        </td>
        <td className="numeric px-2 py-2.5 text-right text-foreground-muted">
          {formatMoney(order.refunds)}
        </td>
        <td className="numeric px-2 py-2.5 text-right font-medium text-foreground last:pr-0">
          {formatMoney(order.netRevenue)}
        </td>
      </tr>

      {order.lineItems.length === 0 ? null : (
        <tr className="border-b border-border-subtle">
          <td colSpan={COLUMNS.length} className="px-2 pb-3 pt-0 first:pl-0 last:pr-0">
            <ul className="flex flex-col gap-1 border-l-2 border-border-subtle pl-3">
              {order.lineItems.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-xs"
                >
                  <span className="text-foreground-muted">
                    {line.productTitle}
                    {line.sku === null ? (
                      <span className="ml-2 text-foreground-subtle">no SKU</span>
                    ) : (
                      <span className="numeric ml-2 text-foreground-subtle">{line.sku}</span>
                    )}
                  </span>
                  <span className="numeric text-foreground-subtle">
                    {formatCount(line.quantity)} × {formatMoney(line.unitPrice)} ={' '}
                    <span className="text-foreground-muted">
                      {formatMoney(line.discountedTotal)}
                    </span>
                  </span>
                </li>
              ))}
              {order.hasMoreLineItems ? (
                <li className="text-xs text-warning">
                  More line items exist on this order than were loaded.
                </li>
              ) : null}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
