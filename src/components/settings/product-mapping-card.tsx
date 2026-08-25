'use client';

import { useState, useTransition } from 'react';
import { Boxes, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { ProductMappingRow } from '@/core/metrics/boxes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { saveVariantBoxCount } from '@/app/(app)/settings/mapping-actions';
import { BOX_COUNT_PRESETS, MAX_BOXES_PER_UNIT } from '@/lib/config/products';
import { cn } from '@/lib/utils/cn';

type ProductMappingCardProps = {
  readonly rows: readonly ProductMappingRow[];
  readonly rangeLabel: string;
  /** False when the database is not connected, so edits cannot be saved. */
  readonly writable: boolean;
  readonly unavailableReason: string | null;
};

/**
 * Where the owner says how many physical boxes each thing they sell contains.
 *
 * Every cost in ICEBOX OS is per physical box, so this screen is the foundation
 * the profit figures stand on. It is built from real orders, so the list is
 * exactly what the business actually sells, and each decision is saved against
 * the Shopify variant ID — the one identifier that survives a product being
 * renamed.
 *
 * A product with no decision recorded is counted as zero boxes and shown first:
 * that keeps a shoe from ever being costed as packaging, but it also means a
 * real box pack left unset silently costs nothing, which is why unset rows are
 * flagged rather than quietly defaulted.
 */
export function ProductMappingCard({
  rows,
  rangeLabel,
  writable,
  unavailableReason,
}: ProductMappingCardProps) {
  const unmapped = rows.filter((row) => row.source === 'unmapped').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <Boxes className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Product mapping</CardTitle>
            <CardDescription>
              How many physical boxes each product contains. Everything sold in {rangeLabel}. A
              product that is not packaging — a shoe, say — is 0 boxes.
            </CardDescription>
          </div>
        </div>
        <Badge tone={unmapped === 0 ? 'positive' : 'negative'}>
          {unmapped === 0 ? 'All set' : `${unmapped} to set`}
        </Badge>
      </CardHeader>

      <CardContent>
        {unavailableReason === null ? null : (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{unavailableReason}</span>
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nothing sold in this window, so there is nothing to map yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {rows.map((row) => (
              <MappingRow key={row.key} row={row} writable={writable} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MappingRow({ row, writable }: { readonly row: ProductMappingRow; readonly writable: boolean }) {
  const [value, setValue] = useState<number | null>(row.boxesPerUnit);
  const [custom, setCustom] = useState(
    row.boxesPerUnit !== null && !BOX_COUNT_PRESETS.includes(row.boxesPerUnit),
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canEdit = writable && row.variantId !== null;

  function save(boxes: number): void {
    setValue(boxes);
    setFeedback(null);

    if (row.variantId === null) return;

    startTransition(async () => {
      const result = await saveVariantBoxCount({
        variantId: row.variantId as string,
        boxesPerUnit: boxes,
        productTitle: row.productTitle,
        variantTitle: row.variantTitle,
      });
      setFeedback({ ok: result.status === 'saved', message: result.message });
    });
  }

  return (
    <li className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-sm text-foreground [unicode-bidi:isolate]">
          {row.productTitle}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-subtle">
          {row.variantTitle === null ? null : <span dir="auto">{row.variantTitle}</span>}
          <span className="numeric">{row.unitsSold} sold</span>
          {row.source === 'unmapped' ? (
            <span className="rounded bg-negative/10 px-1.5 py-0.5 text-negative">Needs setting</span>
          ) : (
            <span className="rounded bg-surface-muted px-1.5 py-0.5">
              {row.boxesSold} boxes in period
            </span>
          )}
        </p>
        <code className="numeric mt-0.5 block break-all text-[10px] text-foreground-subtle">
          {row.variantId ?? 'No variant ID — this line cannot be mapped'}
        </code>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {BOX_COUNT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={!canEdit || isPending}
            onClick={() => {
              setCustom(false);
              save(preset);
            }}
            aria-pressed={!custom && value === preset}
            className={cn(
              'numeric rounded-md border px-2.5 py-1 text-xs transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              !custom && value === preset
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border-subtle text-foreground-muted hover:bg-surface-muted hover:text-foreground',
            )}
          >
            {preset}
          </button>
        ))}

        <button
          type="button"
          disabled={!canEdit || isPending}
          onClick={() => setCustom(true)}
          aria-pressed={custom}
          className={cn(
            'rounded-md border px-2.5 py-1 text-xs transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            custom
              ? 'border-accent bg-accent-muted text-accent'
              : 'border-border-subtle text-foreground-muted hover:bg-surface-muted hover:text-foreground',
          )}
        >
          Custom
        </button>

        {custom ? (
          <input
            type="number"
            min={0}
            max={MAX_BOXES_PER_UNIT}
            step={1}
            defaultValue={value ?? 0}
            disabled={!canEdit || isPending}
            aria-label={`Boxes per unit for ${row.productTitle}`}
            onBlur={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 0 && next <= MAX_BOXES_PER_UNIT) save(next);
            }}
            className="numeric w-20 rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        ) : null}

        <span className="flex min-w-[7rem] items-center gap-1 text-[11px]">
          {isPending ? (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              <span className="text-foreground-subtle">Saving…</span>
            </>
          ) : feedback === null ? null : feedback.ok ? (
            <>
              <Check className="size-3 text-positive" aria-hidden="true" />
              <span className="text-foreground-subtle">{feedback.message}</span>
            </>
          ) : (
            <>
              <AlertCircle className="size-3 text-negative" aria-hidden="true" />
              <span className="text-negative">{feedback.message}</span>
            </>
          )}
        </span>
      </div>
    </li>
  );
}
