import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Taxes' };

const UPCOMING: readonly string[] = [
    'Estimated income or corporate tax on operating profit',
    'Advance payment (mikdamot) tracking',
    'Estimated net profit after tax',
];

export default function TaxesPage() {
  return <ModulePlaceholder moduleId="taxes" upcoming={UPCOMING} />;
}
