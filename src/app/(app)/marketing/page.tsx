import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Marketing' };

const UPCOMING: readonly string[] = [
    'Meta Ads spend, imported daily at campaign level',
    'Google Ads spend, imported daily at campaign level',
    'Total marketing spend against contribution profit',
    'Input VAT on ad invoices where deductible',
];

export default function MarketingPage() {
  return <ModulePlaceholder moduleId="marketing" upcoming={UPCOMING} />;
}
