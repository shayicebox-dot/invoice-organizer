import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getOrganization, getStores } from "@/lib/data";
import { CURRENT_USER, FIXED_EXPENSES } from "@/lib/data/catalog";
import { HISTORY_DAYS } from "@/lib/data/generate";
import { formatMoney } from "@/lib/money";
import { sum } from "@/lib/money";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [organization, stores] = await Promise.all([getOrganization(), getStores()]);
  const monthlyFixed = sum(FIXED_EXPENSES.map((expense) => expense.amount));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization, accounting conventions and the money model the dashboard is built on."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader title="Organization" description="The tenant every record belongs to." />
          <dl className="mt-4 space-y-2.5 text-[12.5px]">
            <Row label="Name" value={organization.name} />
            <Row label="Slug" value={organization.slug} />
            <Row label="Base currency" value={organization.baseCurrency} />
            <Row label="Reporting timezone" value={organization.timezone} />
            <Row label="Stores" value={String(stores.length)} />
            <Row label="Signed in as" value={`${CURRENT_USER.fullName} · ${CURRENT_USER.email}`} />
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Profit definitions"
            description="What each figure on the dashboard means."
          />
          <dl className="mt-4 space-y-3 text-[12.5px]">
            <Definition
              term="Net Sales"
              detail="Gross sales − discounts − sales reversals, exactly as Shopify Analytics defines them. Taxes are collected on behalf of the authorities and are excluded from revenue."
            />
            <Definition
              term="Contribution Profit"
              detail="Net sales − COGS − shipping & fulfillment − payment fees − marketing spend − variable expenses."
            />
            <Definition
              term="Operating Profit"
              detail="Contribution profit − allocated fixed expenses. This is what the dashboard calls Net Profit."
            />
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Money model"
            description="How amounts are stored, so cents never drift."
          />
          <ul className="mt-4 space-y-2 text-[12.5px] leading-5 text-ink-secondary">
            <li>
              Every amount is an integer count of minor currency units — cents for USD. Floating
              point is never used to hold money.
            </li>
            <li>
              Rates such as the 2.9% processing fee are applied through a single rounding
              helper that rounds half away from zero.
            </li>
            <li>
              Splitting an amount (fixed expenses across days, shared overhead across stores)
              hands out leftover minor units one at a time, so the parts always add back to the
              whole.
            </li>
            <li>
              Roll-ups across stores assume a shared reporting currency. Multi-currency
              organizations need a daily FX rate table before amounts can be added.
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Fixed expense allocation"
            description="Monthly overheads spread across the reporting period."
          />
          <dl className="mt-4 space-y-2.5 text-[12.5px]">
            <Row label="Monthly total" value={formatMoney(monthlyFixed, organization.baseCurrency)} />
            <Row label="Method" value="Even daily split, then pro-rata by net sales" />
            <Row label="Records" value={`${FIXED_EXPENSES.length} recurring expenses`} />
          </dl>
          <p className="mt-4 text-[11.5px] leading-5 text-ink-muted">
            Store-scoped expenses are charged to that store in full. Expenses with no store are
            shared overhead and are split each day in proportion to net sales.
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Data source"
            description="What the dashboard is reading right now."
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="warning">Demo data</Badge>
            <span className="text-[12.5px] text-ink-secondary">
              {HISTORY_DAYS} days of deterministic mock records across {stores.length} stores. No
              provider is connected and no external request is made.
            </span>
          </div>
          <p className="mt-4 text-[11.5px] leading-5 text-ink-muted">
            The mock layer produces the same record shapes as the proposed Postgres schema in{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
              docs/schema.sql
            </code>
            . Swapping it for Supabase is a change inside{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
              src/lib/data
            </code>{" "}
            only — no page or component reads the generator directly.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function Definition({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-b border-line/60 pb-3 last:border-b-0 last:pb-0">
      <dt className="font-semibold text-ink">{term}</dt>
      <dd className="mt-0.5 leading-5 text-ink-secondary">{detail}</dd>
    </div>
  );
}
