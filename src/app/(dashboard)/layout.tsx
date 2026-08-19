import { Suspense, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CURRENT_USER } from "@/lib/data/catalog";
import { getOrganization, getStores } from "@/lib/data";

/**
 * Nothing in an authenticated financial dashboard should be statically cached,
 * and the shell reads the store + period selection out of the query string.
 * Rendering on demand keeps the sidebar and filter bar in the server response
 * instead of popping in after hydration.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [organization, stores] = await Promise.all([getOrganization(), getStores()]);

  const storeOptions = stores.map((store) => ({
    id: store.id,
    name: store.name,
    domain: store.domain,
  }));

  return (
    <div className="flex min-h-screen bg-canvas">
      <Suspense
        fallback={<div className="h-screen w-[228px] shrink-0 border-r border-line bg-surface" />}
      >
        <Sidebar />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          stores={storeOptions}
          organizationName={organization.name}
          userName={CURRENT_USER.fullName}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
