'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';
import { VENUE_ATTR } from '@/features/network-data/model/attribute-keys';

export type UpdateEventVenueResult = { success: true } | { success: false; error: string };

/**
 * Links (or unlinks) a directory.entities venue to an ops.events row.
 * Pass null to clear the venue.
 */
export async function updateEventVenue(
  eventId: string,
  venueEntityId: string | null,
): Promise<UpdateEventVenueResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  let venue_name: string | null = null;
  let venue_address: string | null = null;

  if (venueEntityId) {
    const { data: entity } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name, attributes')
      .eq('id', venueEntityId)
      .maybeSingle();
    if (entity) {
      const v = entity as { display_name?: string | null; attributes?: Record<string, unknown> | null };
      venue_name = v.display_name ?? null;
      const attrs = (v.attributes as Record<string, unknown>) ?? {};
      const composed = [
        attrs[VENUE_ATTR.street],
        attrs[VENUE_ATTR.city],
        attrs[VENUE_ATTR.state],
        attrs[VENUE_ATTR.postal_code],
      ].filter(Boolean).join(', ') || null;
      venue_address = (attrs[VENUE_ATTR.formatted_address] as string | null) ?? composed;
    }
  }

  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ venue_entity_id: venueEntityId, venue_name, venue_address })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] updateEventVenue:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/crm');
  revalidatePath('/calendar');
  return { success: true };
}
