import { GitCommitHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type DeploymentCardProps = {
  readonly commitSha: string | null;
  readonly shortSha: string | null;
  readonly branch: string | null;
  readonly environment: string | null;
  readonly commitMessage: string | null;
};

/**
 * Which build this deployment is actually running.
 *
 * A financial figure that disagrees with its source has two possible causes:
 * the calculation is wrong, or the running code is not the code that was
 * fixed. Without this card the second cause is invisible from the browser, and
 * the two are indistinguishable — so a merged fix and a stale deployment look
 * exactly the same to whoever is reading the number.
 */
export function DeploymentCard({
  commitSha,
  shortSha,
  branch,
  environment,
  commitMessage,
}: DeploymentCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <GitCommitHorizontal className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Running build</CardTitle>
            <CardDescription>
              The exact commit serving this page. Compare it with the commit you expect before
              concluding a calculation is wrong.
            </CardDescription>
          </div>
        </div>
        <Badge tone={environment === 'production' ? 'positive' : 'neutral'}>
          {environment ?? 'local'}
        </Badge>
      </CardHeader>

      <CardContent>
        {commitSha === null ? (
          <p className="text-sm text-foreground-muted">
            No build metadata is available here, which is normal when running locally. On Vercel
            this shows the deployed commit.
          </p>
        ) : (
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <Row label="Commit" value={shortSha ?? commitSha} mono />
            <Row label="Branch" value={branch ?? '—'} />
            <Row label="Full SHA" value={commitSha} mono wrap />
            {commitMessage === null ? null : <Row label="Message" value={commitMessage} wrap />}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly wrap?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle py-2">
      <dt className="shrink-0 text-sm text-foreground-muted">{label}</dt>
      <dd
        className={[
          'text-sm text-foreground',
          mono ? 'numeric' : '',
          wrap ? 'break-all text-right text-xs' : 'truncate',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
