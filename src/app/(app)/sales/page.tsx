import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Sales' };

const UPCOMING: readonly string[] = [
    'Orders imported from Shopify, with line items and per-order totals',
    'Gross revenue, discounts, refunds and net revenue by period',
    'Revenue split into VAT-exclusive revenue and output VAT',
    'Sales by channel, by day and by SKU',
];

export default function SalesPage() {
  return <ModulePlaceholder moduleId="sales" upcoming={UPCOMING} />;
}
