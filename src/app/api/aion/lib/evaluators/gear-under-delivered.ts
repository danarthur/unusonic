/**
 * gear_under_delivered — upcoming shows whose proposal moved after gear sync.
 *
 * Phase 5 of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5 Phase 5).
 *
 * Heuristic: for each event starting in the next 7 days, compare the most
 * recent `proposal_items.updated_at` against the most recent
 * `event_gear_items.created_at` (for proposal-anchored rows). When the
 * proposal has moved AFTER the last gear sync, the gear card is likely
 * out of sync — surface in the daily brief so the PM accepts/rejects the
 * drift before load-in.
 *
 * Coarser than getGearDriftForEvent (which runs the full plan logic) — the
 * evaluator can't easily call into that today because the action is
 * cookie-session-scoped. The brief points the PM at the deal; the in-page
 * drift ribbon (Phase 3b) gives the per-line accept/reject affordance.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { InsightCandidate } from '../insight-evaluators';

const LOOKAHEAD_DAYS = 7;

type SystemClient = ReturnType<typeof getSystemClient>;

type SuspectRow = {
  eventId: string;
  eventTitle: string | null;
  startsAt: string;
  dealId: string;
  dealTitle: string | null;
  proposalChangedAt: string;
  gearSyncedAt: string | null;
};

export async function evaluateGearUnderDelivered(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000).toISOString();

  const eventToProposal = await loadEventProposalMap(system, workspaceId, nowIso, horizonIso);
  if (eventToProposal.length === 0) return [];

  const suspects = await Promise.all(
    eventToProposal.map((entry) => computeSuspect(system, entry)),
  );
  return suspects.filter((s): s is SuspectRow => s !== null).map(toCandidate);
}

type EventProposalEntry = {
  eventId: string;
  eventTitle: string | null;
  startsAt: string;
  dealId: string;
  dealTitle: string | null;
  proposalId: string;
};

type EventRow = { id: string; title: string | null; starts_at: string };
type DealRow = { id: string; title: string | null; event_id: string };

async function fetchUpcomingEvents(
  system: SystemClient,
  workspaceId: string,
  nowIso: string,
  horizonIso: string,
): Promise<EventRow[]> {
  const { data } = await system
    .schema('ops')
    .from('events')
    .select('id, title, starts_at')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', nowIso)
    .lte('starts_at', horizonIso);
  return (data ?? []) as EventRow[];
}

async function fetchDealsByEvent(
  system: SystemClient,
  workspaceId: string,
  eventIds: string[],
): Promise<Map<string, { id: string; title: string | null }>> {
  if (eventIds.length === 0) return new Map();
  const { data } = await system
    .from('deals')
    .select('id, title, event_id')
    .eq('workspace_id', workspaceId)
    .in('event_id', eventIds);
  const out = new Map<string, { id: string; title: string | null }>();
  for (const d of (data ?? []) as DealRow[]) out.set(d.event_id, { id: d.id, title: d.title });
  return out;
}

async function fetchProposalIdByDeal(
  system: SystemClient,
  dealIds: string[],
): Promise<Map<string, string>> {
  if (dealIds.length === 0) return new Map();
  const { data } = await system
    .from('proposals')
    .select('id, deal_id')
    .in('deal_id', dealIds)
    .in('status', ['sent', 'viewed', 'accepted']);
  const out = new Map<string, string>();
  for (const p of (data ?? []) as { id: string; deal_id: string }[]) {
    if (!out.has(p.deal_id)) out.set(p.deal_id, p.id);
  }
  return out;
}

async function loadEventProposalMap(
  system: SystemClient,
  workspaceId: string,
  nowIso: string,
  horizonIso: string,
): Promise<EventProposalEntry[]> {
  const events = await fetchUpcomingEvents(system, workspaceId, nowIso, horizonIso);
  if (events.length === 0) return [];

  const dealByEvent = await fetchDealsByEvent(system, workspaceId, events.map((e) => e.id));
  if (dealByEvent.size === 0) return [];

  const dealIds = [...new Set([...dealByEvent.values()].map((d) => d.id))];
  const proposalByDeal = await fetchProposalIdByDeal(system, dealIds);

  const out: EventProposalEntry[] = [];
  for (const event of events) {
    const deal = dealByEvent.get(event.id);
    const proposalId = deal ? proposalByDeal.get(deal.id) : undefined;
    if (!deal || !proposalId) continue;
    out.push({
      eventId: event.id,
      eventTitle: event.title,
      startsAt: event.starts_at,
      dealId: deal.id,
      dealTitle: deal.title,
      proposalId,
    });
  }
  return out;
}

async function computeSuspect(
  system: SystemClient,
  entry: EventProposalEntry,
): Promise<SuspectRow | null> {
  const [latestProposal, latestGear] = await Promise.all([
    system
      .from('proposal_items')
      .select('updated_at')
      .eq('proposal_id', entry.proposalId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    system
      .schema('ops')
      .from('event_gear_items')
      .select('created_at')
      .eq('event_id', entry.eventId)
      .eq('lineage_source', 'proposal')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const proposalChangedAt = (latestProposal.data as { updated_at?: string } | null)?.updated_at;
  if (!proposalChangedAt) return null;
  const gearSyncedAt = (latestGear.data as { created_at?: string } | null)?.created_at ?? null;
  if (gearSyncedAt && proposalChangedAt <= gearSyncedAt) return null;

  return {
    eventId: entry.eventId,
    eventTitle: entry.eventTitle,
    startsAt: entry.startsAt,
    dealId: entry.dealId,
    dealTitle: entry.dealTitle,
    proposalChangedAt,
    gearSyncedAt,
  };
}

function urgencyFor(daysOut: number): InsightCandidate['urgency'] {
  if (daysOut <= 1) return 'critical';
  if (daysOut <= 3) return 'high';
  return 'medium';
}

function priorityFor(daysOut: number): number {
  if (daysOut <= 1) return 45;
  if (daysOut <= 3) return 35;
  return 25;
}

function toCandidate(s: SuspectRow): InsightCandidate {
  const daysOut = Math.max(
    0,
    Math.floor((new Date(s.startsAt).getTime() - Date.now()) / 86_400_000),
  );
  const urgency = urgencyFor(daysOut);
  const priority = priorityFor(daysOut);
  const title = s.eventTitle ?? s.dealTitle ?? 'Show';
  return {
    triggerType: 'gear_under_delivered',
    entityType: 'event',
    entityId: s.eventId,
    title: daysOut === 0
      ? `${title} — proposal moved after gear sync (today)`
      : `${title} — proposal moved after gear sync (${daysOut}d out)`,
    context: {
      eventId: s.eventId,
      dealId: s.dealId,
      eventStartsAt: s.startsAt,
      proposalChangedAt: s.proposalChangedAt,
      gearSyncedAt: s.gearSyncedAt,
      daysUntilShow: daysOut,
    },
    priority,
    suggestedAction: 'Review the gear-card drift ribbon — accept or reject each change.',
    href: `/events?stream=active&selected=${s.dealId}`,
    urgency,
  };
}
