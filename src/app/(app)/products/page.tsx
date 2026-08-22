import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Products' };

const UPCOMING: readonly string[] = [
    'Product and variant catalogue synced from Shopify',
    'Landed unit costs with effective-dated cost history',
    'Gross profit and contribution profit per SKU',
];

export default function ProductsPage() {
  return <ModulePlaceholder moduleId="products" upcoming={UPCOMING} />;
}
