import type { LucideIcon } from 'lucide-react';

/**
 * A caveat shown next to the figures it applies to.
 *
 * Notices are not decoration. A period label that silently covers less time
 * than it claims, a total that quietly carries VAT, or two sources whose days
 * start at different hours — each is a wrong number unless it is said out loud,
 * so this is where saying it happens.
 */
export type NoticeTone = 'warning' | 'negative';

type NoticeProps = {
  readonly tone: NoticeTone;
  readonly icon: LucideIcon;
  readonly children: React.ReactNode;
};

export function Notice({ tone, icon: Icon, children }: NoticeProps) {
  return (
    <p
      className={
        tone === 'negative'
          ? 'flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/5 p-3 text-xs leading-relaxed text-foreground-muted'
          : 'flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted'
      }
    >
      <Icon
        className={
          tone === 'negative'
            ? 'mt-0.5 size-4 shrink-0 text-negative'
            : 'mt-0.5 size-4 shrink-0 text-warning'
        }
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  );
}
