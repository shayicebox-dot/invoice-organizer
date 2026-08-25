import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { reportingPeriod } from '@/lib/utils/reporting-period';

export const metadata: Metadata = { title: 'Expenses' };

/** The period picker reads the URL, so this page cannot be prerendered. */
export const dynamic = 'force-dynamic';

const UPCOMING: readonly string[] = [
  'Manual business expenses with attached source documents',
  'Supplier invoices from Israeli invoicing and accounting systems',
  'Fixed vs variable operating expense classification',
  'Deductible input VAT per expense',
];

type ExpensesPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Expenses has no data source yet, so it reports nothing. It still carries the
 * period picker: the selected range has to survive a visit here, or navigating
 * through Expenses would silently reset the dates every other screen is using.
 */
export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const { range, preset, today } = reportingPeriod(await searchParams);

  return (
    <ModulePlaceholder
      moduleId="expenses"
      upcoming={UPCOMING}
      actions={
        <DateRangePicker range={range} preset={preset} today={today} basePath="/expenses" />
      }
    />
  );
}
