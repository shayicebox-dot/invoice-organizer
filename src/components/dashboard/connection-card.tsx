import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ConnectionStatus, ProviderCategory } from "@/lib/types";
import type { ProviderDefinition } from "@/lib/data/catalog";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  error: "Needs attention",
  syncing: "Syncing",
};

const STATUS_TONES: Record<ConnectionStatus, BadgeTone> = {
  connected: "positive",
  disconnected: "neutral",
  error: "negative",
  syncing: "info",
};

/**
 * One provider. The Connect action is a placeholder until OAuth lands — it is
 * rendered disabled rather than wired to a stub, so nothing on this page can be
 * mistaken for a working integration.
 */
export function ConnectionCard({
  provider,
  status,
  accountLabel,
  lastSyncedAt,
}: {
  provider: ProviderDefinition;
  status: ConnectionStatus;
  accountLabel: string | null;
  lastSyncedAt: string | null;
}) {
  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[11px] font-semibold text-white"
            style={{ backgroundColor: provider.accent }}
          >
            {provider.initials}
          </span>
          <div>
            <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{provider.name}</h3>
            {accountLabel ? (
              <p className="text-[11.5px] text-ink-muted">{accountLabel}</p>
            ) : null}
          </div>
        </div>
        <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      <p className="mt-3 flex-1 text-[12px] leading-5 text-ink-secondary">{provider.description}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-muted">
          {lastSyncedAt ? `Last sync ${lastSyncedAt}` : "Never synced"}
        </span>
        <button
          type="button"
          disabled
          title="OAuth integrations arrive in Phase 2"
          className="h-8 rounded-[6px] border border-line bg-ink px-3 text-[12.5px] font-medium text-white opacity-45 disabled:cursor-not-allowed"
        >
          Connect
        </button>
      </div>
    </article>
  );
}

export function CategorySection({
  category,
  label,
  description,
  children,
}: {
  category: ProviderCategory;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`category-${category}`}>
      <div className="mb-3">
        <h2 id={`category-${category}`} className="text-[14px] font-semibold tracking-tight text-ink">
          {label}
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
