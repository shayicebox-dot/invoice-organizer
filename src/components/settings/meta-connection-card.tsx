'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, Megaphone, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { checkMetaConnection } from '@/app/(app)/settings/meta-actions';
import type { MetaConnectionView } from '@/components/settings/meta-status';

type MetaConnectionCardProps = {
  /** Whether credentials are present, resolved on the server at page load. */
  readonly configured: boolean;
};

/**
 * Meta Ads connection status and test button.
 *
 * The button calls a server action, so the check runs entirely on the server —
 * no ad account id, token or shared secret is sent to the browser.
 */
export function MetaConnectionCard({ configured }: MetaConnectionCardProps) {
  const [result, setResult] = useState<MetaConnectionView | null>(null);
  const [isPending, startTransition] = useTransition();

  function runTest(): void {
    startTransition(async () => {
      setResult(await checkMetaConnection());
    });
  }

  const status = result?.status ?? 'not-connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <Megaphone className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Meta Ads</CardTitle>
            <CardDescription>
              {configured
                ? 'Credentials are set on this deployment. Run a test to confirm the ad account answers.'
                : 'No credentials are set on this deployment yet.'}
            </CardDescription>
          </div>
        </div>
        {status === 'connected' ? (
          <Badge tone="positive">Connected</Badge>
        ) : status === 'error' ? (
          <Badge tone="negative">Error</Badge>
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
              ? 'Reads the account name and settings only — no spend is fetched.'
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
      </CardContent>
    </Card>
  );
}

function ConnectedDetails({
  result,
}: {
  readonly result: Extract<MetaConnectionView, { status: 'connected' }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-positive">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Meta answered successfully.
      </p>

      <dl className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
        <DetailRow label="Ad account" value={result.accountName} />
        <DetailRow label="Account ID" value={result.accountId} />
        <DetailRow label="Currency" value={result.currency} />
        {result.timeZone === null ? null : (
          <DetailRow label="Ad account timezone" value={result.timeZone} />
        )}
        <DetailRow label="Account status" value={result.accountStatus} />
        <DetailRow label="API version" value={result.apiVersion} />
      </dl>

      {result.isActive ? null : (
        <Notice>
          This ad account is not active ({result.accountStatus}). Meta may return no spend until
          that is resolved.
        </Notice>
      )}

      {result.currencyMatchesReporting ? null : (
        <Notice>
          This ad account reports in <span className="font-medium">{result.currency}</span>, but
          ICEBOX OS reports in <span className="font-medium">{result.reportingCurrency}</span>.
          Spend and revenue in different currencies cannot be combined, so ROAS and CPA will stay
          unavailable until a conversion rate is modelled.
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
