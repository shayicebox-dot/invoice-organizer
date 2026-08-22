import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Expenses' };

const UPCOMING: readonly string[] = [
    'Manual business expenses with attached source documents',
    'Supplier invoices from Israeli invoicing and accounting systems',
    'Fixed vs variable operating expense classification',
    'Deductible input VAT per expense',
];

export default function ExpensesPage() {
  return <ModulePlaceholder moduleId="expenses" upcoming={UPCOMING} />;
}
