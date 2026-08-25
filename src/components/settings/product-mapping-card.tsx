import { Boxes } from 'lucide-react';
import type { ProductMappingRow } from '@/core/metrics/boxes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCount, formatDateRange } from '@/lib/utils/format';
import type { DateRange } from '@/core/period';

type ProductMappingCardProps = {
  readonly rows: readonly ProductMappingRow[];
  readonly range: DateRange;
  /** True when every row came from a configured ID rather than a title. */
  readonly allMapped: boolean;
};

/**
 * What each pack is worth in physical boxes, and where that number came from.
 *
 * Every cost in ICEBOX OS is per physical box, so this table is the foundation
 * the profit figures stand on. It exists to be checked: it lists the real
 * variant ID of everything sold, so a count inferred from a product title can
 * be replaced with one pinned to an ID that cannot drift when a product is
 * renamed.
 */
export function ProductMappingCard({ rows, range, allMapped }: ProductMappingCardProps) {
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
              How many physical boxes each pack contains. Everything sold in{' '}
              {formatDateRange(range)}, with the variant ID to pin it to.
            </CardDescription>
          </div>
        </div>
        <Badge tone={allMapped ? 'positive' : 'neutral'}>
          {allMapped ? 'All mapped' : 'Needs confirming'}
        </Badge>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nothing sold in this window, so there is nothing to map yet.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left">
                    <th scope="col" className="py-2 pr-4 text-xs font-medium text-foreground-muted">
                      Pack
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right text-xs font-medium text-foreground-muted">
                      Boxes per unit
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right text-xs font-medium text-foreground-muted">
                      Units sold
                    </th>
                    <th scope="col" className="py-2 pl-4 text-xs font-medium text-foreground-muted">
                      Variant ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border-subtle last:border-b-0">
                      <td className="max-w-[16rem] py-2.5 pr-4">
                        <span dir="auto" className="block truncate [unicode-bidi:isolate] text-foreground">
                          {row.productTitle}
                        </span>
                        {row.variantTitle === null ? null : (
                          <span dir="auto" className="block truncate text-[11px] text-foreground-subtle">
                            {row.variantTitle}
                          </span>
                        )}
                      </td>
                      <td className="numeric py-2.5 pl-4 text-right">
                        {row.boxesPerUnit === null ? (
                          <span className="text-negative">Unknown</span>
                        ) : (
                          <span className="text-foreground">{formatCount(row.boxesPerUnit)}</span>
                        )}
                        <span className="ml-2 text-[10px] text-foreground-subtle">
                          {row.source === 'variant-id'
                            ? 'by ID'
                            : row.source === 'product-id'
                              ? 'by product'
                              : row.source === 'title'
                                ? 'from title'
                                : 'unmapped'}
                        </span>
                      </td>
                      <td className="numeric py-2.5 pl-4 text-right text-foreground-muted">
                        {formatCount(row.unitsSold)}
                      </td>
                      <td className="py-2.5 pl-4">
                        <code className="numeric break-all text-[11px] text-foreground-subtle">
                          {row.variantId ?? '—'}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-foreground-muted">
              A count marked <span className="font-medium">from title</span> was read out of the
              product name. It is a reasonable guess, not a fact — renaming that product in Shopify
              would silently change its cost. To pin it down, copy the variant ID above into{' '}
              <code className="text-foreground-subtle">byVariantId</code> in{' '}
              <code className="text-foreground-subtle">src/lib/config/products.ts</code>. A count
              marked <span className="font-medium">unmapped</span> contributes no cost at all, so
              profit is overstated until it is added.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
