import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'VAT' };

const UPCOMING: readonly string[] = [
    'Output VAT collected on sales',
    'Deductible input VAT from expenses, ad spend and supplier invoices',
    'Estimated VAT payable per Israeli reporting period',
    'Zero-rated and exempt transaction handling',
];

export default function VatPage() {
  return <ModulePlaceholder moduleId="vat" upcoming={UPCOMING} />;
}
