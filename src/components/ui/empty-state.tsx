import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly footer?: ReactNode;
};

/**
 * Placeholder for a module that has no connected data source yet.
 * Deliberately shows no numbers — ICEBOX OS never renders sample financials.
 */
export function EmptyState({ icon: Icon, title, description, footer }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border border-border-subtle bg-surface text-foreground-subtle">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-sm font-medium text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-foreground-muted">{description}</p>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  );
}
