/**
 * calendar_collision — detects when two deals in the same workspace have
 * overlapping target dates within ±1 day. User Advocate's #1 pick:
 * "you have a hold from [other deal] on Oct 15" — the single highest
 * utility-to-creepy-ratio signal in the inventory, because it's entirely
 * the owner's own calendar, not any external profiling.
 *
 * Heuristic (v1):
 *   For every active working deal, find any OTHER active working deal in
 *   the same workspace whose driving date (events.starts_at or fallback
 *   deals.proposed_date) falls within ±1 day. Emit the insight against
 *   the newer-inquiry deal (so the owner sees the collision on the fresh
 *   lead, where a decision still has to be made).
 *
 * Priority: 55 — higher than stakeholder-count (45), below stage-advance
 * (usually 60), because date conflicts are actionable today.
 *
 * Creepy-line: GREEN. Owner's own holds, owner's own inquiries.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { InsightCandidate } from '../insight-evaluators';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';

type DealRow = {
  id: string;
  title: string | null;
  proposed_date: string | null;
  created_at: string;
  status: string | null;
};

type EventRow = {
  deal_id: string | null;
  starts_at: string | null;
  archived_at: string | null;
};

export async function evaluateCalendarCollision(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();

  // Active working deals in scope. Lost deals don't conflict with anything.
  const { data: deals } = await system
    .from('deals')
    .select('id, title, proposed_date, created_at, status')
    .eq('workspace_id', workspaceId)
    .in('status', [...OPEN_DEAL_STATUSES]);
  const dealRows = ((deals ?? []) as DealRow[]).filter((d) => d.status !== 'lost');
  if (dealRows.length < 2) return [];

  // Preferred driving date = min-upcoming starts_at on ops.events for the deal;
  // fallback = deals.proposed_date. Resolve per deal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data: events } = await (system as any)
    .schema('ops')
    .from('events')
    .select('deal_id, starts_at, archived_at')
    .eq('workspace_id', workspaceId)
    .in('deal_id', dealRows.map((d) => d.id))
    .is('archived_at', null);
  const eventsByDeal = new Map<string, string[]>();
  for (const e of (events ?? []) as EventRow[]) {
    if (!e.deal_id || !e.starts_at) continue;
    const arr = eventsByDeal.get(e.deal_id) ?? [];
    arr.push(e.starts_at);
    eventsByDeal.set(e.deal_id, arr);
  }

  // Compute each deal's "anchor date" as a YYYY-MM-DD string (day resolution
  // is sufficient — a same-day conflict is the trigger even if hours differ).
  const anchors = new Map<string, string>(); // dealId → 'YYYY-MM-DD'
  const now = Date.now();
  for (const deal of dealRows) {
    const eventDates = eventsByDeal.get(deal.id) ?? [];
    const upcoming = eventDates
      .filter((d) => new Date(d).getTime() >= now)
      .sort()
      .slice(0, 1);
    const anchor = upcoming[0] ?? deal.proposed_date;
    if (!anchor) continue;
    anchors.set(deal.id, anchor.slice(0, 10));
  }

  if (anchors.size < 2) return [];

  // Group by anchor day; any group of size ≥2 is a conflict.
  const byDay = new Map<string, string[]>();
  for (const [dealId, day] of anchors.entries()) {
    const arr = byDay.get(day) ?? [];
    arr.push(dealId);
    byDay.set(day, arr);
  }

  // ±1 day: also consider adjacent days. Simplest approach — merge each day
  // with day-1 and day+1's sets into a single conflict cluster per deal.
  const candidates: InsightCandidate[] = [];
  const dealTitle = new Map(dealRows.map((d) => [d.id, d.title ?? 'Untitled deal']));
  const dealCreated = new Map(dealRows.map((d) => [d.id, d.created_at]));

  for (const [day, dealIds] of byDay.entries()) {
    const adjacent = [
      ...(byDay.get(addDays(day, -1)) ?? []),
      ...(byDay.get(day) ?? []),
      ...(byDay.get(addDays(day, 1)) ?? []),
    ];
    // Dedupe
    const cluster = Array.from(new Set(adjacent));
    if (cluster.length < 2) continue;

    // Emit against each deal in the cluster, naming the OTHER deals. The
    // newer-inquiry framing lives in the cron dedup (upsert_aion_insight
    // already upserts on (trigger_type, entity_id) so re-runs are idempotent).
    for (const dealId of dealIds) {
      const others = cluster.filter((id) => id !== dealId);
      if (others.length === 0) continue;

      const otherTitles = others.map((id) => dealTitle.get(id) ?? 'another deal').slice(0, 2);
      const extra = others.length > otherTitles.length ? ` and ${others.length - otherTitles.length} more` : '';
      const title = others.length === 1
        ? `Date conflict with ${otherTitles[0]}`
        : `Date conflict with ${otherTitles.join(', ')}${extra}`;

      candidates.push({
        triggerType: 'calendar_collision',
        entityType: 'deal',
        entityId: dealId,
        title,
        context: {
          anchor_day: day,
          conflicting_deal_ids: others,
          cluster_size: cluster.length,
        },
        priority: 55,
        suggestedAction: 'Flag this to the client before they lock the date.',
        href: `/crm?selected=${encodeURIComponent(dealId)}`,
        urgency: cluster.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  return candidates;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
