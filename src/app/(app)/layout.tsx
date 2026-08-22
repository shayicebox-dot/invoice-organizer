import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function AppGroupLayout({ children }: { readonly children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
