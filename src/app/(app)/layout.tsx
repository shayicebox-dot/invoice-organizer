import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { LogoutButton } from '@/components/auth/logout-button';

export default function AppGroupLayout({ children }: { readonly children: ReactNode }) {
  return <AppShell logoutSlot={<LogoutButton />}>{children}</AppShell>;
}
