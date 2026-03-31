/**
 * Portal Theme Settings — workspace admins select a visual preset for client-facing pages.
 * Phase 3: preset selection with live preview thumbnails.
 * @module app/(dashboard)/settings/portal
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getPortalTheme } from './actions';
import { PortalThemeClient } from './portal-theme-client';

export const metadata = {
  title: 'Portal theme | Settings | Unusonic',
  description: 'Choose the visual theme for your client-facing proposals and invoices.',
};

export const dynamic = 'force-dynamic';

export default async function PortalThemeSettingsPage() {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Suspense fallback={<PortalThemeSkeleton />}>
        <PortalThemeData />
      </Suspense>
    </div>
  );
}

async function PortalThemeData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const theme = await getPortalTheme();

  return (
    <PortalThemeClient
      initialPreset={theme?.preset ?? 'default'}
      initialConfig={theme?.config ?? {}}
    />
  );
}

function PortalThemeSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="h-8 w-56 stage-skeleton rounded-[var(--stage-radius-input)]" />
      <div className="h-4 w-80 stage-skeleton rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] stage-skeleton rounded-xl" />
        ))}
      </div>
    </div>
  );
}
