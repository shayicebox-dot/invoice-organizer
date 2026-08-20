import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { InfoIcon } from "@/components/ui/icons";
import { assignPackMapping, removePackMapping } from "@/lib/business-costs/actions";
import { getHistoricalMapping } from "@/lib/data";
import { formatDateShort } from "@/lib/date-range";
import { formatNumber } from "@/lib/money";
import type { ProductIdentityRow, IdentityStatus } from "@/lib/business-costs/inventory";
import type { MappingKey } from "@/lib/business-costs/pack-mapping";

export const metadata: Metadata = { title: "Historical Product Mapping" };

/** How far back the scan reaches by default. Overridable with `?days=`. */
const DEFAULT_DAYS = 400;
const MAX_DAYS = 730;

const STATUS_TONES: Record<IdentityStatus, BadgeTone> = {
  mapped: "positive",
  excluded: "neutral",
  unmapped: "warning",
};

const STATUS_LABELS: Record<IdentityStatus, string> = {
  mapped: "Mapped",
  excluded: "Excluded",
  unmapped: "Unmapped",
};

const KEY_LABELS: Record<MappingKey, string> = {
  sku: "SKU",
  variant_id: "Variant id",
  variant_title: "Variant title",
  product_title: "Product title",
  line_title: "Line title",
  any: "Any identifier",
};

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * The most durable identifier a line carries.
 *
 * Assignments are keyed on this rather than on the product title, so renaming
 * a variant tomorrow does not undo the mapping made today. A custom line item
 * has no SKU and no variant, so its own title is all there is.
 */
function bestKey(row: ProductIdentityRow): { key: MappingKey; value: string } {
  if (row.sku) return { key: "sku", value: row.sku };
  if (row.variantTitle) return { key: "variant_title", value: row.variantTitle };
  if (row.lineName) return { key: "line_title", value: row.lineName };
  return { key: "product_title", value: row.title ?? "" };
}

export default async function HistoricalMappingPage(props: PageProps<"/historical-mapping">) {
  const searchParams = await props.searchParams;
  const requested = Number.parseInt(String(searchParams.days ?? ""), 10);
  const days = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_DAYS)
    : DEFAULT_DAYS;

  const mapping = await getHistoricalMapping(isoDaysAgo(days), isoDaysAgo(0));
  const unmapped = mapping.rows.filter((row) => row.status === "unmapped");
  const unmappedQuantity = unmapped.reduce((acc, row) => acc + row.quantity, 0);
  const unmappedLineItems = unmapped.reduce((acc, row) => acc + row.lineItems, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historical Product Mapping"
        description={`Every product identity seen on an order between ${formatDateShort(mapping.start)} and ${formatDateShort(mapping.end)}, and the pack size each one costs at.`}
      />

      {mapping.error ? (
        <p className="rounded-lg border border-red-200 bg-negative-soft px-4 py-3 text-[12.5px] leading-5 text-negative">
          {mapping.error}
        </p>
      ) : null}

      {mapping.truncated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12.5px] leading-5 text-ink-secondary">
          The scan hit its page cap, so this list may be incomplete. Narrow the window with{" "}
          <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">?days=</code>{" "}
          and map in stages.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Identities seen"
          value={formatNumber(mapping.rows.length)}
          note={`Across ${formatNumber(mapping.ordersScanned)} orders`}
        />
        <SummaryTile
          label="Unmapped"
          value={formatNumber(unmapped.length)}
          note={`${formatNumber(unmappedLineItems)} line items · ${formatNumber(unmappedQuantity)} packs`}
          tone={unmapped.length > 0 ? "warning" : "positive"}
        />
        <SummaryTile
          label="P&L status"
          value={unmapped.length === 0 ? "Complete" : "Incomplete"}
          note={
            unmapped.length === 0
              ? "Every line has an operational cost"
              : "Profit is withheld until these are assigned"
          }
          tone={unmapped.length > 0 ? "warning" : "positive"}
        />
      </div>

      <Card>
        <CardHeader
          title="Products seen on orders"
          description="Grouped by the identity recorded on the order, not by the catalog as it stands today — a renamed variant, a deleted product and a custom line item all appear here."
        />

        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Product title</Th>
                <Th>Variant title</Th>
                <Th>SKU</Th>
                <Th>First seen</Th>
                <Th>Last seen</Th>
                <Th align="right">Qty sold</Th>
                <Th align="right">Pack size</Th>
                <Th>Status</Th>
                <Th>Assign</Th>
              </tr>
            </thead>
            <tbody>
              {mapping.rows.length === 0 ? (
                <EmptyRow colSpan={9}>
                  No order lines in this window. Widen it with ?days= or connect Shopify.
                </EmptyRow>
              ) : (
                mapping.rows.map((row) => {
                  const target = bestKey(row);
                  return (
                    <tr
                      key={row.key}
                      className={row.status === "unmapped" ? "bg-amber-50/50" : undefined}
                    >
                      <Td className="pr-4 font-medium">{row.title ?? row.lineName ?? "—"}</Td>
                      <Td className="pr-4 text-ink-secondary">{row.variantTitle ?? "—"}</Td>
                      <Td className="pr-4 font-mono text-[11.5px] text-ink-secondary">
                        {row.sku ?? "—"}
                      </Td>
                      <Td className="pr-4 text-ink-secondary">{formatDateShort(row.firstSeen)}</Td>
                      <Td className="pr-4 text-ink-secondary">{formatDateShort(row.lastSeen)}</Td>
                      <Td align="right" numeric>
                        {formatNumber(row.quantity)}
                      </Td>
                      <Td align="right" numeric className="font-semibold">
                        {row.packSize ?? "—"}
                      </Td>
                      <Td className="pr-4">
                        <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                        <span className="ml-2 text-[11px] text-ink-muted">{row.confidence}</span>
                      </Td>
                      <Td>
                        <form action={assignPackMapping} className="flex flex-wrap gap-1">
                          <input type="hidden" name="key" value={target.key} />
                          <input type="hidden" name="value" value={target.value} />
                          <input
                            type="hidden"
                            name="note"
                            value={`Assigned from Historical Product Mapping (${KEY_LABELS[target.key]})`}
                          />
                          <AssignButton value="10" />
                          <AssignButton value="20" />
                          <AssignButton value="50" />
                          <AssignButton value="exclude" label="Exclude" />
                        </form>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableFrame>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-md border border-line bg-surface-muted px-3 py-2.5 text-[12px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={14} height={14} />
          <span>
            Assigning writes to the mapping table below, keyed on the most durable identifier the
            line carries — its SKU where it has one. Nothing is guessed from the catalog, so a
            product renamed or deleted later keeps costing correctly. Use{" "}
            <strong className="font-semibold text-ink">Exclude</strong> for a line that should
            never carry an operational cost, such as a sample or a correction.
          </span>
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Mapping table"
          description="Manual assignments take precedence over the built-in aliases that ship with the app."
        />
        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Matches on</Th>
                <Th>Value</Th>
                <Th align="right">Assignment</Th>
                <Th>Note</Th>
                <Th>Origin</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {mapping.entries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-surface-muted">
                  <Td className="pr-4 text-ink-secondary">{KEY_LABELS[entry.key]}</Td>
                  <Td className="pr-4 font-mono text-[11.5px]">{entry.value}</Td>
                  <Td align="right" numeric className="font-semibold">
                    {entry.assignment === "exclude" ? "Exclude" : entry.assignment}
                  </Td>
                  <Td className="pr-4 text-ink-muted">{entry.note ?? "—"}</Td>
                  <Td className="pr-4">
                    <Badge tone={entry.origin === "manual" ? "info" : "neutral"}>
                      {entry.origin === "manual" ? "Manual" : "Built-in"}
                    </Badge>
                  </Td>
                  <Td align="right">
                    {entry.origin === "manual" ? (
                      <form action={removePackMapping}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-negative"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </div>

        <form
          action={assignPackMapping}
          className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-4"
        >
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-ink-secondary">
              Matches on
            </span>
            <select name="key" defaultValue="sku" className={inputClass}>
              {(Object.keys(KEY_LABELS) as MappingKey[]).map((key) => (
                <option key={key} value={key}>
                  {KEY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-ink-secondary">Value</span>
            <input name="value" required placeholder="WHITE-US1" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-ink-secondary">
              Assignment
            </span>
            <select name="assignment" defaultValue="10" className={inputClass}>
              <option value="10">10 Pack</option>
              <option value="20">20 Pack</option>
              <option value="50">50 Pack</option>
              <option value="exclude">Exclude from costing</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-ink px-3 py-2 text-[12.5px] font-medium text-surface transition-opacity hover:opacity-90"
            >
              Add alias
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink-muted";

function AssignButton({ value, label }: { value: string; label?: string }) {
  return (
    <button
      type="submit"
      name="assignment"
      value={value}
      className="rounded-md border border-line px-2 py-1 text-[11.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
    >
      {label ?? value}
    </button>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: BadgeTone;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-muted">
          {label}
        </span>
        {tone ? <Badge tone={tone}>{tone === "positive" ? "OK" : "Action"}</Badge> : null}
      </div>
      <p className="tabular mt-2 text-[24px] font-semibold tracking-[-0.01em] text-ink">{value}</p>
      <p className="mt-1 text-[11.5px] text-ink-muted">{note}</p>
    </div>
  );
}
