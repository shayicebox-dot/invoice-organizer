import { Table, THead, TBody, TR, TD } from "@/components/Table";
import { KpiCard } from "@/components/KpiCard";
import { MOCK_CUSTOMERS } from "@/lib/mock";
import { formatMoney } from "@/lib/currency";

export default function CustomersPage() {
  const totalLtv = MOCK_CUSTOMERS.reduce((a, c) => a + c.ltv, 0);
  const totalProfit = MOCK_CUSTOMERS.reduce((a, c) => a + c.profit, 0);
  const avgOrders = MOCK_CUSTOMERS.reduce((a, c) => a + c.orders, 0) / MOCK_CUSTOMERS.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-ink-muted">
          LTV, profit generated, and a VIP score so you know who to reactivate.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Top customers" value={MOCK_CUSTOMERS.length.toString()} />
        <KpiCard label="Total LTV" value={formatMoney(totalLtv)} />
        <KpiCard label="Total profit" value={formatMoney(totalProfit)} accent />
        <KpiCard label="Avg orders" value={avgOrders.toFixed(1)} />
      </div>

      <Table>
        <THead cols={["Customer", "Orders", "LTV", "Profit", "Last order", "VIP"]} />
        <TBody>
          {MOCK_CUSTOMERS.map((c) => (
            <TR key={c.email}>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elev text-xs text-ink-dim">
                    {c.email[0].toUpperCase()}
                  </div>
                  <span className="font-medium">{c.email}</span>
                </div>
              </TD>
              <TD num>{c.orders}</TD>
              <TD num>{formatMoney(c.ltv)}</TD>
              <TD num className="text-accent">
                {formatMoney(c.profit)}
              </TD>
              <TD className="text-ink-muted">{c.lastOrder}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-bg-elev">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${c.vip}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-ink-muted">{c.vip}</span>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
