import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { CategorySection, ConnectionCard } from "@/components/dashboard/connection-card";
import { InfoIcon } from "@/components/ui/icons";
import {
  getConnections,
  getGoogleAdsStatus,
  getMetaStatus,
  getShopifyStatus,
} from "@/lib/data";
import {
  PROVIDERS,
  PROVIDER_CATEGORY_DESCRIPTIONS,
  PROVIDER_CATEGORY_LABELS,
} from "@/lib/data/catalog";
import type { ProviderCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Connections" };

const CATEGORY_ORDER: ProviderCategory[] = [
  "commerce",
  "advertising",
  "email_sms",
  "fulfillment",
  "payments",
];

export default async function ConnectionsPage() {
  const [connections, shopify, meta, googleAds] = await Promise.all([
    getConnections(),
    getShopifyStatus(),
    getMetaStatus(),
    getGoogleAdsStatus(),
  ]);
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  // Shopify is the one provider with a real integration; its card reflects the
  // live probe rather than the seeded status.
  const shopifyConnection = byProvider.get("shopify");
  if (shopifyConnection) {
    byProvider.set("shopify", {
      ...shopifyConnection,
      status:
        shopify.state === "connected"
          ? "connected"
          : shopify.state === "error"
            ? "error"
            : "disconnected",
      accountLabel: shopify.shopDomain ?? shopify.shopName,
      lastSyncedAt: formatSyncedAt(shopify.lastSyncedAt),
    });
  }

  const metaConnection = byProvider.get("meta_ads");
  if (metaConnection) {
    byProvider.set("meta_ads", {
      ...metaConnection,
      status:
        meta.state === "connected"
          ? "connected"
          : meta.state === "error"
            ? "error"
            : "disconnected",
      accountLabel: meta.accountName,
      lastSyncedAt: formatSyncedAt(meta.lastSyncedAt),
    });
  }

  const googleConnection = byProvider.get("google_ads");
  if (googleConnection) {
    byProvider.set("google_ads", {
      ...googleConnection,
      status:
        googleAds.state === "connected"
          ? "connected"
          : googleAds.state === "error"
            ? "error"
            : "disconnected",
      accountLabel: googleAds.accountName,
      lastSyncedAt: formatSyncedAt(googleAds.lastSyncedAt),
    });
  }

  const liveProviders = [
    shopify.state === "connected" ? "Shopify" : null,
    meta.state === "connected" ? "Meta Ads" : null,
    googleAds.state === "connected" ? "Google Ads" : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description="Connect the places money comes in and goes out. Shopify supplies revenue; every other provider supplies a cost."
      />

      {liveProviders.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-positive-soft px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-positive" width={15} height={15} />
          <span>
            <strong className="font-semibold text-ink">
              {liveProviders.join(" and ")} {liveProviders.length > 1 ? "are" : "is"} live.
            </strong>{" "}
            Shopify supplies revenue, sales reversals, orders and units; Meta Ads and Google Ads supply
            ad spend. All credentials are read from the server environment and none is ever sent
            to the browser. Every other provider below is still a placeholder.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={15} height={15} />
          <span>
            <strong className="font-semibold text-ink">Placeholders for now.</strong> The Connect
            buttons are inactive while the dashboard runs on demo data. Shopify, Meta Ads and
            Google Ads are the exceptions: they read real data as soon as their credentials are
            present in the server environment.
          </span>
        </p>
      )}

      {shopify.state === "error" && shopify.message ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <span className="font-semibold text-ink">Shopify:</span> {shopify.message}
        </p>
      ) : null}

      {meta.state === "error" && meta.message ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <span className="font-semibold text-ink">Meta Ads:</span> {meta.message}
        </p>
      ) : null}

      {googleAds.state === "error" && googleAds.message ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <span className="font-semibold text-ink">Google Ads:</span> {googleAds.message}
          {googleAds.errorCode ? (
            <span className="ml-1 font-mono text-[11px] text-ink-muted">
              ({googleAds.errorCode})
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="space-y-8">
        {CATEGORY_ORDER.map((category) => {
          const providers = PROVIDERS.filter((provider) => provider.category === category);
          if (providers.length === 0) return null;

          return (
            <CategorySection
              key={category}
              category={category}
              label={PROVIDER_CATEGORY_LABELS[category]}
              description={PROVIDER_CATEGORY_DESCRIPTIONS[category]}
            >
              {providers.map((provider) => {
                const connection = byProvider.get(provider.id);
                return (
                  <ConnectionCard
                    key={provider.id}
                    provider={provider}
                    status={connection?.status ?? "disconnected"}
                    accountLabel={connection?.accountLabel ?? null}
                    lastSyncedAt={connection?.lastSyncedAt ?? null}
                  />
                );
              })}
            </CategorySection>
          );
        })}
      </div>
    </div>
  );
}

/** Render a sync timestamp without pulling in a date library. */
function formatSyncedAt(value: string | null): string | null {
  if (!value) return null;
  return `${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
