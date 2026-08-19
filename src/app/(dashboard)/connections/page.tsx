import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { CategorySection, ConnectionCard } from "@/components/dashboard/connection-card";
import { InfoIcon } from "@/components/ui/icons";
import { getConnections } from "@/lib/data";
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
  const connections = await getConnections();
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description="Connect the places money comes in and goes out. Shopify supplies revenue; every other provider supplies a cost."
      />

      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-5 text-ink-secondary">
        <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={15} height={15} />
        <span>
          <strong className="font-semibold text-ink">Placeholders for now.</strong> The Connect
          buttons are inactive while the dashboard runs on demo data. When OAuth lands, each
          button starts the provider&apos;s authorization flow and the returned tokens are stored
          in a secret manager — never in this repository or in the application database.
        </span>
      </p>

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
