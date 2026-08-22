import { cn } from '@/lib/utils/cn';

type BrandMarkProps = {
  readonly className?: string;
};

/** ICEBOX wordmark + monogram. Kept isolated so branding changes in one place. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-[11px] font-bold tracking-tight text-background">
        IX
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight text-foreground">ICEBOX</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-subtle">
          Finance OS
        </span>
      </span>
    </div>
  );
}
