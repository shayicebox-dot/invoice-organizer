"use client";
import { useState } from "react";
import { Table, THead, TBody, TR, TD, Pos } from "@/components/Table";
import { KpiCard } from "@/components/KpiCard";
import { MOCK_ORDERS } from "@/lib/mock";
import { formatMoney, formatPct } from "@/lib/currency";
import clsx from "clsx";

const FILTERS = ["All", "Profitable", "Losing", "Returning", "AOV > $150"] as const;
type Filter = (typeof FILTERS)[number];

export default function OrdersPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const orders = MOCK_ORDERS.filter((o) => {
    switch (filter) {
      case "Profitable":
        return o.profit > 0;
      case "Losing":
        return o.profit < 0;
      case "Returning":
        return o.returning;
      case "AOV > $150":
        return o.total > 150;
      default:
        return true;
    }
  });

  const totals = orders.reduce(
    (a, o) => ({ rev: a.rev + o.total, prof: a.prof + o.profit }),
    { rev: 0, prof: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every order with true net profit, attributed ad source, and customer state.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "px-3 py-1.5 text-xs",
                filter === f ? "bg-bg-hover text-ink" : "text-ink-muted hover:bg-bg-elev",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Orders shown" value={orders.length.toString()} />
        <KpiCard label="Revenue" value={formatMoney(totals.rev)} />
        <KpiCard label="Net profit" value={formatMoney(totals.prof)} accent />
        <KpiCard
          label="Margin"
          value={formatPct(totals.rev > 0 ? totals.prof / totals.rev : 0)}
        />
      </div>

      <Table>
        <THead cols={["Order", "Channel", "Campaign", "Customer", "Revenue", "Ad cost", "Profit", "Margin"]} />
        <TBody>
          {orders.map((o) => (
            <TR key={o.id}>
              <TD>
                <div className="font-medium">{o.id}</div>
                <div className="text-xs text-ink-dim">{o.date}</div>
              </TD>
              <TD>
                <span
                  className={clsx(
                    "pill",
                    o.channel === "meta" && "text-blue-300",
                    o.channel === "google" && "text-yellow-300",
                    o.channel === "klaviyo" && "text-violet-300",
                  )}
                >
                  {o.channel}
                </span>
              </TD>
              <TD className="text-xs text-ink-muted">{o.campaign}</TD>
              <TD>
                <span className={o.returning ? "pill text-accent" : "pill"}>
                  {o.returning ? "Returning" : "New"}
                </span>
              </TD>
              <TD num>{formatMoney(o.total, o.currency)}</TD>
              <TD num className="text-ink-dim">
                {formatMoney(o.total * 0.18, o.currency)}
              </TD>
              <TD num>
                <Pos value={o.profit}>{formatMoney(o.profit, o.currency)}</Pos>
              </TD>
              <TD num>
                <span className={o.profit >= 0 ? "text-ink" : "text-danger"}>
                  {formatPct(o.margin)}
                </span>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
