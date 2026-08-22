import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border-subtle bg-surface-muted text-foreground-muted',
  accent: 'border-transparent bg-accent-muted text-accent',
  positive: 'border-transparent bg-positive/10 text-positive',
  warning: 'border-transparent bg-warning/10 text-warning',
};

type BadgeProps = {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly className?: string;
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
