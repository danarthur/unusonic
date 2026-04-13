/**
 * Client portal Songs page.
 *
 * Route: /client/songs
 *
 * Server component:
 *   1. Resolves the portal session context
 *   2. Calls getClientSongsPageData(entityId) which runs the archetype
 *      gate (§0 A9), picks the relevant event, reads the JSONB, and
 *      returns a client-safe projection (or null for 404)
 *   3. Hands data to the ClientSongsPanel client component for the
 *      interactive list + mutation UI
 *
 * Returns notFound() for:
 *   - No session (proxy should have caught this first, but defense in depth)
 *   - No event on the entity
 *   - Non-musical event archetype (corporate, conference, concert, festival)
 *
 * See Songs design doc §11 for the layout spec and §0 A9 for the
 * archetype gate rationale.
 *
 * @module app/(client-portal)/client/songs/page
 */
import 'server-only';

import { notFound } from 'next/navigation';

import { getClientPortalContext } from '@/shared/lib/client-portal';
import { getClientSongsPageData } from '@/features/client-portal/api/get-client-songs-page-data';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { ClientSongsPanel } from '@/features/client-portal/ui/client-songs-panel';

export default async function ClientSongsPage() {
  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) {
    notFound();
  }

  const data = await getClientSongsPageData(context.activeEntity.id);
  if (!data) {
    // Archetype gate closed (non-musical event) OR no relevant event.
    // Either way, the page shouldn't render for this client.
    notFound();
  }

  return (
    <ClientPortalShell
      workspace={data.workspace}
      header={<ClientPortalHeader workspace={data.workspace} />}
      footer={<ClientPortalFooter />}
    >
      <ClientSongsPanel
        eventId={data.event.id}
        initialRequests={data.requests}
        lock={{
          locked: data.lock.locked,
          reason: data.lock.reason as 'show_live' | 'completed' | 'cancelled' | 'archived' | null,
        }}
        cap={data.cap}
        dj={data.dj}
      />
    </ClientPortalShell>
  );
}
