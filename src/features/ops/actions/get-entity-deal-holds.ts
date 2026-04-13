'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface DealHold {
  holdId: string;
  dealId: string;
  role: string | null;
  proposedDate: string | null;
  eventArchetype: string | null;
  acknowledgedAt: string | null;
}

/**
 * Fetch pending deal_crew holds for a person entity.
 * Returns only date, event type, and role — NOT client name, deal value, or venue
 * (information asymmetry per design doc).
 */
export async function getEntityDealHolds(entityId: string): Promise<DealHold[]> {
  const supabase = await createClient();

  // Fetch deal_crew rows that are holds (not declined, not confirmed)
  const { data: rows, error } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, role_note, confirmed_at, declined_at, acknowledged_at')
    .eq('entity_id', entityId)
    .is('declined_at', null)
    .is('confirmed_at', null);

  if (error || !rows || rows.length === 0) return [];

  // Fetch deal info for proposed_date and event_archetype
  const dealIds = [...new Set(rows.map(r => r.deal_id))];
  const { data: deals } = await supabase
    .from('deals')
    .select('id, proposed_date, event_archetype')
    .in('id', dealIds)
    .is('archived_at', null);

  if (!deals || deals.length === 0) return [];

  const dealMap = new Map(deals.map(d => [d.id, d]));

  return rows
    .filter(r => dealMap.has(r.deal_id))
    .map(r => {
      const deal = dealMap.get(r.deal_id)!;
      return {
        holdId: r.id,
        dealId: r.deal_id,
        role: r.role_note,
        proposedDate: (deal.proposed_date as string) ?? null,
        eventArchetype: (deal.event_archetype as string) ?? null,
        acknowledgedAt: r.acknowledged_at,
      };
    })
    .sort((a, b) => {
      if (!a.proposedDate) return 1;
      if (!b.proposedDate) return -1;
      return a.proposedDate.localeCompare(b.proposedDate);
    });
}
