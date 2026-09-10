'use server';

/**
 * Keep `deals.main_contact_id` pointing at the deal's primary host.
 *
 * The column has five readers and had no writer. It was NULL on every deal in
 * production, which meant:
 *
 *   - the employee portal's pipeline showed no client name,
 *   - a crew member's gig detail showed no client name,
 *   - Aion could not resolve a client name or match a deal by its client.
 *
 * Aion's lookup even carries a comment about this — "wedding deals typically
 * store the client on main_contact_id, so organization-only resolution left
 * client_name=null on ~half of deals" — and a fallback that was written for
 * exactly this and never fired, because the column it falls back to was empty
 * too.
 *
 * `organization_id` covers company clients. This is its counterpart for the
 * ones who are people: the primary host, which is already the flag that decides
 * which of two partners the deal is filed under.
 *
 * Deliberately never clears a value it did not set the meaning of. A deal with
 * no host stakeholder keeps whatever it has.
 *
 * @module app/events/actions/sync-deal-main-contact
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type SyncMainContactResult = { ok: true; entityId: string | null } | { ok: false; error: string };

export async function syncDealMainContact(dealId: string): Promise<SyncMainContactResult> {
  if (!dealId) return { ok: false, error: 'No deal given.' };

  const supabase = await createClient();

  // Primary first, then whatever host was added first -- a deal created before
  // anything set is_primary still has a first host, and that is the client.
  const { data: hosts } = await supabase
    .schema('ops').from('deal_stakeholders')
    .select('entity_id, is_primary, display_order, added_at')
    .eq('deal_id', dealId)
    .eq('role', 'host')
    .order('is_primary', { ascending: false })
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('added_at', { ascending: true })
    .limit(1);

  const entityId = hosts?.[0]?.entity_id ?? null;
  if (!entityId) return { ok: true, entityId: null };

  const { error } = await supabase
    .from('deals')
    .update({ main_contact_id: entityId })
    .eq('id', dealId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, entityId };
}
