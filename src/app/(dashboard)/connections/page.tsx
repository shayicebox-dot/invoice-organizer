import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { CategorySection, ConnectionCard } from "@/components/dashboard/connection-card";
import { InfoIcon } from "@/components/ui/icons";
import { getConnections, getShopifyStatus } from "@/lib/data";
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
  const [connections, shopify] = await Promise.all([getConnections(), getShopifyStatus()]);
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
      lastSyncedAt: shopify.lastSyncedAt
        ? new Date(shopify.lastSyncedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
        : null,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description="Connect the places money comes in and goes out. Shopify supplies revenue; every other provider supplies a cost."
      />

      {shopify.state === "connected" ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-positive-soft px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-positive" width={15} height={15} />
          <span>
            <strong className="font-semibold text-ink">
              Shopify is live on {shopify.shopName ?? shopify.shopDomain}.
            </strong>{" "}
            Revenue, discounts, refunds, orders and units on the Overview come from the Admin
            GraphQL API. Credentials are read from the server environment and the access token
            stays server-side — it is never sent to the browser. Every other provider below is
            still a placeholder.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={15} height={15} />
          <span>
            <strong className="font-semibold text-ink">Placeholders for now.</strong> The Connect
            buttons are inactive while the dashboard runs on demo data. Shopify is the exception:
            it reads real data as soon as its credentials are present in the server environment.
            {shopify.state === "error" && shopify.message ? (
              <span className="mt-1 block text-negative">{shopify.message}</span>
            ) : null}
          </span>
        </p>
      )}

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
