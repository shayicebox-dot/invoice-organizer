'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, ReceiptText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { checkMorningConnection } from '@/app/(app)/settings/morning-actions';
import type { MorningConnectionView } from '@/components/settings/morning-status';

type MorningConnectionCardProps = {
  /** Whether credentials are present, resolved on the server at page load. */
  readonly configured: boolean;
};

/**
 * Morning (Green Invoice) connection status and test button.
 *
 * The button calls a server action, so the check runs entirely on the server —
 * no API key, secret or token is sent to the browser.
 */
export function MorningConnectionCard({ configured }: MorningConnectionCardProps) {
  const [result, setResult] = useState<MorningConnectionView | null>(null);
  const [isPending, startTransition] = useTransition();

  function runTest(): void {
    startTransition(async () => {
      setResult(await checkMorningConnection());
    });
  }

  const status = result?.status ?? 'not-connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <ReceiptText className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Morning</CardTitle>
            <CardDescription>
              {configured
                ? 'Credentials are set on this deployment. Run a test to confirm the account answers.'
                : 'No credentials are set on this deployment yet.'}
            </CardDescription>
          </div>
        </div>
        {status === 'connected' ? (
          <Badge tone="positive">Connected</Badge>
        ) : status === 'error' ? (
          <Badge tone="negative">Connection failed</Badge>
        ) : (
          <Badge tone="neutral">Not connected</Badge>
        )}
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

          <span className="text-xs text-foreground-subtle">
            {result === null
              ? 'Reads the account only — no invoices, revenue or client records are fetched.'
              : `Last checked ${formatCheckedAt(result.checkedAt)}`}
          </span>
        </div>

        <div aria-live="polite" className="mt-4">
          {result === null ? null : result.status === 'connected' ? (
            <ConnectedDetails result={result} />
          ) : (
            <FailureDetails message={result.message} guidance={result.guidance} />
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-foreground-subtle">
          Morning is not a financial source in ICEBOX OS yet. Connecting it changes no figure on any
          screen: revenue still comes from Shopify and ad spend from Meta.
        </p>
      </CardContent>
    </Card>
  );
}

function ConnectedDetails({
  result,
}: {
  readonly result: Extract<MorningConnectionView, { status: 'connected' }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-positive">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Morning accepted the credentials.
      </p>

      <dl className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
        {result.businessName === null ? null : (
          <DetailRow label="Business" value={result.businessName} />
        )}
        <DetailRow label="API host" value={result.host} />
        <DetailRow label="Environment" value={result.environment} />
      </dl>

      {result.businessName === null ? (
        <Notice>
          Morning did not include a business name in its answer. Authentication still succeeded —
          only the name is missing.
        </Notice>
      ) : null}

      {result.environment === 'sandbox' ? (
        <Notice>
          This is Morning&rsquo;s sandbox, not the live account. Clear{' '}
          <span className="font-medium">MORNING_ENVIRONMENT</span> to point at production.
        </Notice>
      ) : null}
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

function Notice({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
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
