'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, PlugZap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { checkShopifyConnection } from '@/app/(app)/settings/actions';
import type { ShopifyConnectionView } from '@/components/settings/shopify-status';

type ShopifyConnectionCardProps = {
  /** Whether credentials are present, resolved on the server at page load. */
  readonly configured: boolean;
};

/**
 * Shopify connection status and test button.
 *
 * The button calls a server action, so the check runs entirely on the server —
 * no credential and no shared secret is ever sent to the browser. This
 * component only renders what the action chooses to return.
 */
export function ShopifyConnectionCard({ configured }: ShopifyConnectionCardProps) {
  const [result, setResult] = useState<ShopifyConnectionView | null>(null);
  const [isPending, startTransition] = useTransition();

  function runTest(): void {
    startTransition(async () => {
      setResult(await checkShopifyConnection());
    });
  }

  const status = result?.status ?? 'not-connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <PlugZap className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Shopify</CardTitle>
            <CardDescription>
              {configured
                ? 'Credentials are set on this deployment. Run a test to confirm the store answers.'
                : 'No credentials are set on this deployment yet.'}
            </CardDescription>
          </div>
        </div>
        <StatusBadge status={status} />
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Testing…
              </>
            ) : (
              'Test connection'
            )}
          </button>

          {result === null ? (
            <span className="text-xs text-foreground-subtle">
              Nothing is sent to your browser except the result shown here.
            </span>
          ) : (
            <span className="text-xs text-foreground-subtle">
              Last checked {formatCheckedAt(result.checkedAt)}
            </span>
          )}
        </div>

        <div aria-live="polite" className="mt-4">
          {result === null ? null : result.status === 'connected' ? (
            <ConnectedDetails result={result} />
          ) : (
            <FailureDetails message={result.message} guidance={result.guidance} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { readonly status: ShopifyConnectionView['status'] }) {
  if (status === 'connected') return <Badge tone="positive">Connected</Badge>;
  if (status === 'error') return <Badge tone="negative">Error</Badge>;
  return <Badge tone="neutral">Not connected</Badge>;
}

function ConnectedDetails({
  result,
}: {
  readonly result: Extract<ShopifyConnectionView, { status: 'connected' }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-positive">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Shopify answered successfully.
      </p>

      <dl className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
        <DetailRow label="Store name" value={result.storeName} />
        <DetailRow label="Shopify domain" value={result.myshopifyDomain} />
        <DetailRow label="Currency" value={result.currency} />
        <DetailRow label="Timezone" value={result.timeZone} />
        {result.plan === null ? null : <DetailRow label="Plan" value={result.plan} />}
        <DetailRow label="API version" value={result.apiVersion} />
      </dl>

      <div>
        <p className="text-xs font-medium text-foreground-muted">Granted access scopes</p>
        {result.grantedScopes.length === 0 ? (
          <p className="mt-1.5 text-sm text-foreground-subtle">
            Shopify did not report any scopes for this token.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {result.grantedScopes.map((scope) => (
              <li key={scope}>
                <Badge tone="neutral">{scope}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.missingScopes.length > 0 ? (
        <Notice tone="warning">
          Missing required {result.missingScopes.length === 1 ? 'scope' : 'scopes'}:{' '}
          {result.missingScopes.join(', ')}. Add them to the app version in the Shopify Dev
          Dashboard and approve the change on the store.
        </Notice>
      ) : null}

      {result.historicalOrdersGranted ? null : (
        <Notice tone="warning">
          <span className="font-medium">read_all_orders</span> is not granted, so Shopify will only
          return orders from the last 60 days. Year-to-date and historical figures need it.
        </Notice>
      )}
    </div>
  );
}

function FailureDetails({
  message,
  guidance,
}: {
  readonly message: string;
  readonly guidance: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
        {message}
      </p>
      <p className="mt-1.5 pl-6 text-sm text-foreground-muted">{guidance}</p>
    </div>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2">
      <dt className="text-sm text-foreground-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  readonly tone: 'warning';
  readonly children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === 'warning'
          ? 'rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted'
          : ''
      }
    >
      {children}
    </p>
  );
}

function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'just now'
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
