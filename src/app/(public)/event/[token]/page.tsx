/**
 * Public Client Event Page
 * Route: /event/[token] — no auth, no AppShell.
 * Shows the day-of timeline and client details for the event.
 * Workspace-branded via PortalThemeShell.
 */

import { notFound } from 'next/navigation';
import { getPublicEvent } from '@/features/ops/api/get-public-event';
import { PortalThemeShell } from '@/shared/ui/portal-theme-shell';
import { resolvePortalTheme, type PortalThemeConfig } from '@/shared/lib/portal-theme';
import { PublicEventView } from './public-event-view';

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPublicEvent(token);

  if (!data) {
    notFound();
  }

  const themeConfig = data.workspace.portalThemeConfig as PortalThemeConfig | null;

  return (
    <PortalThemeShell
      preset={data.workspace.portalThemePreset}
      config={themeConfig}
    >
      <PublicEventView data={data} />
    </PortalThemeShell>
  );
}
