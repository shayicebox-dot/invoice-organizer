import type { DataSource } from '@/data/dashboard-source';
import { Badge } from '@/components/ui/badge';

/** Connection state of a single upstream data source. */
export function SourceBadge({ source }: { readonly source: DataSource }) {
  return source.connected ? (
    <Badge tone="positive">Connected</Badge>
  ) : (
    <Badge tone="neutral">Not connected</Badge>
  );
}
