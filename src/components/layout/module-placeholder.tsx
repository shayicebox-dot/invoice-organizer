import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { NAV_ITEMS } from '@/lib/config/navigation';

type ModulePlaceholderProps = {
  /** `id` of the module in `NAV_ITEMS`. */
  readonly moduleId: string;
  /** What this module will own once its data sources are connected. */
  readonly upcoming: readonly string[];
};

/**
 * Standard shell for a module that has not been built yet.
 * Renders no figures — placeholders never imply data that does not exist.
 */
export function ModulePlaceholder({ moduleId, upcoming }: ModulePlaceholderProps) {
  const item = NAV_ITEMS.find((navItem) => navItem.id === moduleId);

  if (!item) {
    throw new Error(`Unknown module id: ${moduleId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.label}
        description={item.description}
        actions={<Badge tone="neutral">Not implemented</Badge>}
      />

      <EmptyState
        icon={item.icon}
        title={`${item.label} is not connected yet`}
        description="This module is a placeholder. No data source is wired up, and no figures are calculated or displayed."
        footer={
          <ul className="mx-auto flex max-w-md flex-col gap-1.5 text-left text-xs text-foreground-muted">
            {upcoming.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground-subtle">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
