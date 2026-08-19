import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { getConnections, getDailyFinancials, getStores } from "@/lib/data";
import { summarize } from "@/lib/finance";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { formatDateLong } from "@/lib/date-range";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresPage(props: PageProps<"/stores">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);
  const connections = await getConnections();

  const rows = await Promise.all(
    stores.map(async (store) => ({
      store,
      summary: summarize(await getDailyFinancials(store.id, view.range.start, view.range.end)),
      connectionCount: connections.filter(
        (connection) =>
          connection.status === "connected" &&
          (connection.storeId === store.id || connection.storeId === null),
      ).length,
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stores"
        description={`${view.range.label}. Every financial record is scoped to a store, so any store can be read on its own or rolled up.`}
      />

      <Card>
        <CardHeader
          title="All stores"
          description="Select a store from the header to scope the whole dashboard to it."
        />
        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Platform</Th>
                <Th>Currency</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Net sales</Th>
                <Th align="right">Net profit</Th>
                <Th align="right">Margin</Th>
                <Th align="right">Connections</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={9}>No stores yet.</EmptyRow>
              ) : (
                rows.map(({ store, summary, connectionCount }) => (
                  <tr key={store.id} className="transition-colors hover:bg-surface-muted">
                    <Td className="pr-6">
                      <Link
                        href={`/?store=${store.id}${view.range.preset === "30d" ? "" : `&range=${view.range.preset}`}`}
                        className="font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {store.name}
                      </Link>
                      <span className="block text-[11px] text-ink-muted">{store.domain}</span>
                    </Td>
                    <Td className="pr-4 capitalize text-ink-secondary">{store.platform}</Td>
                    <Td className="pr-4 text-ink-secondary">{store.currency}</Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatNumber(summary.orders)}
                    </Td>
                    <Td align="right" numeric>
                      {formatMoney(summary.netSales, summary.currency, { whole: true })}
                    </Td>
                    <Td
                      align="right"
                      numeric
                      className={cn("font-semibold", summary.netProfit < 0 && "text-negative")}
                    >
                      {formatMoney(summary.netProfit, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric>
                      {formatPercent(summary.netMargin)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {connectionCount}
                    </Td>
                    <Td>
                      <Badge tone={store.isActive ? "positive" : "neutral"}>
                        {store.isActive ? "Active" : "Paused"}
                      </Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableFrame>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => (
          <Card key={store.id}>
            <CardHeader title={store.name} description={store.domain} />
            <dl className="mt-4 space-y-2 text-[12.5px]">
              <Row label="Platform" value={store.platform} />
              <Row label="Reporting currency" value={store.currency} />
              <Row label="Timezone" value={store.timezone} />
              <Row label="Added" value={formatDateLong(store.createdAt.slice(0, 10))} />
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}
