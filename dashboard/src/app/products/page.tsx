import { Table, THead, TBody, TR, TD, Pos } from "@/components/Table";
import { KpiCard } from "@/components/KpiCard";
import { MOCK_PRODUCTS } from "@/lib/mock";
import { formatMoney, formatPct } from "@/lib/currency";
import { Package } from "lucide-react";

export default function ProductsPage() {
  const total = MOCK_PRODUCTS.reduce(
    (a, p) => ({
      revenue: a.revenue + p.revenue,
      profit: a.profit + p.profit,
      units: a.units + p.units,
    }),
    { revenue: 0, profit: 0, units: 0 },
  );
  const winners = MOCK_PRODUCTS.filter((p) => p.profit > 0).length;
  const losers = MOCK_PRODUCTS.length - winners;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Product profitability</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Per-SKU and per-bundle net profit, after COGS, shipping, pick & pack and attributed ad spend.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Products" value={MOCK_PRODUCTS.length.toString()} hint={`${winners} profitable / ${losers} losing`} />
        <KpiCard label="Units sold" value={total.units.toLocaleString()} />
        <KpiCard label="Revenue" value={formatMoney(total.revenue)} />
        <KpiCard label="Net profit" value={formatMoney(total.profit)} accent />
      </div>

      <Table>
        <THead
          cols={["Product", "Type", "Units", "Revenue", "COGS", "Net profit", "Margin"]}
        />
        <TBody>
          {MOCK_PRODUCTS.map((p) => (
            <TR key={p.title}>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-bg-elev">
                    <Package className="h-4 w-4 text-ink-dim" />
                  </div>
                  <div>
                    <div className="font-medium">{p.title}</div>
                    {p.bundle && (
                      <div className="text-xs text-ink-dim">Bundle · {p.bundle} units</div>
                    )}
                  </div>
                </div>
              </TD>
              <TD>
                {p.bundle ? (
                  <span className="pill text-accent">Bundle</span>
                ) : (
                  <span className="pill">Single</span>
                )}
              </TD>
              <TD num>{p.units.toLocaleString()}</TD>
              <TD num>{formatMoney(p.revenue)}</TD>
              <TD num className="text-ink-muted">
                {formatMoney(p.cogs)}
              </TD>
              <TD num>
                <Pos value={p.profit}>{formatMoney(p.profit)}</Pos>
              </TD>
              <TD num>
                <span className={p.margin > 0.3 ? "text-accent" : p.margin < 0 ? "text-danger" : "text-ink-muted"}>
                  {formatPct(p.margin)}
                </span>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
