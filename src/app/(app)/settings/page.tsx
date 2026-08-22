import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Settings' };

const UPCOMING: readonly string[] = [
    'Business profile, fiscal year and VAT registration details',
    'VAT rate history with effective dates',
    'Data source connections and sync status',
    'Users, roles and access control',
];

export default function SettingsPage() {
  return <ModulePlaceholder moduleId="settings" upcoming={UPCOMING} />;
}
