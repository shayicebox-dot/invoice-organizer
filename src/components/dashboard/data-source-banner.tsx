/**
 * States plainly which parts of the page are real.
 *
 * The dashboard mixes live and mock inputs while integrations land one at a
 * time, so every figure on screen has to say which it is. Each provider
 * reports independently — Shopify can be live while Meta has failed — and the
 * banner always closes on what that combination means for Net Profit, because
 * a blended profit figure is easy to mistake for a real one.
 */
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "@/components/ui/icons";
import type {
  BusinessCostStatus,
  GoogleAdsStatus,
  MetaStatus,
  ShopifyStatus,
} from "@/lib/data";
import { cn } from "@/lib/cn";

export function DataSourceBanner({
  shopify,
  meta,
  googleAds,
  costs,
}: {
  shopify: ShopifyStatus;
  meta: MetaStatus;
  googleAds: GoogleAdsStatus;
  costs: BusinessCostStatus;
}) {
  const states = [shopify.state, meta.state, googleAds.state];
  const anyLive = states.includes("connected");
  const anyError = states.includes("error");

  const liveFields: string[] = [];
  if (shopify.state === "connected") {
    liveFields.push("gross sales, discounts, sales reversals, taxes, orders and units");
  }
  if (meta.state === "connected") liveFields.push("Meta Ads spend");
  if (googleAds.state === "connected") liveFields.push("Google Ads spend");

  const costSources = costs.sources;
  const manualFields = (
    [
      [costSources.cogs, "COGS"],
      [costSources.shipping, "shipping & fulfillment"],
      [costSources.paymentFees, "payment fees"],
      [costSources.klaviyo, "Klaviyo"],
      [costSources.otherExpenses, "other expenses"],
    ] as const
  )
    .filter(
      ([source]) => source === "manual" || source === "manual_real" || source === "live",
    )
    .map(([, label]) => label);

  const mockFields = [
    shopify.state === "connected" ? null : "revenue and orders",
    meta.state === "connected" ? null : "Meta Ads",
    googleAds.state === "connected" ? null : "Google Ads",
    costSources.klaviyo === "mock" ? "Klaviyo" : null,
    costSources.cogs === "mock" ? "COGS" : null,
    costSources.shipping === "mock" ? "shipping" : null,
    costSources.paymentFees === "mock" ? "payment fees" : null,
    costSources.otherExpenses === "mock" ? "other expenses" : null,
  ].filter((entry): entry is string => entry !== null);

  const incompleteFields = (
    [
      [costSources.cogs, "COGS"],
      [costSources.shipping, "shipping & fulfillment"],
      [costSources.paymentFees, "payment fees"],
      [costSources.klaviyo, "Klaviyo"],
      [costSources.otherExpenses, "other expenses"],
    ] as const
  )
    .filter(([source]) => source === "incomplete")
    .map(([, label]) => label);

  return (
    <div
      className={cn(
        "rounded-md border px-3.5 py-3",
        anyLive && !anyError && "border-emerald-200 bg-positive-soft",
        anyError && "border-amber-200 bg-amber-50",
        !anyLive && !anyError && "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProviderPill
          label="Shopify"
          state={shopify.state}
          detail={shopify.shopName ?? shopify.shopDomain}
        />
        <ProviderPill label="Meta Ads" state={meta.state} detail={meta.accountName} />
        <ProviderPill
          label="Google Ads"
          state={googleAds.state}
          detail={googleAds.accountName}
        />
      </div>

      {liveFields.length > 0 || manualFields.length > 0 ? (
        <p className="mt-2.5 text-[12px] leading-5 text-ink-secondary">
          {liveFields.length > 0 ? (
            <>
              <strong className="font-semibold text-ink">Live:</strong> {liveFields.join(" · ")}.{" "}
            </>
          ) : null}
          {manualFields.length > 0 ? (
            <>
              <strong className="font-semibold text-ink">Configured:</strong>{" "}
              {manualFields.join(", ")}.{" "}
            </>
          ) : null}
          {mockFields.length > 0 ? (
            <>
              <strong className="font-semibold text-ink">Still mock:</strong>{" "}
              {mockFields.join(", ")}.
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-2.5 flex items-start gap-2 text-[12px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={14} height={14} />
          <span>
            <strong className="font-semibold text-ink">
              Every figure on this page is mock data.
            </strong>{" "}
            Set the Shopify, Meta and Google Ads variables in{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
              .env.local
            </code>{" "}
            to read real revenue and ad spend.
          </span>
        </p>
      )}

      {incompleteFields.length > 0 ? (
        <p className="mt-1.5 text-[12px] leading-5 text-negative">
          <strong className="font-semibold">Missing cost data</strong> in{" "}
          {incompleteFields.join(", ")} — these totals understate, so Net Profit is overstated.
          Fix on the Business Costs page.
        </p>
      ) : null}

      {anyLive && mockFields.length > 0 ? (
        <p className="mt-1.5 text-[12px] leading-5 text-ink-secondary">
          Net Profit and every margin therefore mix real inputs with placeholder costs.{" "}
          <strong className="font-semibold text-ink">
            Treat them as structural, not accurate
          </strong>{" "}
          until the remaining inputs are configured.
        </p>
      ) : null}

      {anyLive && mockFields.length === 0 && incompleteFields.length === 0 ? (
        <p className="mt-1.5 text-[12px] leading-5 text-ink-secondary">
          Every input is real — no mock figure remains in this P&amp;L.
        </p>
      ) : null}

      <Problems shopify={shopify} meta={meta} googleAds={googleAds} />

      {costs.issues.length > 0 ? (
        <p className="mt-2 text-[11.5px] leading-4 text-ink-muted">
          {costs.issues.length} cost setting{costs.issues.length === 1 ? " needs" : "s need"}{" "}
          attention — see Business Costs.
        </p>
      ) : null}
    </div>
  );
}

function Problems({
  shopify,
  meta,
  googleAds,
}: {
  shopify: ShopifyStatus;
  meta: MetaStatus;
  googleAds: GoogleAdsStatus;
}) {
  const notes: ReactNode[] = [];

  if (shopify.state === "error" && shopify.message) {
    notes.push(<Note key="shopify-error" label="Shopify" text={shopify.message} />);
  }
  if (meta.state === "error" && meta.message) {
    notes.push(<Note key="meta-error" label="Meta Ads" text={meta.message} />);
  }
  if (googleAds.state === "error" && googleAds.message) {
    notes.push(
      <Note
        key="google-error"
        label="Google Ads"
        text={
          googleAds.errorCode
            ? `${googleAds.message} (${googleAds.errorCode})`
            : googleAds.message
        }
      />,
    );
  }
  if (shopify.truncated) {
    notes.push(
      <Note
        key="shopify-truncated"
        label="Shopify"
        text="This period exceeded the order page limit, so revenue is incomplete. Narrow the date range for a complete read."
      />,
    );
  }
  if (meta.truncated) {
    notes.push(
      <Note
        key="meta-truncated"
        label="Meta Ads"
        text="This period exceeded the insights page limit, so ad spend is incomplete."
      />,
    );
  }

  if (notes.length === 0) return null;
  return <div className="mt-2 space-y-1">{notes}</div>;
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[12px] leading-5 text-ink-secondary">
      <span className="font-semibold text-ink">{label}:</span> {text}
    </p>
  );
}

function ProviderPill({
  label,
  state,
  detail,
}: {
  label: string;
  state: "connected" | "not_configured" | "error";
  detail: string | null;
}) {
  const tone = state === "connected" ? "positive" : state === "error" ? "warning" : "neutral";
  const text =
    state === "connected" ? "Live" : state === "error" ? "Unavailable" : "Not connected";

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>
        {label} · {text}
      </Badge>
      {state === "connected" && detail ? (
        <span className="text-[11.5px] text-ink-muted">{detail}</span>
      ) : null}
    </span>
  );
}
