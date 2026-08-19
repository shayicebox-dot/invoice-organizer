import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "@/components/ui/icons";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import {
  CostSection,
  Field,
  RemoveButton,
  inputClass,
  submitClass,
} from "@/components/business-costs/section";
import {
  addExpense,
  addPackOverride,
  removePackOverride,
  addFulfillmentFee,
  addKlaviyoPlan,
  addPaymentProcessor,
  addShippingRate,
  addSkuCost,
  removeExpense,
  removeFulfillmentFee,
  removeKlaviyoPlan,
  removePaymentProcessor,
  removeShippingRate,
  removeSkuCost,
  setCogsMode,
} from "@/lib/business-costs/actions";
import { readSettings } from "@/lib/business-costs/store";
import { getLiveRangeReport, getStores } from "@/lib/data";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDateLong } from "@/lib/date-range";
import { resolveViewParams } from "@/lib/view-params";
import type { RecurringCost } from "@/lib/business-costs/types";

export const metadata: Metadata = { title: "Business Costs" };

const RECURRENCE_LABELS: Record<RecurringCost["recurrence"], string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  yearly: "Yearly",
  one_time: "One-time",
};

const SECTION_LABELS: Record<string, string> = {
  cogs: "COGS",
  shipping: "Shipping",
  payments: "Payment fees",
  klaviyo: "Klaviyo",
  expenses: "Expenses",
};

const CATEGORIES = [
  "software",
  "payroll",
  "rent",
  "professional_services",
  "packaging",
  "customer_support",
  "chargebacks",
  "other",
] as const;

export default async function BusinessCostsPage(props: PageProps<"/business-costs">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [settings, report] = await Promise.all([
    readSettings(),
    getLiveRangeReport(view.scope, view.range, view.previous),
  ]);

  const { costs } = report;
  const { summary } = report;
  const sources = costs.sources;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Costs"
        description={`Real cost inputs for the P&L. Figures shown are for ${view.range.label}; recurring costs are prorated across the selected range.`}
      />

      {costs.issues.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 shrink-0 text-amber-700" width={15} height={15} />
            <div>
              <p className="text-[12.5px] font-semibold text-ink">
                The P&amp;L is incomplete — {costs.issues.length}{" "}
                {costs.issues.length === 1 ? "item needs" : "items need"} attention
              </p>
              <ul className="mt-2 space-y-1.5">
                {costs.issues.map((issue, index) => (
                  <li key={`${issue.section}-${index}`} className="text-[12px] leading-5 text-ink-secondary">
                    <span className="font-medium text-ink">
                      {SECTION_LABELS[issue.section] ?? issue.section}:
                    </span>{" "}
                    {issue.message}
                    {issue.details.length > 0 ? (
                      <span className="mt-1 block font-mono text-[11px] text-ink-muted">
                        {issue.details.slice(0, 12).join(", ")}
                        {issue.details.length > 12 ? ` … +${issue.details.length - 12} more` : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-positive-soft">
          <p className="flex items-center gap-2 text-[12.5px] text-ink">
            <Badge tone="positive">Complete</Badge>
            Every cost section is configured. No mock costs remain in the P&amp;L.
          </p>
        </Card>
      )}

      {/* ---------------- Pack cost model ---------------- */}
      <CostSection
        title="Pack Cost Model"
        description="The real cost of a pack, applied to every Shopify line item by pack size. Product cost and fulfillment come from these rules; the percentage below covers processing and small variable costs."
        source={sources.cogs}
        total={formatMoney(summary.cogs, summary.currency)}
      >
        <TableFrame>
          <thead>
            <tr>
              <Th>Pack</Th>
              <Th align="right">Product COGS</Th>
              <Th align="right">Shipping / storage / pick &amp; pack</Th>
              <Th align="right">Total per pack</Th>
              <Th>Effective from</Th>
            </tr>
          </thead>
          <tbody>
            {settings.packModel.rules.map((rule) => (
              <tr key={rule.id} className="transition-colors hover:bg-surface-muted">
                <Td className="pr-4 font-medium">{rule.label}</Td>
                <Td align="right" numeric>
                  {formatMoney(rule.productCogs)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(rule.fulfillmentCost)}
                </Td>
                <Td align="right" numeric className="font-semibold">
                  {formatMoney((rule.productCogs + rule.fulfillmentCost) as typeof rule.productCogs)}
                </Td>
                <Td className="pr-4 text-ink-secondary">{formatDateLong(rule.effectiveFrom)}</Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>

        <p className="mt-4 rounded-md border border-line bg-surface-muted px-3 py-2.5 text-[12px] leading-5 text-ink-secondary">
          <strong className="font-semibold text-ink">
            Other variable costs: {(settings.packModel.variableRateOfNetRevenue * 100).toFixed(1)}%
            of Shopify net revenue
          </strong>{" "}
          — payment processing, Shopify fees and apps, and other small variable operating
          expenses. Applied in addition to the pack costs above. Ad spend is not included; it
          comes from Meta and Google directly.
        </p>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-1 text-[12.5px] font-semibold text-ink">Pack mapping overrides</h3>
          <p className="mb-3 text-[11.5px] leading-4 text-ink-muted">
            A line item is mapped by reading its SKU or title. Add an override for anything that
            cannot be read confidently — run{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
              npm run verify:packs
            </code>{" "}
            to list what needs one.
          </p>

          <TableFrame>
            <thead>
              <tr>
                <Th>Matches SKU / variant id / title</Th>
                <Th align="right">Pack size</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {settings.packModel.overrides.length === 0 ? (
                <EmptyRow colSpan={3}>No overrides — every product maps from its own text.</EmptyRow>
              ) : (
                settings.packModel.overrides.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-surface-muted">
                    <Td className="pr-4 font-mono text-[12px]">{entry.match}</Td>
                    <Td align="right" numeric>
                      {entry.packSize}
                    </Td>
                    <Td align="right">
                      <form action={removePackOverride}>
                        <input type="hidden" name="id" value={entry.id} />
                        <RemoveButton />
                      </form>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableFrame>

          <form action={addPackOverride} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-3">
            <Field label="SKU, variant id or exact title">
              <input name="match" required placeholder="KB-MYSTERY" className={inputClass} />
            </Field>
            <Field label="Pack size">
              <select name="packSize" defaultValue="10" className={inputClass}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button type="submit" className={`${submitClass} w-full`}>
                Add override
              </button>
            </div>
          </form>
        </div>
      </CostSection>

      {/* ---------------- COGS ---------------- */}
      <CostSection
        title="Per-SKU Cost Table"
        description="Only used when the cost source is set to manual per-SKU costs. The pack model above is the default."
        source={sources.cogs}
        total={formatMoney(summary.cogs, summary.currency)}
      >
        <form action={setCogsMode} className="mb-5 flex flex-wrap items-end gap-3">
          <Field label="Cost source" className="w-[280px]">
            <select name="mode" defaultValue={settings.cogs.mode} className={inputClass}>
              <option value="pack_cost_model">Pack cost model (real)</option>
              <option value="shopify_cost_per_item">Shopify cost per item</option>
              <option value="manual_sku_costs">Manual per-SKU costs</option>
              <option value="not_configured">Not configured</option>
            </select>
          </Field>
          <button type="submit" className={submitClass}>
            Save source
          </button>
          <p className="ml-auto max-w-md text-[11.5px] leading-4 text-ink-muted">
            Shopify cost per item reads the inventory item&apos;s cost and needs the{" "}
            <code className="font-mono">read_products</code> and{" "}
            <code className="font-mono">read_inventory</code> scopes. Manual costs use the table
            below.
          </p>
        </form>

        <TableFrame>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Label</Th>
              <Th align="right">Unit cost</Th>
              <Th>Effective from</Th>
              <Th>Until</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {settings.cogs.skuCosts.length === 0 ? (
              <EmptyRow colSpan={6}>No per-SKU costs configured.</EmptyRow>
            ) : (
              settings.cogs.skuCosts.map((cost) => (
                <tr key={cost.id} className="transition-colors hover:bg-surface-muted">
                  <Td className="pr-4 font-mono text-[12px]">{cost.sku}</Td>
                  <Td className="pr-4 text-ink-secondary">{cost.label}</Td>
                  <Td align="right" numeric>
                    {formatMoney(cost.unitCost)}
                  </Td>
                  <Td className="pr-4 text-ink-secondary">{formatDateLong(cost.effectiveFrom)}</Td>
                  <Td className="pr-4 text-ink-secondary">
                    {cost.effectiveTo ? formatDateLong(cost.effectiveTo) : "—"}
                  </Td>
                  <Td align="right">
                    <form action={removeSkuCost}>
                      <input type="hidden" name="id" value={cost.id} />
                      <RemoveButton />
                    </form>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableFrame>

        <form action={addSkuCost} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-6">
          <Field label="SKU">
            <input name="sku" required placeholder="NB-GRN-30" className={inputClass} />
          </Field>
          <Field label="Label">
            <input name="label" placeholder="Daily Greens" className={inputClass} />
          </Field>
          <Field label="Unit cost">
            <input name="unitCost" required placeholder="11.40" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Effective from">
            <input type="date" name="effectiveFrom" defaultValue={today} className={inputClass} />
          </Field>
          <Field label="Until (optional)">
            <input type="date" name="effectiveTo" className={inputClass} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${submitClass} w-full`}>
              Add cost
            </button>
          </div>
        </form>
      </CostSection>

      {/* ---------------- Shipping ---------------- */}
      <CostSection
        title="Shipping & Fulfillment"
        description="Per-order and per-unit costs, optional SKU overrides, plus fixed 3PL fees prorated across the range."
        source={sources.shipping}
        total={formatMoney(summary.shipping, summary.currency)}
      >
        <TableFrame>
          <thead>
            <tr>
              <Th>Rate</Th>
              <Th>Applies to</Th>
              <Th align="right">Per order</Th>
              <Th align="right">Per unit</Th>
              <Th>Effective from</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {settings.shipping.rates.length === 0 ? (
              <EmptyRow colSpan={6}>No shipping rates configured.</EmptyRow>
            ) : (
              settings.shipping.rates.map((rate) => (
                <tr key={rate.id} className="transition-colors hover:bg-surface-muted">
                  <Td className="pr-4 font-medium">{rate.label}</Td>
                  <Td className="pr-4 text-ink-secondary">
                    {rate.sku ? <span className="font-mono text-[12px]">{rate.sku}</span> : "All orders"}
                  </Td>
                  <Td align="right" numeric>
                    {formatMoney(rate.perOrder)}
                  </Td>
                  <Td align="right" numeric>
                    {formatMoney(rate.perUnit)}
                  </Td>
                  <Td className="pr-4 text-ink-secondary">{formatDateLong(rate.effectiveFrom)}</Td>
                  <Td align="right">
                    <form action={removeShippingRate}>
                      <input type="hidden" name="id" value={rate.id} />
                      <RemoveButton />
                    </form>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableFrame>

        <form action={addShippingRate} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-6">
          <Field label="Label">
            <input name="label" required placeholder="Standard" className={inputClass} />
          </Field>
          <Field label="SKU (optional)" hint="Blank = all orders">
            <input name="sku" placeholder="" className={inputClass} />
          </Field>
          <Field label="Per order">
            <input name="perOrder" placeholder="4.20" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Per unit">
            <input name="perUnit" placeholder="1.15" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Effective from">
            <input type="date" name="effectiveFrom" defaultValue={today} className={inputClass} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${submitClass} w-full`}>
              Add rate
            </button>
          </div>
        </form>

        <RecurringTable
          title="Fixed fulfillment fees"
          rows={settings.shipping.fixedFees}
          removeAction={removeFulfillmentFee}
          addAction={addFulfillmentFee}
          today={today}
          namePlaceholder="3PL monthly minimum"
        />
      </CostSection>

      {/* ---------------- Payment fees ---------------- */}
      <CostSection
        title="Payment Fees"
        description="Processing terms per provider. Percentage applies to net sales; the flat fee applies per transaction."
        source={sources.paymentFees}
        total={formatMoney(summary.paymentFees, summary.currency)}
      >
        <TableFrame>
          <thead>
            <tr>
              <Th>Processor</Th>
              <Th align="right">Percentage</Th>
              <Th align="right">Per transaction</Th>
              <Th align="right">Share of orders</Th>
              <Th>Effective from</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {settings.payments.processors.length === 0 ? (
              <EmptyRow colSpan={6}>No payment processor configured.</EmptyRow>
            ) : (
              settings.payments.processors.map((processor) => (
                <tr key={processor.id} className="transition-colors hover:bg-surface-muted">
                  <Td className="pr-4 font-medium">{processor.name}</Td>
                  <Td align="right" numeric>
                    {formatPercent(processor.percentageRate, 2)}
                  </Td>
                  <Td align="right" numeric>
                    {formatMoney(processor.fixedPerTransaction)}
                  </Td>
                  <Td align="right" numeric>
                    {formatPercent(processor.shareOfOrders, 0)}
                  </Td>
                  <Td className="pr-4 text-ink-secondary">
                    {formatDateLong(processor.effectiveFrom)}
                  </Td>
                  <Td align="right">
                    <form action={removePaymentProcessor}>
                      <input type="hidden" name="id" value={processor.id} />
                      <RemoveButton />
                    </form>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableFrame>

        <form
          action={addPaymentProcessor}
          className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-6"
        >
          <Field label="Processor">
            <input name="name" required placeholder="Shopify Payments" className={inputClass} />
          </Field>
          <Field label="Percentage" hint="e.g. 2.9">
            <input name="percentageRate" placeholder="2.9" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Per transaction">
            <input name="fixedPerTransaction" placeholder="0.30" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Share of orders" hint="e.g. 100">
            <input name="shareOfOrders" placeholder="100" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Effective from">
            <input type="date" name="effectiveFrom" defaultValue={today} className={inputClass} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${submitClass} w-full`}>
              Add processor
            </button>
          </div>
        </form>
      </CostSection>

      {/* ---------------- Klaviyo ---------------- */}
      <CostSection
        title="Klaviyo"
        description="The actual subscription cost, prorated across the days in the selected range."
        source={sources.klaviyo}
        total={formatMoney(summary.emailSpend, summary.currency)}
      >
        <RecurringTable
          title=""
          rows={settings.klaviyo.plans}
          removeAction={removeKlaviyoPlan}
          addAction={addKlaviyoPlan}
          today={today}
          namePlaceholder="Klaviyo subscription"
          defaultRecurrence="monthly"
        />
      </CostSection>

      {/* ---------------- Other expenses ---------------- */}
      <CostSection
        title="Other Business Expenses"
        description="Recurring and one-off costs. Monthly, weekly and yearly amounts are prorated per day; one-time expenses land on their date."
        source={sources.otherExpenses}
        total={formatMoney(summary.variableExpenses, summary.currency)}
      >
        <RecurringTable
          title=""
          rows={settings.expenses}
          removeAction={removeExpense}
          addAction={addExpense}
          today={today}
          namePlaceholder="Warehouse lease"
          withCategory
        />
      </CostSection>

      <Card>
        <CardHeader
          title="How these figures reach the P&L"
          description="So a number on the Overview can always be traced back to a setting here."
        />
        <ul className="mt-3 space-y-2 text-[12.5px] leading-5 text-ink-secondary">
          <li>
            COGS multiplies units actually sold in Shopify by the unit cost in force on that day.
            A cost change takes effect from its own date; earlier days keep the old cost.
          </li>
          <li>
            Monthly amounts are divided across the days of their month, weekly across seven days,
            yearly across the days of the year. The daily shares add back to exactly the billed
            amount, so no cent is invented or lost.
          </li>
          <li>
            A section with nothing configured keeps its mock figure and stays labelled{" "}
            <span className="font-medium text-ink">Mock</span>. A section that is configured but
            missing an input is labelled{" "}
            <span className="font-medium text-ink">Missing cost data</span> — the total understates
            and profit is overstated until it is fixed.
          </li>
          <li>
            Settings are stored in{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
              data/business-costs.json
            </code>
            , which is gitignored. Last updated{" "}
            {settings.updatedAt.startsWith("1970") ? "never" : formatDateLong(settings.updatedAt.slice(0, 10))}.
          </li>
        </ul>
      </Card>
    </div>
  );
}

/** Shared table + add-form for anything shaped like a recurring cost. */
function RecurringTable({
  title,
  rows,
  removeAction,
  addAction,
  today,
  namePlaceholder,
  withCategory = false,
  defaultRecurrence = "monthly",
}: {
  title: string;
  rows: RecurringCost[];
  removeAction: (form: FormData) => Promise<void>;
  addAction: (form: FormData) => Promise<void>;
  today: string;
  namePlaceholder: string;
  withCategory?: boolean;
  defaultRecurrence?: RecurringCost["recurrence"];
}) {
  return (
    <div className={title ? "mt-6 border-t border-line pt-5" : ""}>
      {title ? (
        <h3 className="mb-3 text-[12.5px] font-semibold text-ink">{title}</h3>
      ) : null}

      <TableFrame>
        <thead>
          <tr>
            <Th>Name</Th>
            {withCategory ? <Th>Category</Th> : null}
            <Th align="right">Amount</Th>
            <Th>Recurrence</Th>
            <Th>Starts</Th>
            <Th>Ends</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={withCategory ? 7 : 6}>Nothing configured.</EmptyRow>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-surface-muted">
                <Td className="pr-4 font-medium">{row.name}</Td>
                {withCategory ? (
                  <Td className="pr-4 text-ink-secondary">{row.category.replace(/_/g, " ")}</Td>
                ) : null}
                <Td align="right" numeric>
                  {formatMoney(row.amount)}
                </Td>
                <Td className="pr-4 text-ink-secondary">{RECURRENCE_LABELS[row.recurrence]}</Td>
                <Td className="pr-4 text-ink-secondary">{formatDateLong(row.startDate)}</Td>
                <Td className="pr-4 text-ink-secondary">
                  {row.endDate ? formatDateLong(row.endDate) : "—"}
                </Td>
                <Td align="right">
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <RemoveButton />
                  </form>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>

      <form action={addAction} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-6">
        <Field label="Name">
          <input name="name" required placeholder={namePlaceholder} className={inputClass} />
        </Field>
        {withCategory ? (
          <Field label="Category">
            <select name="category" defaultValue="other" className={inputClass}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Amount">
          <input name="amount" required placeholder="450.00" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Recurrence">
          <select name="recurrence" defaultValue={defaultRecurrence} className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
            <option value="one_time">One-time</option>
          </select>
        </Field>
        <Field label="Starts">
          <input type="date" name="startDate" defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Ends (optional)">
          <input type="date" name="endDate" className={inputClass} />
        </Field>
        <div className="flex items-end">
          <button type="submit" className={`${submitClass} w-full`}>
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
