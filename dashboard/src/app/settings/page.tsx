import { CheckCircle2, Circle } from "lucide-react";

const CONNECTIONS = [
  { name: "Shopify – Kicksbox", status: "ok", note: "Last sync 4m ago" },
  { name: "Shopify – ICEBOX", status: "ok", note: "Last sync 5m ago" },
  { name: "Shopify – BRUNO", status: "ok", note: "Last sync 5m ago" },
  { name: "Meta Ads", status: "ok", note: "2 ad accounts" },
  { name: "Google Ads", status: "off", note: "Not connected" },
  { name: "Klaviyo – all brands", status: "ok", note: "3 accounts" },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Connections, cost overrides, and team access.</p>
      </header>

      <section className="card p-5">
        <h2 className="text-sm font-medium">Connections</h2>
        <p className="mt-1 text-xs text-ink-dim">
          Set credentials in your <code className="text-ink">.env</code> file or via Vercel project settings.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {CONNECTIONS.map((c) => (
            <li key={c.name} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {c.status === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                ) : (
                  <Circle className="h-4 w-4 text-ink-dim" />
                )}
                <span className="text-sm">{c.name}</span>
              </div>
              <div className="text-xs text-ink-dim">{c.note}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium">Cost overrides</h2>
        <p className="mt-1 text-xs text-ink-dim">
          The single most important table for accurate profit. For every SKU set:{" "}
          <span className="text-ink">unit cost · pick & pack · packaging · shipping · duties %</span>.
          Edit in Supabase Studio → <code className="text-ink">product_costs</code> until the editor UI is built.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium">Cron</h2>
        <p className="mt-1 text-xs text-ink-dim">
          Vercel cron hits <code className="text-ink">/api/sync</code> every 15 minutes and{" "}
          <code className="text-ink">/api/insights/generate</code> daily at 07:00 UTC. Edit{" "}
          <code className="text-ink">vercel.json</code> to change.
        </p>
      </section>
    </div>
  );
}
