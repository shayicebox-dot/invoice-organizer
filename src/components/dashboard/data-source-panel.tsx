import type { DataSource } from '@/data/dashboard-source';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SourceBadge } from '@/components/dashboard/source-badge';

/** Where every figure on this page will come from, and whether it is live yet. */
export function DataSourcePanel({ sources }: { readonly sources: readonly DataSource[] }) {
  const connected = sources.filter((source) => source.connected).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Data sources</CardTitle>
          <CardDescription>
            {connected === 0
              ? 'Nothing is connected yet, so every figure reads “Not connected”.'
              : `${connected} of ${sources.length} sources are reporting.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center justify-between gap-4 border-t border-border-subtle py-2.5 first:border-t-0"
            >
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{source.label}</span>
                <span className="block text-xs text-foreground-subtle">{source.provides}</span>
              </span>
              <SourceBadge source={source} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
