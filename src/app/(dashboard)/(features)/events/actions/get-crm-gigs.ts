'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { applyActiveEventsFilter } from '@/shared/lib/event-status/get-active-events-filter';
import { computePaymentStatus, paymentStatusLabel, paymentStatusColor } from '@/features/sales/lib/compute-payment-status';
import { resolveCrewConfirmationForDeals } from '@/shared/lib/crew/resolve-crew-confirmation';
import { computeReadiness } from '../lib/compute-readiness';
import type { StreamCardItem } from '../components/stream-card';

/**
 * Fetches the same deals + events the CRM page uses.
 * Used by the client shell so the list is not tied to RSC payloads (avoids list disappearing on tab switch / refetch).
 */
export async function getCrmGigs(): Promise<StreamCardItem[]> {
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();

  const [dealsRes, eventsRes] = await Promise.all([
    // Use the ops.active_deals view so only working deals + won-with-future-
    // events surface on the CRM pipeline card. Past-won deals drop into the
    // /events/archive surface. The view has security_invoker=true so the
    // workspace RLS on the underlying tables still applies — we pre-filter
    // workspace_id for query-plan locality, not as a safety measure.
    // See supabase/migrations/20260423000000_follow_up_p0_schema.sql §6.
    workspaceId
      ? supabase
          .schema('ops')
          .from('active_deals')
          .select('id, title, status, stage_id, proposed_date, organization_id, venue_id, event_archetype, lead_source, owner_entity_id, created_at, show_health')
          .eq('workspace_id', workspaceId)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? applyActiveEventsFilter(
          supabase
            .schema('ops')
            .from('events')
            .select('id, title, starts_at, lifecycle_status, client_entity_id, venue_entity_id, deal_id, created_at')
            .eq('workspace_id', workspaceId)
        )
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Resolve venue + client from deal_stakeholders (source of truth) with fallback to deals columns
  const dealIds = (dealsRes.data ?? []).map((d: Record<string, unknown>) => d.id as string);
  const venueByDealId = new Map<string, string>(); // deal_id → venue org entity ID
  const clientByDealId = new Map<string, string>(); // deal_id → client org entity ID

  // Series metadata per deal — aggregated from ops.events for shows on a
  // series project. Keyed by deal_id so the card renderer doesn't need a
  // second round-trip.
  type SeriesMeta = {
    isSeries: true;
    archetype: string | null;
    activeCount: number;
    firstDate: string | null;
    lastDate: string | null;
    nextUpcoming: string | null;
  };
  const seriesByDealId = new Map<string, SeriesMeta>();

  if (dealIds.length > 0) {
    const { data: seriesProjects } = await supabase
      .schema('ops')
      .from('projects')
      .select('deal_id, is_series, series_archetype')
      .in('deal_id', dealIds)
      .eq('is_series', true);

    const seriesDealIds = new Set<string>(
      ((seriesProjects ?? []) as Array<{ deal_id: string | null }>)
        .map((p) => p.deal_id)
        .filter((id): id is string => typeof id === 'string'),
    );

    if (seriesDealIds.size > 0) {
      // Pull live events for just the series deals (archived_at IS NULL).
      const { data: seriesEvents } = await supabase
        .schema('ops')
        .from('events')
        .select('deal_id, starts_at, archived_at')
        .in('deal_id', [...seriesDealIds])
        .is('archived_at', null);

      const archetypeByDeal = new Map<string, string | null>();
      for (const p of (seriesProjects ?? []) as Array<{ deal_id: string | null; series_archetype: string | null }>) {
        if (p.deal_id) archetypeByDeal.set(p.deal_id, p.series_archetype);
      }

      const today = new Date().toISOString().slice(0, 10);
      const eventsByDeal = new Map<string, string[]>();
      for (const e of (seriesEvents ?? []) as Array<{ deal_id: string | null; starts_at: string | null }>) {
        if (!e.deal_id || !e.starts_at) continue;
        const d = e.starts_at.slice(0, 10);
        const arr = eventsByDeal.get(e.deal_id) ?? [];
        arr.push(d);
        eventsByDeal.set(e.deal_id, arr);
      }

      for (const dealId of seriesDealIds) {
        const dates = (eventsByDeal.get(dealId) ?? []).slice().sort();
        const firstDate = dates[0] ?? null;
        const lastDate = dates[dates.length - 1] ?? null;
        const upcoming = dates.find((d) => d >= today) ?? lastDate ?? null;
        seriesByDealId.set(dealId, {
          isSeries: true,
          archetype: archetypeByDeal.get(dealId) ?? null,
          activeCount: dates.length,
          firstDate,
          lastDate,
          nextUpcoming: upcoming,
        });
      }
    }
  }

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
      supabase
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

  // Build a set of deal IDs so we can filter out events that are already represented by a deal card
  const dealIdSet = new Set(dealIds);

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
    const series = seriesByDealId.get(dealId);
    return {
      id: dealId,
      title: (d.title as string) ?? null,
      status: (d.status as string) ?? null,
      stage_id: (d.stage_id as string) ?? null,
      // For series, surface the next-upcoming show so sorting uses "what's coming next"
      // rather than the first historical show. Singletons and multi-day keep proposed_date.
      event_date: series?.nextUpcoming ?? (d.proposed_date ? String(d.proposed_date) : null),
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
      show_health_status: (d.show_health as Record<string, unknown> | null)?.status as StreamCardItem['show_health_status'] ?? null,
      ...(series
        ? {
            is_series: true as const,
            series_show_count: series.activeCount,
            series_next_upcoming: series.nextUpcoming,
            series_last_date: series.lastDate,
            series_archetype: series.archetype,
          }
        : null),
    };
  });

  // Exclude events whose deal_id matches a deal already in the list — avoids duplicate cards for won deals
  const filteredEvents = (eventsRes.data ?? []).filter((e: Record<string, unknown>) => {
    const eDealId = e.deal_id as string | null;
    return !eDealId || !dealIdSet.has(eDealId);
  });

  const eventGigs: StreamCardItem[] = filteredEvents.map((e: Record<string, unknown>) => ({
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
    const { data: queueItems } = await supabase
      .schema('ops')
      .from('follow_up_queue')
      .select('deal_id, reason, reason_type, priority_score, status, follow_up_category')
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'snoozed']);

    if (queueItems && queueItems.length > 0) {
      const followUpMap = new Map<string, { reason: string; reason_type: string; priority_score: number; status: string; follow_up_category: string }>();
      for (const q of queueItems as { deal_id: string; reason: string; reason_type: string; priority_score: number; status: string; follow_up_category: string }[]) {
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
          gig.followUpCategory = fu.follow_up_category as 'sales' | 'ops' | 'nurture';
          gig.followUpReasonType = fu.reason_type;
        }
      }
    }
  }

  // ── Readiness signals for won deals ──
  // Won deals have an event — batch-fetch event + crew data to compute readiness.
  const wonDealIds = (dealsRes.data ?? [])
    .filter((d: Record<string, unknown>) => d.status === 'won')
    .map((d: Record<string, unknown>) => d.id as string);

  if (wonDealIds.length > 0 && workspaceId) {
    // Find events linked to won deals
    const { data: wonEvents } = await supabase
      .schema('ops')
      .from('events')
      .select('id, deal_id, run_of_show_data')
      .in('deal_id', wonDealIds)
      .eq('workspace_id', workspaceId);

    if (wonEvents && wonEvents.length > 0) {
      const eventByDealId = new Map<string, { id: string; run_of_show_data: Record<string, unknown> | null }>();
      for (const ev of wonEvents) {
        if (ev.deal_id) eventByDealId.set(ev.deal_id as string, { id: ev.id as string, run_of_show_data: ev.run_of_show_data as Record<string, unknown> | null });
      }

      // Batch-resolve crew confirmation counts per deal, overlaying portal
      // (ops.crew_assignments) confirmations on top of ops.deal_crew so
      // portal-confirmed crew is counted correctly on the stream readiness ribbon.
      const wonDealIdsWithEvents = [...eventByDealId.keys()];
      const dealEventPairs = wonDealIdsWithEvents.map((dealId) => ({
        dealId,
        eventId: eventByDealId.get(dealId)!.id,
      }));
      const confirmationByDeal = await resolveCrewConfirmationForDeals(supabase, dealEventPairs);

      type CrewCounts = { assigned: number; confirmed: number; declined: number };
      const crewCountsByDeal = new Map<string, CrewCounts>();
      for (const [dealId, perEntity] of confirmationByDeal) {
        const c: CrewCounts = { assigned: 0, confirmed: 0, declined: 0 };
        for (const state of perEntity.values()) {
          c.assigned++;
          if (state.confirmedAt) c.confirmed++;
          if (state.declinedAt) c.declined++;
        }
        crewCountsByDeal.set(dealId, c);
      }

      // Batch-fetch stakeholders for won deals (venue + client presence)
      const { data: wonStakeholders } = await supabase
        .schema('ops')
        .from('deal_stakeholders')
        .select('deal_id, role')
        .in('deal_id', wonDealIdsWithEvents)
        .in('role', ['venue_contact', 'bill_to']);

      const stakeholderRolesByDeal = new Map<string, Set<string>>();
      for (const s of (wonStakeholders ?? []) as { deal_id: string; role: string }[]) {
        const roles = stakeholderRolesByDeal.get(s.deal_id) ?? new Set();
        roles.add(s.role);
        stakeholderRolesByDeal.set(s.deal_id, roles);
      }

      // Compute readiness for each won deal and attach to gig
      const loadedStatuses = ['loaded', 'on_site', 'returned'];
      for (const gig of gigs) {
        const ev = eventByDealId.get(gig.id);
        if (!ev) continue;
        const ros = ev.run_of_show_data as Record<string, unknown> | null;
        const gearItems = (ros?.gear_items as { status: string }[] | undefined) ?? [];
        const logistics = ros?.logistics as { venue_access_confirmed?: boolean; truck_loaded?: boolean; transport_mode?: string | null } | undefined;
        const crew = crewCountsByDeal.get(gig.id) ?? { assigned: 0, confirmed: 0, declined: 0 };
        const roles = stakeholderRolesByDeal.get(gig.id) ?? new Set<string>();

        gig.readiness = computeReadiness({
          crewAssigned: crew.assigned,
          crewConfirmed: crew.confirmed,
          crewDeclined: crew.declined,
          gearTotal: gearItems.length,
          gearLoaded: gearItems.filter((g) => loadedStatuses.includes(g.status)).length,
          gearAllocatedOnly: gearItems.filter((g) => g.status === 'allocated' || g.status === 'pending').length,
          hasVenueStakeholder: roles.has('venue_contact'),
          venueAccessConfirmed: logistics?.venue_access_confirmed ?? false,
          hasTransportMode: !!(ros?.transport_mode || logistics?.transport_mode),
          truckLoaded: logistics?.truck_loaded ?? false,
          transportMode: (ros?.transport_mode ?? logistics?.transport_mode ?? null) as string | null,
          hasClientStakeholder: roles.has('bill_to'),
        });
      }
    }
  }

  return gigs;
}
