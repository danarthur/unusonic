'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { computePaymentStatus, paymentStatusLabel, paymentStatusColor } from '@/features/sales/lib/compute-payment-status';
import type { StreamCardItem } from '../components/stream-card';

/**
 * Fetches the same deals + events the CRM page uses.
 * Used by the client shell so the list is not tied to RSC payloads (avoids list disappearing on tab switch / refetch).
 */
export async function getCrmGigs(): Promise<StreamCardItem[]> {
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();

  const [dealsRes, eventsRes] = await Promise.all([
    workspaceId
      ? supabase
          .from('deals')
          .select('id, title, status, proposed_date, organization_id, venue_id, event_archetype, lead_source, owner_entity_id, created_at')
          .eq('workspace_id', workspaceId)
          .is('archived_at', null)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? supabase
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, lifecycle_status, client_entity_id, venue_entity_id, created_at')
          .eq('workspace_id', workspaceId)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Resolve venue + client from deal_stakeholders (source of truth) with fallback to deals columns
  const dealIds = (dealsRes.data ?? []).map((d: Record<string, unknown>) => d.id as string);
  const venueByDealId = new Map<string, string>(); // deal_id → venue org entity ID
  const clientByDealId = new Map<string, string>(); // deal_id → client org entity ID

  // Stakeholders + proposals in parallel (proposals only needs dealIds, not stakeholder results)
  type ProposalPaymentRow = {
    deal_id: string;
    status: string | null;
    signed_at: string | null;
    accepted_at: string | null;
    deposit_percent: number | null;
    deposit_paid_at: string | null;
    deposit_deadline_days: number | null;
    payment_due_days: number | null;
  };
  const proposalByDealId = new Map<string, ProposalPaymentRow>();

  if (dealIds.length > 0) {
    const [stakeholdersRes, proposalsRes] = await Promise.all([
      (supabase as any)
        .schema('ops')
        .from('deal_stakeholders')
        .select('deal_id, role, organization_id')
        .in('deal_id', dealIds)
        .in('role', ['venue_contact', 'bill_to']),
      supabase
        .from('proposals')
        .select('deal_id, status, signed_at, accepted_at, deposit_percent, deposit_paid_at, deposit_deadline_days, payment_due_days')
        .in('deal_id', dealIds)
        .neq('status', 'draft')
        .order('created_at', { ascending: false }),
    ]);

    for (const s of (stakeholdersRes.data ?? []) as { deal_id: string; role: string; organization_id: string | null }[]) {
      if (s.role === 'venue_contact' && s.organization_id) venueByDealId.set(s.deal_id, s.organization_id);
      if (s.role === 'bill_to' && s.organization_id) clientByDealId.set(s.deal_id, s.organization_id);
    }

    for (const p of (proposalsRes.data ?? []) as ProposalPaymentRow[]) {
      if (!proposalByDealId.has(p.deal_id)) proposalByDealId.set(p.deal_id, p);
    }
  }

  // Resolve display names from directory.entities
  const entityIds = new Set<string>();
  for (const d of (dealsRes.data ?? [])) {
    const dealId = d.id as string;
    const clientId = clientByDealId.get(dealId) ?? (d.organization_id as string | null);
    const venueId = venueByDealId.get(dealId) ?? (d.venue_id as string | null);
    const ownerId = d.owner_entity_id as string | null;
    if (clientId) entityIds.add(clientId);
    if (venueId) entityIds.add(venueId);
    if (ownerId) entityIds.add(ownerId);
  }
  for (const e of (eventsRes.data ?? [])) {
    if (e.client_entity_id) entityIds.add(e.client_entity_id as string);
    if (e.venue_entity_id) entityIds.add(e.venue_entity_id as string);
  }
  let entityNameMap = new Map<string, string>();
  if (entityIds.size > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', [...entityIds]);
    entityNameMap = new Map(
      (entities ?? []).map((e) => [e.id as string, (e.display_name as string) ?? ''])
    );
  }

  const dealGigs: StreamCardItem[] = (dealsRes.data ?? []).map((d: Record<string, unknown>) => {
    const dealId = d.id as string;
    const proposal = proposalByDealId.get(dealId);
    const pStatus = proposal
      ? computePaymentStatus({
          proposalStatus: proposal.status,
          signedAt: proposal.signed_at,
          acceptedAt: proposal.accepted_at,
          depositPercent: proposal.deposit_percent,
          depositPaidAt: proposal.deposit_paid_at,
          depositDeadlineDays: proposal.deposit_deadline_days,
          paymentDueDays: proposal.payment_due_days,
          proposedDate: d.proposed_date ? String(d.proposed_date) : null,
        })
      : null;
    // Prefer stakeholder data, fall back to denormalized deal columns
    const venueId = venueByDealId.get(dealId) ?? (d.venue_id as string | null);
    const clientId = clientByDealId.get(dealId) ?? (d.organization_id as string | null);
    const ownerId = d.owner_entity_id as string | null;
    return {
      id: dealId,
      title: (d.title as string) ?? null,
      status: (d.status as string) ?? null,
      event_date: d.proposed_date ? String(d.proposed_date) : null,
      location: venueId ? (entityNameMap.get(venueId) ?? null) : null,
      client_name: clientId ? (entityNameMap.get(clientId) ?? null) : null,
      source: 'deal' as const,
      paymentStatus: pStatus,
      paymentStatusLabel: paymentStatusLabel(pStatus),
      paymentStatusColor: paymentStatusColor(pStatus),
      event_archetype: (d.event_archetype as string) ?? null,
      lead_source: (d.lead_source as string) ?? null,
      owner_name: ownerId ? (entityNameMap.get(ownerId) ?? null) : null,
      created_at: (d.created_at as string) ?? null,
    };
  });

  const eventGigs: StreamCardItem[] = (eventsRes.data ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    title: (e.title as string) ?? null,
    status: null,
    event_date: e.starts_at ? String((e.starts_at as string).slice(0, 10)) : null,
    location: e.venue_entity_id ? (entityNameMap.get(e.venue_entity_id as string) ?? null) : null,
    client_name: e.client_entity_id ? (entityNameMap.get(e.client_entity_id as string) ?? null) : null,
    source: 'event' as const,
    lifecycle_status: (e.lifecycle_status as string) ?? null,
    created_at: (e.created_at as string) ?? null,
  }));

  const gigs: StreamCardItem[] = [...dealGigs, ...eventGigs].sort((a, b) => {
    const da = a.event_date ?? '';
    const db = b.event_date ?? '';
    return da.localeCompare(db);
  });

  // Merge follow-up queue signals into stream items
  if (workspaceId) {
    const { data: queueItems } = await (supabase as any)
      .schema('ops')
      .from('follow_up_queue')
      .select('deal_id, reason, priority_score, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'snoozed']);

    if (queueItems && queueItems.length > 0) {
      const followUpMap = new Map<string, { reason: string; priority_score: number; status: string }>();
      for (const q of queueItems as { deal_id: string; reason: string; priority_score: number; status: string }[]) {
        // Keep highest priority entry per deal
        const existing = followUpMap.get(q.deal_id);
        if (!existing || q.priority_score > existing.priority_score) {
          followUpMap.set(q.deal_id, q);
        }
      }
      for (const gig of gigs) {
        const fu = followUpMap.get(gig.id);
        if (fu) {
          gig.followUpReason = fu.reason;
          gig.followUpPriority = fu.priority_score;
          gig.followUpStatus = fu.status as 'pending' | 'snoozed';
        }
      }
    }
  }

  return gigs;
}
