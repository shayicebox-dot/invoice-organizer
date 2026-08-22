import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Cash Flow' };

const UPCOMING: readonly string[] = [
    'Cash received from payment processors, net of fees',
    'Cash paid out for inventory, marketing and operating expenses',
    'Opening and closing cash position per period',
];

export default function CashFlowPage() {
  return <ModulePlaceholder moduleId="cash-flow" upcoming={UPCOMING} />;
}
