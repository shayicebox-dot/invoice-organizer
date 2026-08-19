/**
 * States plainly which parts of the page are real.
 *
 * The dashboard is mid-migration: Shopify revenue can be live while every cost
 * line is still mock. That makes Net Profit a blend, and a blended profit
 * figure is easy to misread as a real one — so the banner says so explicitly
 * rather than leaving the reader to infer it from the tags.
 */
import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "@/components/ui/icons";
import type { ShopifyStatus } from "@/lib/data";

export function DataSourceBanner({ status }: { status: ShopifyStatus }) {
  if (status.state === "connected") {
    return (
      <div className="rounded-md border border-emerald-200 bg-positive-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="positive">Shopify connected</Badge>
          <span className="text-[12.5px] font-medium text-ink">
            {status.shopName ?? status.shopDomain}
          </span>
          {status.timezone ? (
            <span className="text-[11.5px] text-ink-muted">
              Days bucketed in {status.timezone}
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-[12px] leading-5 text-ink-secondary">
          <strong className="font-semibold text-ink">Live:</strong> gross sales, discounts,
          refunds, orders and units — read from the Shopify Admin API.{" "}
          <strong className="font-semibold text-ink">Still mock:</strong> COGS, shipping,
          payment fees, Meta, Google, Klaviyo and all expenses.
        </p>

        <p className="mt-1.5 text-[12px] leading-5 text-ink-secondary">
          Net Profit and every margin therefore mix real revenue with placeholder costs.{" "}
          <strong className="font-semibold text-ink">Treat them as structural, not accurate</strong>{" "}
          until the cost integrations land.
        </p>

        {status.truncated ? (
          <p className="mt-1.5 text-[12px] leading-5 text-negative">
            This period exceeded the order page limit, so the totals are incomplete. Narrow the
            date range for a complete read.
          </p>
        ) : null}
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-negative-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="negative">Shopify unavailable</Badge>
          <span className="text-[12.5px] text-ink">Showing mock data for every figure.</span>
        </div>
        {status.message ? (
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{status.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
      <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={15} height={15} />
      <span>
        <strong className="font-semibold text-ink">Every figure on this page is mock data.</strong>{" "}
        Set <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
          SHOPIFY_STORE_DOMAIN
        </code>
        ,{" "}
        <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
          SHOPIFY_CLIENT_ID
        </code>{" "}
        and{" "}
        <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
          SHOPIFY_CLIENT_SECRET
        </code>{" "}
        in <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">.env.local</code>{" "}
        to read real revenue and orders.
      </span>
    </p>
  );
}
