'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AvailabilityConflict = {
  type: 'event' | 'deal' | 'blackout';
  label: string;
};

export type AvailabilityStatus = 'available' | 'blackout' | 'held' | 'acknowledged' | 'booked';

export type CrewAvailabilityResult = {
  status: AvailabilityStatus;
  conflicts: AvailabilityConflict[];
};

// ─── Action ──────────────────────────────────────────────────────────────────

/**
 * Check crew availability for a single entity on a single date.
 *
 * Reads three data sources:
 * 1. Self-reported blackouts (directory.entities.attributes.availability_blackouts)
 * 2. Hard bookings (ops.crew_assignments joined to ops.events)
 * 3. Soft holds from deals (ops.deal_crew joined to public.deals)
 *
 * Status priority: blackout > booked > held > available.
 *
 * @param entityId - The directory entity to check
 * @param date - YYYY-MM-DD date string
 * @param excludeDealId - Optional deal ID to exclude (so a deal doesn't flag itself)
 */
export async function checkCrewAvailability(
  entityId: string,
  date: string,
  excludeDealId?: string | null,
  excludeEventId?: string | null,
): Promise<CrewAvailabilityResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { status: 'available', conflicts: [] };
  }

  const supabase = await createClient();
  const conflicts: AvailabilityConflict[] = [];

  // ── 1. Blackouts ─────────────────────────────────────────────────────────
  // Read entity attributes and check availability_blackouts array
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('id', entityId)
    .maybeSingle();

  if (entity) {
    const attrs = readEntityAttrs(
      (entity as { attributes: unknown }).attributes,
      'person',
    );
    const blackouts = attrs.availability_blackouts ?? [];
    for (const range of blackouts) {
      if (date >= range.start && date <= range.end) {
        const label =
          range.start === range.end
            ? `Blackout: ${range.start}`
            : `Blackout: ${range.start} — ${range.end}`;
        conflicts.push({ type: 'blackout', label });
      }
    }
  }

  // ── 2. Event bookings ────────────────────────────────────────────────────
  // Query crew_assignments joined to events where the date overlaps.
  // We check: event starts_at date <= target date AND event ends_at date >= target date.
  // For single-day events without ends_at, check starts_at date matches.
  const dateStart = `${date}T00:00:00`;
  const dateEnd = `${date}T23:59:59`;

  const { data: eventBookings } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, role, status, event:events!inner(id, title, starts_at, ends_at)')
    .eq('entity_id', entityId)
    .in('status', ['confirmed', 'dispatched'])
    .lte('events.starts_at', dateEnd)
    .gte('events.ends_at', dateStart);

  if (eventBookings && Array.isArray(eventBookings)) {
    for (const booking of eventBookings) {
      // `event:events!inner(...)` narrows to an array shape (typegen can't
      // prove 1:1 cardinality from FK alone). `!inner` guarantees at least one.
      const eventRow = Array.isArray(booking.event) ? booking.event[0] : booking.event;
      // Skip the event we're currently looking at — otherwise post-handoff
      // shows flag themselves as conflicts in the Crew Hub detail rail.
      if (excludeEventId && eventRow?.id === excludeEventId) continue;
      const eventTitle = eventRow?.title ?? 'Untitled event';
      const role = booking.role ? ` · ${booking.role}` : '';
      conflicts.push({
        type: 'event',
        label: `${eventTitle}${role}`,
      });
    }
  }

  // ── 3. Deal holds ────────────────────────────────────────────────────────
  // Query deal_crew rows for this entity, joined to deals on proposed_date.
  // Exclude the current deal if provided.
  const { data: dealCrewRows } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, confirmed_at, declined_at, acknowledged_at')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .is('declined_at', null);

  if (dealCrewRows && Array.isArray(dealCrewRows)) {
    // Filter to only rows on other deals, then check if those deals have the matching proposed_date
    const otherDealIds = (dealCrewRows as { id: string; deal_id: string; confirmed_at: string | null; declined_at: string | null; acknowledged_at: string | null }[])
      .filter((r) => r.deal_id !== excludeDealId)
      .map((r) => r.deal_id);

    const uniqueDealIds = [...new Set(otherDealIds)];

    if (uniqueDealIds.length > 0) {
      const { data: matchingDeals } = await supabase
        .from('deals')
        .select('id, title, proposed_date')
        .in('id', uniqueDealIds)
        .eq('proposed_date', date)
        .eq('workspace_id', workspaceId)
        .is('archived_at', null);

      if (matchingDeals && Array.isArray(matchingDeals)) {
        const matchingDealIds = new Set(
          (matchingDeals as { id: string; title: string | null; proposed_date: string }[]).map((d) => d.id),
        );
        const dealTitleMap = new Map(
          (matchingDeals as { id: string; title: string | null }[]).map((d) => [d.id, d.title]),
        );

        for (const row of dealCrewRows as {
          id: string;
          deal_id: string;
          confirmed_at: string | null;
          acknowledged_at: string | null;
        }[]) {
          if (row.deal_id === excludeDealId) continue;
          if (!matchingDealIds.has(row.deal_id)) continue;

          const dealTitle = dealTitleMap.get(row.deal_id) ?? 'Untitled deal';
          // TODO(Pass 3 Phase 1 follow-up): reads deal_crew.confirmed_at
          // directly to label cross-deal conflicts. Phase 1's mirror makes
          // this "confirmed" label reflect portal confirmations via the
          // deal_crew side, but any direct crew_assignments writes bypass
          // the mirror and wouldn't surface here. Cosmetic; the availability
          // conflict is still detected even if the label is imprecise.
          const suffix = row.confirmed_at
            ? ' (confirmed)'
            : row.acknowledged_at
              ? ' (acknowledged)'
              : ' (hold)';
          conflicts.push({
            type: 'deal',
            label: `${dealTitle}${suffix}`,
          });
        }
      }
    }
  }

  // ── Resolve status ───────────────────────────────────────────────────────
  // Priority: blackout > booked > held > acknowledged > available
  const hasBlackout = conflicts.some((c) => c.type === 'blackout');
  const hasEventBooking = conflicts.some((c) => c.type === 'event');
  const hasConfirmedDeal = conflicts.some(
    (c) => c.type === 'deal' && c.label.endsWith('(confirmed)'),
  );
  const hasHeldDeal = conflicts.some(
    (c) => c.type === 'deal' && c.label.endsWith('(hold)'),
  );
  const hasAcknowledgedDeal = conflicts.some(
    (c) => c.type === 'deal' && c.label.endsWith('(acknowledged)'),
  );

  let status: AvailabilityStatus = 'available';
  if (hasBlackout) {
    status = 'blackout';
  } else if (hasEventBooking || hasConfirmedDeal) {
    status = 'booked';
  } else if (hasHeldDeal) {
    status = 'held';
  } else if (hasAcknowledgedDeal) {
    status = 'acknowledged';
  }

  return { status, conflicts };
}
