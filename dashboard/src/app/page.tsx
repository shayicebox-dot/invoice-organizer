import { KpiCard } from "@/components/KpiCard";
import { RevenueProfitChart, AdSpendChart } from "@/components/Charts";
import { InsightCard } from "@/components/InsightCard";
import { Table, THead, TBody, TR, TD, Pos } from "@/components/Table";
import {
  MOCK_OVERVIEW,
  MOCK_TREND,
  MOCK_INSIGHTS,
  MOCK_ORDERS,
} from "@/lib/mock";
import { formatMoney, formatPct } from "@/lib/currency";

export default function OverviewPage() {
  const k = MOCK_OVERVIEW;
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Real net profit across Kicksbox, ICEBOX and BRUNO — last 30 days.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Live · synced 4 minutes ago
        </div>
      </header>

      <section className="grid grid-cols-4 gap-3">
        <KpiCard label="Net profit" value={formatMoney(k.netProfit)} delta={0.18} accent />
        <KpiCard label="Revenue" value={formatMoney(k.revenue)} delta={0.11} />
        <KpiCard label="Gross margin" value={formatPct(k.grossMarginPct)} delta={0.02} />
        <KpiCard label="Ad spend" value={formatMoney(k.adSpend)} delta={0.07} />
        <KpiCard label="MER" value={k.mer.toFixed(2) + "×"} delta={0.04} />
        <KpiCard label="AOV" value={formatMoney(k.aov)} delta={-0.02} />
        <KpiCard label="CAC" value={formatMoney(k.cac)} delta={-0.09} />
        <KpiCard label="Returning %" value={formatPct(k.returningPct)} delta={0.03} />
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="card col-span-2 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">Revenue vs net profit</h2>
              <p className="mt-0.5 text-xs text-ink-dim">Daily, last 30 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Net profit
              </span>
            </div>
          </div>
          <RevenueProfitChart data={MOCK_TREND} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Today</h2>
          <p className="mt-0.5 text-xs text-ink-dim">Refreshes every 5 minutes</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Orders" value={k.ordersToday.toString()} />
            <Stat label="Profit" value={formatMoney(k.profitToday)} accent />
            <Stat label="AOV" value={formatMoney(k.aov)} />
            <Stat label="MER" value={k.mer.toFixed(2) + "×"} />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-xs uppercase tracking-wider text-ink-dim">Ad spend</h3>
            <div className="mt-1">
              <AdSpendChart data={MOCK_TREND.slice(-14)} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">AI insights</h2>
            <a href="/insights" className="text-xs text-ink-muted hover:text-ink">
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {MOCK_INSIGHTS.slice(0, 3).map((i, idx) => (
              <InsightCard
                key={idx}
                severity={i.severity as never}
                category={i.category}
                title={i.title}
                body={i.body}
                action={i.action}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Recent orders</h2>
              <a href="/orders" className="text-xs text-ink-muted hover:text-ink">
                View all →
              </a>
            </div>
            <Table>
              <THead cols={["Order", "Channel", "Revenue", "Profit"]} />
              <TBody>
                {MOCK_ORDERS.slice(0, 8).map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <div className="font-medium">{o.id}</div>
                      <div className="text-xs text-ink-dim">{o.date}</div>
                    </TD>
                    <TD>
                      <span className="pill">{o.channel}</span>
                    </TD>
                    <TD num>{formatMoney(o.total, o.currency)}</TD>
                    <TD num>
                      <Pos value={o.profit}>{formatMoney(o.profit, o.currency)}</Pos>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-dim">{label}</div>
      <div
        className={"mt-1 text-lg font-semibold tabular-nums " + (accent ? "text-accent" : "")}
      >
        {value}
      </div>
    </div>
  );
}
