import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-surface shadow-[0_1px_2px_rgba(16,16,20,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('text-sm font-medium tracking-tight text-foreground', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: CardProps) {
  return <p className={cn('mt-1 text-sm text-foreground-muted', className)}>{children}</p>;
}

export function CardContent({ children, className }: CardProps) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}
