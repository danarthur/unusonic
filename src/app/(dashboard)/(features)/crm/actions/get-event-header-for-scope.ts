'use server';

/**
 * Lightweight event header fetch for the Aion chat scope bar (event variant).
 *
 * Thin wrapper around buildEventScopePrefix that exposes only the UI slice
 * + the freshness fingerprint to the client. The 7-field prompt block stays
 * server-side (the model needs it, the owner doesn't).
 *
 * Workspace validation: the session row's scope_entity_id was pinned at
 * creation time by cortex.resume_or_create_aion_session, which only allows
 * events the caller's workspace membership covers. So by the time the
 * session resolves with a non-null scope_entity_id, the event is already
 * scoped-safe. This action re-verifies via the session client for
 * defense-in-depth — cheaper than a second RPC hop.
 *
 * Design: docs/reference/aion-event-scope-header-design.md §7.2.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  buildEventScopePrefix,
  type EventScopeUi,
} from '@/app/api/aion/lib/build-event-scope-prefix';

export type EventHeaderForScope = {
  ui: EventScopeUi;
  contextFingerprint: string;
  /** Canonical event-studio URL — the "Open →" affordance navigates here. */
  url: string;
};

export async function getEventHeaderForScope(
  eventId: string,
): Promise<EventHeaderForScope | null> {
  if (!eventId) return null;

  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  // Defense-in-depth: confirm the event belongs to the caller's active
  // workspace before we hand the payload back. Uses RLS-aware client so a
  // cross-workspace event id returns null here rather than leaking into the
  // system-client payload below.
  const { data: eventRow } = await supabase
    .schema('ops')
    .from('events')
    .select('id, workspace_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!eventRow) return null;

  const payload = await buildEventScopePrefix(eventId);
  if (!payload.ui) return null;

  return {
    ui: payload.ui,
    contextFingerprint: payload.contextFingerprint,
    url: `/events/g/${encodeURIComponent(eventId)}`,
  };
}
