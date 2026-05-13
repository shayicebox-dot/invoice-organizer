import { Table, THead, TBody, TR, TD } from "@/components/Table";
import { KpiCard } from "@/components/KpiCard";
import { MOCK_INVENTORY } from "@/lib/mock";
import { formatMoney } from "@/lib/currency";
import { AlertTriangle } from "lucide-react";

export default function InventoryPage() {
  const totalValue = MOCK_INVENTORY.reduce((a, p) => a + p.value, 0);
  const lowStock = MOCK_INVENTORY.filter((p) => p.daysLeft < 21);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory & cash flow</h1>
        <p className="mt-1 text-sm text-ink-muted">
          What you own, how fast it sells, and when you'll run out.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Inventory value" value={formatMoney(totalValue)} hint="At unit cost" />
        <KpiCard label="SKUs tracked" value={MOCK_INVENTORY.length.toString()} />
        <KpiCard label="Stocking out < 21d" value={lowStock.length.toString()} hint="Reorder now" />
        <KpiCard label="Cash tied up" value={formatMoney(totalValue)} />
      </div>

      {lowStock.length > 0 && (
        <div className="card border-yellow-500/30 bg-yellow-500/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-warn">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Reorder soon</span>
          </div>
          <ul className="text-sm text-ink-muted">
            {lowStock.map((p) => (
              <li key={p.product} className="flex justify-between py-1">
                <span>{p.product}</span>
                <span className="tabular-nums text-warn">{p.daysLeft} days left</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Table>
        <THead cols={["Product", "On hand", "Velocity / day", "Days left", "Cash value", "Forecast"]} />
        <TBody>
          {MOCK_INVENTORY.map((p) => (
            <TR key={p.product}>
              <TD className="font-medium">{p.product}</TD>
              <TD num>{p.onHand.toLocaleString()}</TD>
              <TD num className="text-ink-muted">
                {p.velocity.toFixed(1)}
              </TD>
              <TD num>
                <span
                  className={
                    p.daysLeft < 14
                      ? "text-danger"
                      : p.daysLeft < 30
                        ? "text-warn"
                        : "text-ink"
                  }
                >
                  {p.daysLeft} days
                </span>
              </TD>
              <TD num>{formatMoney(p.value)}</TD>
              <TD className="text-xs text-ink-muted">
                If sales continue at this pace, will run out around{" "}
                <span className="text-ink">
                  {new Date(Date.now() + p.daysLeft * 86400000).toLocaleDateString()}
                </span>
                .
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
