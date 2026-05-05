'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

// =============================================================================
// Types
// =============================================================================

export type CrewDecisionData = {
  entityId: string;
  availability: 'available' | 'conflict' | 'blackout' | 'unknown';
  conflictEventName: string | null;
  dayRate: number | null;
  skillMatchScore: number; // 0-100
  pastShowCount: number;
  lastShowDate: string | null;
};

// =============================================================================
// getCrewDecisionData
// Batch-fetches decision enrichment for a list of crew candidate entity IDs.
// Returns one CrewDecisionData per entity (defaults for missing data).
// =============================================================================

export async function getCrewDecisionData(
  entityIds: string[],
  eventDate: string | null,
  roleHint: string | null,
  workspaceId: string,
): Promise<CrewDecisionData[]> {
  // ── Validate ───────────────────────────────────────────────────────────────
  const parsed = z
    .object({
      entityIds: z.array(z.string().uuid()).min(1).max(50),
      eventDate: z.string().nullable(),
      roleHint: z.string().nullable(),
      workspaceId: z.string().uuid(),
    })
    .safeParse({ entityIds, eventDate, roleHint, workspaceId });

  if (!parsed.success) return [];

  // Verify caller belongs to this workspace
  const activeWs = await getActiveWorkspaceId();
  if (!activeWs || activeWs !== workspaceId) return [];

  try {
    const supabase = await createClient();

    // ── 1. Past shows: count distinct deal_ids + latest event date ──────────
    const pastShowMap = new Map<string, { count: number; lastDate: string | null }>();

    const { data: crewHistory } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id, deal_id')
      .in('entity_id', entityIds)
      .eq('workspace_id', workspaceId);

    if (crewHistory?.length) {
      // Group by entity_id → Set of deal_ids
      const dealsByEntity = new Map<string, Set<string>>();
      for (const row of crewHistory as { entity_id: string; deal_id: string }[]) {
        const set = dealsByEntity.get(row.entity_id) ?? new Set();
        set.add(row.deal_id);
        dealsByEntity.set(row.entity_id, set);
      }

      // Collect all unique deal_ids to resolve latest event date
      const allDealIds = [...new Set((crewHistory as { deal_id: string }[]).map((r) => r.deal_id))];

      // Get proposed_date for each deal
      const { data: deals } = await supabase
        .from('deals')
        .select('id, proposed_date')
        .in('id', allDealIds)
        .eq('workspace_id', workspaceId);

      const dealDateMap = new Map<string, string | null>();
      for (const d of (deals ?? []) as { id: string; proposed_date: string | null }[]) {
        dealDateMap.set(d.id, d.proposed_date);
      }

      for (const [eid, dealIdSet] of dealsByEntity) {
        let latestDate: string | null = null;
        for (const did of dealIdSet) {
          const dd = dealDateMap.get(did);
          if (dd && (!latestDate || dd > latestDate)) latestDate = dd;
        }
        pastShowMap.set(eid, { count: dealIdSet.size, lastDate: latestDate });
      }
    }

    // ── 2. Availability: conflict check against eventDate ──────────────────
    const availabilityMap = new Map<
      string,
      { status: 'available' | 'conflict' | 'blackout' | 'unknown'; conflictName: string | null }
    >();

    if (eventDate) {
      // 2a. Check blackouts from entity attributes
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, attributes')
        .in('id', entityIds);

      if (entities) {
        for (const ent of entities as { id: string; attributes: Record<string, unknown> | null }[]) {
          const attrs = readEntityAttrs(ent.attributes, 'person');
          for (const range of attrs.availability_blackouts) {
            if (eventDate >= range.start && eventDate <= range.end) {
              availabilityMap.set(ent.id, { status: 'blackout', conflictName: 'Unavailable (blackout)' });
              break;
            }
          }
        }
      }

      // 2b. Check event bookings from crew_assignments
      const dateStart = `${eventDate}T00:00:00`;
      const dateEnd = `${eventDate}T23:59:59`;
      const { data: eventBookings } = await supabase
        .schema('ops')
        .from('crew_assignments')
        .select('entity_id, role, event:events!inner(title, starts_at, ends_at)')
        .in('entity_id', entityIds)
        .in('status', ['confirmed', 'dispatched'])
        .lte('events.starts_at', dateEnd)
        .gte('events.ends_at', dateStart);

      if (eventBookings) {
        // `event:events!inner(...)` returns `event` as an array in narrowed
        // types even with !inner, because the typegen can't prove cardinality
        // from FK metadata alone. We know there's at least one row per match
        // (that's what !inner guarantees), so read the first element.
        for (const b of eventBookings) {
          if (!availabilityMap.has(b.entity_id)) {
            const eventRow = Array.isArray(b.event) ? b.event[0] : b.event;
            availabilityMap.set(b.entity_id, {
              status: 'conflict',
              conflictName: eventRow?.title ?? 'another event',
            });
          }
        }
      }

      // 2c. Check deal holds on same date
      const { data: otherCrew } = await supabase
        .schema('ops')
        .from('deal_crew')
        .select('entity_id, deal_id')
        .in('entity_id', entityIds)
        .eq('workspace_id', workspaceId);

      if (otherCrew?.length) {
        const otherDealIds = [
          ...new Set((otherCrew as { deal_id: string }[]).map((r) => r.deal_id)),
        ];

        const { data: conflictDeals } = await supabase
          .from('deals')
          .select('id, title, proposed_date')
          .in('id', otherDealIds)
          .eq('proposed_date', eventDate)
          .eq('workspace_id', workspaceId)
          .is('archived_at', null);

        const conflictDealIds = new Set(
          ((conflictDeals ?? []) as { id: string }[]).map((d) => d.id),
        );
        const conflictTitleMap = new Map(
          ((conflictDeals ?? []) as { id: string; title: string | null }[]).map((d) => [
            d.id,
            d.title,
          ]),
        );

        for (const row of otherCrew as { entity_id: string; deal_id: string }[]) {
          if (!availabilityMap.has(row.entity_id) && conflictDealIds.has(row.deal_id)) {
            availabilityMap.set(row.entity_id, {
              status: 'conflict',
              conflictName: conflictTitleMap.get(row.deal_id) ?? 'another show',
            });
          }
        }
      }

      // Mark remaining as available
      for (const eid of entityIds) {
        if (!availabilityMap.has(eid)) {
          availabilityMap.set(eid, { status: 'available', conflictName: null });
        }
      }
    } else {
      // No event date — unknown availability
      for (const eid of entityIds) {
        availabilityMap.set(eid, { status: 'unknown', conflictName: null });
      }
    }

    // ── 3. Day rate + skill match from ops.crew_skills ─────────────────────
    const rateMap = new Map<string, number | null>();
    const skillScoreMap = new Map<string, number>();

    const { data: skillRows } = await supabase
      .schema('ops')
      .from('crew_skills')
      .select('entity_id, skill_tag, hourly_rate')
      .in('entity_id', entityIds)
      .eq('workspace_id', workspaceId);

    if (skillRows?.length) {
      const roleLower = roleHint?.trim().toLowerCase() ?? '';
      // Group skills by entity
      const skillsByEntity = new Map<
        string,
        { tag: string; rate: number | null }[]
      >();
      for (const row of skillRows as {
        entity_id: string;
        skill_tag: string;
        hourly_rate: number | null;
      }[]) {
        const list = skillsByEntity.get(row.entity_id) ?? [];
        list.push({ tag: row.skill_tag, rate: row.hourly_rate });
        skillsByEntity.set(row.entity_id, list);
      }

      for (const [eid, skills] of skillsByEntity) {
        // Day rate: prefer matching skill's rate, else first non-null
        let rate: number | null = null;
        if (roleLower) {
          const matchingSkill = skills.find(
            (s) => s.tag.toLowerCase() === roleLower,
          );
          if (matchingSkill?.rate != null) {
            rate = matchingSkill.rate;
          }
        }
        if (rate == null) {
          const withRate = skills.find((s) => s.rate != null);
          if (withRate) rate = withRate.rate;
        }
        rateMap.set(eid, rate);

        // Skill match score
        if (roleLower) {
          const tags = skills.map((s) => s.tag.toLowerCase());
          if (tags.includes(roleLower)) {
            skillScoreMap.set(eid, 100);
          } else if (tags.some((t) => t.includes(roleLower) || roleLower.includes(t))) {
            skillScoreMap.set(eid, 50);
          } else {
            skillScoreMap.set(eid, 0);
          }
        } else {
          skillScoreMap.set(eid, 0);
        }
      }
    }

    // ── 4. Assemble results ────────────────────────────────────────────────
    return entityIds.map((eid) => {
      const past = pastShowMap.get(eid);
      const avail = availabilityMap.get(eid);
      return {
        entityId: eid,
        availability: avail?.status ?? 'unknown',
        conflictEventName: avail?.conflictName ?? null,
        dayRate: rateMap.get(eid) ?? null,
        skillMatchScore: skillScoreMap.get(eid) ?? 0,
        pastShowCount: past?.count ?? 0,
        lastShowDate: past?.lastDate ?? null,
      };
    });
  } catch (err) {
    console.error('[getCrewDecisionData] Failed:', err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewDecisionData' } });
    return [];
  }
}
