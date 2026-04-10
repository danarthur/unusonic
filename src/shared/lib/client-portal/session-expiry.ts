/**
 * Thin TS wrapper around compute_client_session_expiry().
 *
 * Usually you don't need to call this directly — mintClientPortalSession
 * and client_rotate_session_token call it internally. This wrapper exists
 * for type-safe previews and tests that want to know "what TTL would this
 * entity get right now?" without actually minting a session.
 *
 * See client-portal-design.md §14.7.1.
 *
 * @module shared/lib/client-portal/session-expiry
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

/**
 * Compute what expiry a new session for `entityId` would receive right now.
 * Returns the timestamptz result from the Postgres function.
 */
export async function computeClientSessionExpiry(entityId: string): Promise<Date> {
  const supabase = getSystemClient();

  const { data, error } = await supabase.rpc('compute_client_session_expiry', {
    p_entity_id: entityId,
  });

  if (error || data == null) {
    throw new Error(`compute_client_session_expiry failed: ${error?.message ?? 'empty result'}`);
  }

  return new Date(data as unknown as string);
}
