'use server';

/**
 * Seed cortex.memory with a factual deal narrative at handoff time.
 *
 * Called fire-and-forget from handoverDeal after event creation. Reads the
 * deal + accepted proposal + crew + venue facts via service role (handover
 * runs under authenticated user but narrative persists through a system
 * ingestion path), composes a short structural prose block, and upserts into
 * cortex.memory via the narrative-writer helper.
 *
 * A failure here is non-fatal — the handoff still succeeded; the narrative
 * row just won't exist, and DealNarrativeStrip will render nothing. A
 * follow-up Aion update_narrative call will fill it in from user input.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  composeHandoffNarrative,
  writeDealNarrative,
} from '@/app/api/aion/lib/narrative-writer';

export async function seedHandoffNarrative(params: {
  dealId:      string;
  workspaceId: string;
  eventId:     string;
}): Promise<void> {
  const { dealId, workspaceId, eventId } = params;
  const system = getSystemClient();

  // Deal facts — title, event archetype, proposed date, organization_id.
  const { data: deal } = await system
    .from('deals')
    .select('title, event_archetype, proposed_date, organization_id, main_contact_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal) return; // Handoff finished but deal row disappeared — give up quietly.

  // Client name: prefer organization display name, fall back to main contact.
  let clientName: string | null = null;
  const clientEntityId =
    (deal as { organization_id?: string | null }).organization_id ??
    (deal as { main_contact_id?: string | null }).main_contact_id ??
    null;
  if (clientEntityId) {
    const { data: entity } = await system
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', clientEntityId)
      .eq('owner_workspace_id', workspaceId)
      .maybeSingle();
    clientName = (entity as { display_name?: string | null } | null)?.display_name ?? null;
  }

  // Venue name from the event (handover wrote venue_entity_id + location_name).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema varies by PostgREST exposure
  const eventsClient = system.schema('ops');
  const { data: event } = await eventsClient
    .from('events')
    .select('location_name')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const venueName: string | null =
    (event as { location_name?: string | null } | null)?.location_name ?? null;

  // Accepted proposal total (cents) — reuse existing finance.proposals shape.
  const { data: proposal } = await system
    .from('proposals')
    .select('accepted_total_cents, deposit_amount_cents')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const acceptedTotal =
    (proposal as { accepted_total_cents?: number | null } | null)?.accepted_total_cents ?? null;
  const depositAmount =
    (proposal as { deposit_amount_cents?: number | null } | null)?.deposit_amount_cents ?? null;

  // Crew count via ops.deal_crew.
  const { count: crewCount } = await eventsClient
    .from('deal_crew')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId);

  const narrative = composeHandoffNarrative({
    clientName,
    eventType:     (deal as { event_archetype?: string | null }).event_archetype ?? null,
    venueName,
    eventDateISO:  (deal as { proposed_date?: string | null }).proposed_date ?? null,
    acceptedTotal,
    depositAmount,
    crewCount:     typeof crewCount === 'number' ? crewCount : null,
  });

  await writeDealNarrative({
    workspaceId,
    dealId,
    narrative,
    author: { kind: 'system', subsystem: 'handoff' },
  });
}
