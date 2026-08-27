'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Loader2, SearchCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { readMorningPayments } from '@/app/(app)/settings/morning-payment-actions';
import type {
  MorningPaymentsView,
  OriginTotalView,
  PaymentRowView,
  PaymentTypeTotalView,
} from '@/components/settings/morning-payments-status';
import type { SalesOrigin } from '@/lib/config/sales-origin';
import { formatCount, formatMoney, formatProviderDate } from '@/lib/utils/format';
import { DiagnosticBoundary } from '@/components/settings/diagnostic-boundary';
import type { DateRange } from '@/core/period';

/**
 * Morning payment diagnostics — a temporary, read-only inspection panel.
 *
 * It exists to answer what ICEBOX's real collections look like in Morning
 * before any of them are allowed near a financial figure. Nothing it shows is
 * revenue, and nothing downstream reads it.
 *
 * One row per payment, not per document. Morning's search matches documents and
 * nests the payments inside them, so a single invoice-receipt can carry several
 * payments; the document appears only as context beside each of them.
 *
 * Morning's payment-type codes are shown as codes with Morning's own label for
 * the code. What distinguishes a Bit payment from a hosted card link from a
 * manually recorded one is not asserted anywhere here: the observed fields are
 * listed exactly as returned, so the answer can be read off real data rather
 * than guessed at.
 */

/** Morning's own names for the two codes searched. Not brand claims. */
const TYPE_LABELS: Readonly<Record<number, string>> = {
  3: 'Credit card',
  10: 'Payment app',
};

const ORIGIN_LABELS: Readonly<Record<SalesOrigin, string>> = {
  external: 'External paid revenue',
  shopify: 'Shopify-originated',
  unclassified: 'Unclassified',
};

const ORIGIN_SHORT: Readonly<Record<SalesOrigin, string>> = {
  external: 'External sale',
  shopify: 'Shopify-originated',
  unclassified: 'Unclassified',
};

type MorningPaymentsCardProps = {
  readonly configured: boolean;
  readonly range: DateRange;
};

export function MorningPaymentsCard({ configured, range }: MorningPaymentsCardProps) {
  const [result, setResult] = useState<MorningPaymentsView | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(): void {
    startTransition(async () => {
      setResult(await readMorningPayments({ from: range.start, to: range.end }));
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
            <SearchCheck className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Morning payment diagnostics</CardTitle>
            <CardDescription>
              {configured
                ? 'Reads the credit-card and payment-app payments Morning recorded in the selected period, and classifies each by where its sale came from.'
                : 'Morning credentials are not set on this deployment.'}
            </CardDescription>
          </div>
        </div>
        <Badge tone="neutral">Read only</Badge>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Reading…
              </>
            ) : (
              'Read payments'
            )}
          </button>

          <span className="text-xs text-foreground-subtle">
            Searches payment types 3 and 10 over the dates selected above, 25 documents a page
            until every page is read, and lists the payments nested inside them. Nothing is written, and no figure on any screen changes.
          </span>
        </div>

        <div aria-live="polite" className="mt-4">
          {result === null ? null : result.status === 'read' ? (
            <DiagnosticBoundary fallback={<PanelFallback />}>
              <Results result={result} />
            </DiagnosticBoundary>
          ) : (
            <Failure
              message={result.message}
              guidance={result.guidance}
              httpStatus={result.httpStatus}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Results({ result }: { readonly result: Extract<MorningPaymentsView, { status: 'read' }> }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {result.byOrigin.map((total) => (
          <OriginTile key={total.origin} total={total} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {result.totals.map((total) => (
          <TotalTile key={total.typeCode} total={total} />
        ))}
        <Tile
          label="Matching payments"
          value={formatCount(result.matchedCount)}
          detail={`in ${formatCount(result.documentCount)} ${
            result.documentCount === 1 ? 'document' : 'documents'
          } · ${pagesDetail(result.pagesRead, result.pagesReported)}`}
        />
      </div>

      {result.sweepTruncated ? (
        <Notice>
          The page sweep stopped at its ceiling, so more payments exist in this period than were
          read. The totals above cover only what was read and are therefore incomplete.
        </Notice>
      ) : null}

      {result.unpaidCount > 0 || result.cancelledCount > 0 ? (
        <Notice>
          Left out of every total:{' '}
          {result.unpaidCount > 0
            ? `${formatCount(result.unpaidCount)} ${
                result.unpaidCount === 1 ? 'payment' : 'payments'
              } Morning records as not paid`
            : null}
          {result.unpaidCount > 0 && result.cancelledCount > 0 ? ', and ' : null}
          {result.cancelledCount > 0
            ? `${formatCount(result.cancelledCount)} on documents Morning has cancelled`
            : null}
          . They are still listed below, because a total that silently drops rows is not evidence.
        </Notice>
      ) : null}

      {result.ambiguousCount > 0 ? (
        <Notice>
          {result.ambiguousCount === 1
            ? 'One payment carried both phrases'
            : `${formatCount(result.ambiguousCount)} payments carried both phrases`}{' '}
          in the same document. Each was read as Shopify-originated, because counting a sale Shopify
          already reports a second time is the one mistake worth ruling out. They are marked
          &ldquo;both phrases&rdquo; below — worth checking before this rule decides any figure.
        </Notice>
      ) : null}

      {result.documentsWithoutPayments > 0 ? (
        <Notice>
          {result.documentsWithoutPayments === 1
            ? 'One matched document carried no readable payment list, so nothing from it is counted.'
            : `${formatCount(result.documentsWithoutPayments)} matched documents carried no readable payment list, so nothing from them is counted.`}{' '}
          Worth looking at: it would be the first sign that Morning nests payments under a different
          name than this reads.
        </Notice>
      ) : null}

      {result.unexpectedTypeCount > 0 ? (
        <Notice>
          {result.unexpectedTypeCount === 1
            ? 'One of these payments has a type other than 3 or 10.'
            : `${formatCount(result.unexpectedTypeCount)} of these payments have a type other than 3 or 10.`}{' '}
          The search matches whole documents, so a document containing a card payment can carry
          other payments beside it. Each is listed below and counted as a payment, but is in neither
          total.
        </Notice>
      ) : null}

      {result.rows.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Morning reported no credit-card or payment-app payments in this period.
        </p>
      ) : (
        <PaymentTable rows={result.rows} />
      )}

      {result.rowsTruncated ? (
        <p className="text-xs text-foreground-subtle">
          Only the first {formatCount(result.rows.length)} payments are listed. The totals above
          cover every payment read, not just those shown.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-foreground-subtle">
        Read from the <span className="text-foreground-muted">{result.shape}</span> field of
        Morning&rsquo;s answer, then from each document&rsquo;s nested{' '}
        <span className="text-foreground-muted">{result.paymentKey ?? 'payment'}</span> array. Every
        amount comes from a payment entry; the document supplies its id, number, type, status and
        the descriptions the classification reads. Payment type codes are Morning&rsquo;s own. What
        <span className="text-foreground-muted"> subType</span>,
        <span className="text-foreground-muted"> appType</span> and the observed fields mean for
        this account is not interpreted here — that is the question this panel exists to answer.
      </p>
    </div>
  );
}

/** "3 of 3 pages read" when Morning stated a total; "3 pages read" when not. */
function pagesDetail(pagesRead: number, pagesReported: number | null): string {
  const unit = pagesReported === 1 || (pagesReported === null && pagesRead === 1) ? 'page' : 'pages';

  return pagesReported === null
    ? `${formatCount(pagesRead)} ${unit} read`
    : `${formatCount(pagesRead)} of ${formatCount(pagesReported)} ${unit} read`;
}

/**
 * One origin's signed total.
 *
 * Signed, because a credit note against a direct sale reduces external revenue
 * rather than adding to it. A negative total is therefore a real answer for a
 * period whose refunds outweighed its sales, not an error.
 */
function OriginTile({ total }: { readonly total: OriginTotalView }) {
  const value =
    total.totals.length === 0
      ? '—'
      : total.totals.map((amount) => formatMoney(amount, { showDecimals: true })).join(' · ');

  const parts = [
    `${formatCount(total.settledCount)} settled of ${formatCount(total.count)}`,
    total.reversals === 0
      ? null
      : `${formatCount(total.reversals)} ${total.reversals === 1 ? 'reversal' : 'reversals'}`,
    total.unpriced === 0
      ? null
      : `${formatCount(total.unpriced)} not priced${
          total.unsupportedCurrencies.length === 0
            ? ''
            : ` (${total.unsupportedCurrencies.join(', ')})`
        }`,
  ].filter((part): part is string => part !== null);

  return <Tile label={ORIGIN_LABELS[total.origin]} value={value} detail={parts.join(' · ')} />;
}

/**
 * The descriptions the classification read.
 *
 * Shown so the rule can be checked against the text it was applied to, rather
 * than trusted. `dir="auto"` lets Hebrew lay itself out, and isolation stops it
 * reordering the columns around it.
 */
function Descriptions({ descriptions }: { readonly descriptions: readonly string[] }) {
  const first = descriptions[0];

  if (first === undefined) return <span className="text-foreground-subtle">—</span>;

  return (
    <div className="flex flex-col gap-0.5">
      <span
        dir="auto"
        className="block truncate [unicode-bidi:isolate]"
        title={descriptions.join('\n')}
      >
        {first}
      </span>
      {descriptions.length > 1 ? (
        <span className="text-xs text-foreground-subtle">
          +{formatCount(descriptions.length - 1)} more
        </span>
      ) : null}
    </div>
  );
}

/** Where the sale came from, plus anything that keeps this row out of a total. */
function Classification({ row }: { readonly row: PaymentRowView }) {
  const tone =
    row.origin === 'external'
      ? 'border-positive/30 bg-positive-muted text-foreground'
      : row.origin === 'shopify'
        ? 'border-border-subtle bg-surface-muted text-foreground-muted'
        : 'border-warning/30 bg-warning/5 text-foreground-muted';

  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-block rounded border px-1.5 py-0.5 text-xs whitespace-nowrap ${tone}`}>
        {ORIGIN_SHORT[row.origin]}
      </span>
      <div className="flex flex-wrap gap-1">
        {row.settlement === 'settled' ? null : (
          <Chip label={row.settlement === 'unpaid' ? 'not paid' : 'cancelled'} />
        )}
        {row.isReversal ? <Chip label="reversal" /> : null}
        {row.originAmbiguous ? <Chip label="both phrases" /> : null}
      </div>
    </div>
  );
}

function TotalTile({ total }: { readonly total: PaymentTypeTotalView }) {
  const label = `${TYPE_LABELS[total.typeCode] ?? 'Type'} (${total.typeCode})`;

  const value =
    total.totals.length === 0
      ? '—'
      : total.totals.map((amount) => formatMoney(amount, { showDecimals: true })).join(' · ');

  const detail =
    total.unpriced === 0
      ? `${formatCount(total.count)} ${total.count === 1 ? 'payment' : 'payments'}`
      : `${formatCount(total.count)} payments · ${formatCount(total.unpriced)} not priced${
          total.unsupportedCurrencies.length === 0
            ? ''
            : ` (${total.unsupportedCurrencies.join(', ')})`
        }`;

  return <Tile label={label} value={value} detail={detail} />;
}

function Tile({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-medium tracking-tight text-foreground">{value}</p>
      <p className="numeric mt-0.5 text-xs text-foreground-subtle">{detail}</p>
    </div>
  );
}

function PaymentTable({ rows }: { readonly rows: readonly PaymentRowView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <Th align="left">Payment date</Th>
            <Th>Amount</Th>
            <Th align="left">Currency</Th>
            <Th align="left">Payment method</Th>
            <Th align="left">Description</Th>
            <Th align="left">Classification</Th>
            <Th align="left">Parent document</Th>
            <Th align="left">Morning IDs</Th>
            <Th align="left">Observed payment fields</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <DiagnosticBoundary
              key={row.paymentId ?? `${row.documentId ?? 'row'}-${index}`}
              fallback={<RowFallback paymentId={row.paymentId} />}
            >
              <PaymentRow row={row} />
            </DiagnosticBoundary>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentRow({ row }: { readonly row: PaymentRowView }) {
  // Never formatted without checking: a provider's date can be absent, empty or
  // malformed, and `Intl` throws `RangeError: Invalid time value` on all three.
  const date = formatProviderDate(row.date);

  return (
    <tr className="border-b border-border-subtle align-top last:border-b-0 hover:bg-surface-muted">
      <td className="numeric py-2.5 pr-4 whitespace-nowrap">
        {date ?? (
          <span
            className="text-foreground-subtle"
            title={
              row.date === null
                ? 'Morning recorded no date on this payment'
                : "Morning's value could not be read as a date; it is listed under observed fields"
            }
          >
            —
          </span>
        )}
      </td>
      {/* A settled payment shows the amount as it reaches the total — negative
          for a reversal — so the arithmetic above the table can be followed. A
          payment in no total is shown muted, as Morning stated it. */}
      <td className="numeric py-2.5 pr-4 text-right whitespace-nowrap">
        {row.settledAmount !== null ? (
          <span
            title={
              row.isReversal
                ? `Morning states ${row.rawAmount ?? 'this'} on a credit note; it reduces the total`
                : undefined
            }
          >
            {formatMoney(row.settledAmount, { showDecimals: true })}
          </span>
        ) : (
          <span
            className="text-foreground-subtle"
            title={
              row.settlement !== 'settled'
                ? 'Not settled, so it is in no total'
                : "Morning's value could not be read as an amount, so it is excluded from the totals"
            }
          >
            {row.amount === null
              ? (row.rawAmount ?? '—')
              : formatMoney(row.amount, { showDecimals: true })}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap">
        {row.currency ?? '—'}
        {row.currencyFromDocument ? (
          <span
            className="text-foreground-subtle"
            title="The payment stated no currency, so the document's was used"
          >
            {' '}
            (doc)
          </span>
        ) : null}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap">
        {row.typeCode === null
          ? '—'
          : `${row.typeCode}${
              TYPE_LABELS[row.typeCode] === undefined ? '' : ` · ${TYPE_LABELS[row.typeCode]}`
            }`}
      </td>
      <td className="max-w-[20rem] py-2.5 pr-4">
        <Descriptions descriptions={row.descriptions} />
      </td>
      <td className="py-2.5 pr-4">
        <Classification row={row} />
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap">
        {row.documentNumber === null ? '—' : `#${row.documentNumber}`}
        {row.documentType === null ? null : (
          <span className="text-foreground-subtle"> · type {row.documentType}</span>
        )}
      </td>
      <td className="py-2.5 pr-4">
        <IdLine label="payment" value={row.paymentId} />
        <IdLine label="document" value={row.documentId} />
      </td>
      <td className="py-2.5">
        <Signals row={row} showRawDate={date === null && row.date !== null} />
      </td>
    </tr>
  );
}

/** Shown in place of one row that could not be rendered. */
function RowFallback({ paymentId }: { readonly paymentId: string | null }) {
  return (
    <tr className="border-b border-border-subtle last:border-b-0">
      <td colSpan={9} className="py-2.5 text-sm text-foreground-muted">
        This payment could not be displayed
        {paymentId === null ? '' : ` (${paymentId})`}. The rest of the table is unaffected, and the
        totals above still include it.
      </td>
    </tr>
  );
}

/** Shown in place of the whole result when something unexpected reaches it. */
function PanelFallback() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted p-4">
      <p className="text-sm font-medium text-foreground">
        Morning answered, but the result could not be displayed.
      </p>
      <p className="mt-1.5 text-sm text-foreground-muted">
        Nothing else on this page is affected. The browser console has the details.
      </p>
    </div>
  );
}

/**
 * Every field that might distinguish one kind of collection from another,
 * listed as `key value` without a reading being put on it.
 */
function Signals({
  row,
  showRawDate,
}: {
  readonly row: PaymentRowView;
  /** True when the date could not be formatted, so the raw value is worth seeing. */
  readonly showRawDate: boolean;
}) {
  const coded: readonly (readonly [string, number | null])[] = [
    ['subType', row.subType],
    ['appType', row.appType],
    ['cardType', row.cardType],
    ['dealType', row.dealType],
  ];

  const present = coded.filter((entry): entry is readonly [string, number] => entry[1] !== null);

  if (!showRawDate && present.length === 0 && row.extras.length === 0 && row.urlFields.length === 0) {
    return <span className="text-foreground-subtle">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* What Morning actually put where a date belongs, so an unreadable one
          can be understood rather than only noticed. */}
      {showRawDate ? <Chip label={`date ${JSON.stringify(row.date)}`} /> : null}
      {present.map(([key, value]) => (
        <Chip key={key} label={`${key} ${value}`} />
      ))}
      {row.extras.map((extra) => (
        <Chip key={extra.key} label={`${extra.key} ${extra.value}`} />
      ))}
      {row.urlFields.map((key) => (
        <Chip key={key} label={`${key} present`} />
      ))}
    </div>
  );
}

function Chip({ label }: { readonly label: string }) {
  return (
    <span
      dir="auto"
      className="inline-block max-w-[16rem] truncate rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-xs text-foreground-muted [unicode-bidi:isolate]"
      title={label}
    >
      {label}
    </span>
  );
}

function IdLine({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (value === null) return null;
  return (
    <span className="block max-w-[14rem] truncate text-xs text-foreground-subtle" title={value}>
      {label} {value}
    </span>
  );
}

function Failure({
  message,
  guidance,
  httpStatus,
}: {
  readonly message: string;
  readonly guidance: string;
  readonly httpStatus: number | null;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
        {/* Morning answers in Hebrew. `dir="auto"` lets the message lay itself
            out by its own first strong character, and isolation stops it
            reordering anything around it. */}
        <span dir="auto" className="[unicode-bidi:isolate]">
          {message}
        </span>
      </p>
      <p className="mt-1.5 pl-6 text-sm text-foreground-muted">{guidance}</p>
      {httpStatus === null ? null : (
        <p className="numeric mt-1.5 pl-6 text-xs text-foreground-subtle">HTTP {httpStatus}</p>
      )}
    </div>
  );
}

function Notice({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
      {children}
    </p>
  );
}

function Th({
  children,
  align = 'right',
}: {
  readonly children: React.ReactNode;
  readonly align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`pb-2 text-xs font-medium text-foreground-subtle ${
        align === 'left' ? 'pr-4 text-left' : 'pr-4 text-right'
      }`}
    >
      {children}
    </th>
  );
}
