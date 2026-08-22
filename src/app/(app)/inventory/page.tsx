import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Inventory' };

const UPCOMING: readonly string[] = [
    'Stock on hand per SKU and location',
    'Inventory valuation at cost for the balance sheet',
    'Cost of goods movement feeding COGS',
];

export default function InventoryPage() {
  return <ModulePlaceholder moduleId="inventory" upcoming={UPCOMING} />;
}
