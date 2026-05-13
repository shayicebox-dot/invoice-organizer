import { Table, THead, TBody, TR, TD, Pos } from "@/components/Table";
import { KpiCard } from "@/components/KpiCard";
import { MOCK_CAMPAIGNS } from "@/lib/mock";
import { formatMoney } from "@/lib/currency";
import clsx from "clsx";

export default function MarketingPage() {
  const spend = MOCK_CAMPAIGNS.reduce((a, c) => a + c.spend, 0);
  const revenue = MOCK_CAMPAIGNS.reduce((a, c) => a + c.revenue, 0);
  const profit = MOCK_CAMPAIGNS.reduce((a, c) => a + c.profit, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Meta, Google and Klaviyo — by spend, attributed revenue and contribution profit.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Ad spend" value={formatMoney(spend)} />
        <KpiCard label="Attributed revenue" value={formatMoney(revenue)} />
        <KpiCard label="Blended ROAS" value={(revenue / spend).toFixed(2) + "×"} />
        <KpiCard label="Net profit (after COGS)" value={formatMoney(profit)} accent />
      </div>

      <Table>
        <THead cols={["Platform", "Campaign", "Spend", "Revenue", "ROAS", "Net profit"]} />
        <TBody>
          {MOCK_CAMPAIGNS.map((c) => (
            <TR key={c.name}>
              <TD>
                <span
                  className={clsx(
                    "pill",
                    c.platform === "meta" && "text-blue-300",
                    c.platform === "google" && "text-yellow-300",
                    c.platform === "klaviyo" && "text-violet-300",
                  )}
                >
                  {c.platform}
                </span>
              </TD>
              <TD className="font-medium">{c.name}</TD>
              <TD num>{formatMoney(c.spend)}</TD>
              <TD num>{formatMoney(c.revenue)}</TD>
              <TD num>{Number.isFinite(c.roas) ? c.roas.toFixed(2) + "×" : "∞"}</TD>
              <TD num>
                <Pos value={c.profit}>{formatMoney(c.profit)}</Pos>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
