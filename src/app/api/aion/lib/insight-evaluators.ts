/**
 * Aion Proactive Insight Evaluators
 *
 * Pure SQL-backed functions that detect conditions needing attention.
 * No LLM in the evaluation loop — titles are pre-formatted strings.
 * Called by the daily cron to populate cortex.aion_insights.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { daysFrom as daysSince } from '@/shared/lib/days-since';
import { evaluateQuoteExpiring } from './evaluators/quote-expiring';
import { evaluateHotLeadMultiView } from './evaluators/hot-lead-multi-view';
import { evaluateDepositGap } from './evaluators/deposit-gap';
import { evaluateGoneQuietWithValue } from './evaluators/gone-quiet-with-value';
import { evaluateStageAdvanceSuggestion } from './evaluators/stage-advance-suggestion';
import { evaluateStakeholderCountTrend } from './evaluators/stakeholder-count-trend';
import { evaluateCalendarCollision } from './evaluators/calendar-collision';
import { evaluateGearUnderDelivered } from './evaluators/gear-under-delivered';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';

// ── Types ────────────────────────────────────────────────────────────────────

export type InsightCandidate = {
  triggerType: string;
  entityType: string;
  entityId: string;
  title: string;
  context: Record<string, unknown>;
  priority: number;
  suggestedAction: string;
  href: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  expiresAt?: string;
};

// ── Evaluate all triggers for a workspace ────────────────────────────────────

export async function evaluateAllInsights(workspaceId: string): Promise<InsightCandidate[]> {
  // Pre-fetch shared data for crew evaluators (single batch instead of N+1)
  const crewData = await getUpcomingShowsWithCrew(workspaceId);

  const results = await Promise.allSettled([
    // v1 set
    evaluateProposalViewedUnsigned(workspaceId),
    evaluateCrewUnconfirmed(workspaceId, crewData),
    evaluateShowNoCrew(workspaceId, crewData),
    evaluateDealStale(workspaceId),
    // Phase 2 commit 3 — sales-specific evaluators
    evaluateQuoteExpiring(workspaceId),
    evaluateHotLeadMultiView(workspaceId),
    evaluateDepositGap(workspaceId),
    evaluateGoneQuietWithValue(workspaceId),
    // P0 follow-up engine — tag-gated stage advance suggestions
    evaluateStageAdvanceSuggestion(workspaceId),
    // Phase 7b Tier 2 — relational + temporal signals
    evaluateStakeholderCountTrend(workspaceId),
    evaluateCalendarCollision(workspaceId),
    // Phase 5 of proposal-gear-lineage-plan — proposal moved after gear sync
    evaluateGearUnderDelivered(workspaceId),
  ]);

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// ── Upsert insights to database ──────────────────────────────────────────────

export async function upsertInsights(workspaceId: string, insights: InsightCandidate[]): Promise<void> {
  if (insights.length === 0) return;

  const system = getSystemClient();

  for (const insight of insights) {
    try {
      // Pack suggestedAction, href, and urgency into context JSONB
      const enrichedContext = {
        ...insight.context,
        suggestedAction: insight.suggestedAction,
        href: insight.href,
        urgency: insight.urgency,
      };

      await system.schema('cortex').rpc('upsert_aion_insight', {
        p_workspace_id: workspaceId,
        p_trigger_type: insight.triggerType,
        p_entity_type: insight.entityType,
        p_entity_id: insight.entityId,
        p_title: insight.title,
        p_context: enrichedContext,
        p_priority: insight.priority,
        // RPC signature expects `undefined` not `null` for the optional param
        p_expires_at: insight.expiresAt ?? undefined,
      });
    } catch (err) {
      console.error(`[aion/insights] Failed to upsert insight ${insight.triggerType}/${insight.entityId}:`, err);
    }
  }
}

// ── Auto-resolve insights whose conditions are no longer true ─────────────────

export async function resolveStaleInsights(workspaceId: string): Promise<void> {
  const system = getSystemClient();

  // Resolve proposal_viewed_unsigned for proposals that are now signed
  try {
    const { data: signed } = await system
      .from('proposals')
      .select('id')
      .eq('workspace_id', workspaceId)
      .not('signed_at', 'is', null);

    for (const p of signed ?? []) {
      await system.schema('cortex').rpc('resolve_aion_insight', {
        p_trigger_type: 'proposal_viewed_unsigned',
        p_entity_id: p.id,
      });
    }
  } catch { /* best effort */ }

  // Resolve expired insights. Uses the typed `.schema('cortex').from(...)`
  // call pattern (fixed in PR 11d — previously the broken
  // `.from('cortex.aion_insights')` string-prefix pattern was a no-op at runtime).
  try {
    await system
      .schema('cortex')
      .from('aion_insights')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .lt('expires_at', new Date().toISOString())
      .in('status', ['pending', 'surfaced']);
  } catch { /* best effort */ }
}

// ── Helpers (exported for evaluators/*.ts) ──────────────────────────────────

/** Days from now to a future date (negative if past). */
export function daysUntil(date: string | Date): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Days since a past date. Re-exported from `@/shared/lib/days-since` (which
 *  exports it as `daysFrom`) so existing import paths keep working while the
 *  underlying implementation is shared with the awaiting-signature widget and
 *  the Aion deal-card signal helpers. */
export { daysSince };

/** Human-readable short date: "Apr 12" */
export function shortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Urgency from days-until-event. */
export function eventUrgency(daysOut: number): InsightCandidate['urgency'] {
  if (daysOut <= 1) return 'critical';
  if (daysOut <= 3) return 'high';
  if (daysOut <= 5) return 'medium';
  return 'low';
}

// ── Shared data fetchers (batch queries to avoid N+1) ───────────────────────

type CrewRow = { id: string; deal_id: string | null; event_id: string | null; confirmed_at: string | null; entity_id: string };
type UpcomingShow = {
  eventId: string;
  dealId: string | null;
  title: string | null;
  proposedDate: string;
  eventArchetype: string | null;
};
type UpcomingShowsWithCrew = {
  shows: UpcomingShow[];
  crewByEventId: Map<string, CrewRow[]>;
};

/**
 * Batch-fetch upcoming shows (within 7 days) and all their crew in two
 * queries. This is EVENT-scoped after the multi-date P0 work: series deals
 * surface one candidate insight per upcoming show rather than one per deal,
 * because crew and production readiness differ per show.
 *
 * Shared by evaluateCrewUnconfirmed and evaluateShowNoCrew.
 */
async function getUpcomingShowsWithCrew(workspaceId: string): Promise<UpcomingShowsWithCrew> {
  const system = getSystemClient();
  const nowIso = new Date().toISOString();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await system
    .schema('ops')
    .from('events')
    .select('id, deal_id, title, starts_at, event_archetype, archived_at, lifecycle_status')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .gte('starts_at', nowIso)
    .lte('starts_at', sevenDaysFromNow);

  if (!events?.length) return { shows: [], crewByEventId: new Map() };

  const eventIds = (events as any[]).map((e) => e.id as string);

  // Single batch query: event-scoped crew rows only.
  const { data: allCrew } = await system
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, event_id, confirmed_at, entity_id')
    .in('event_id', eventIds)
    .eq('workspace_id', workspaceId);

  const crewByEventId = new Map<string, CrewRow[]>();
  for (const row of (allCrew ?? []) as CrewRow[]) {
    if (!row.event_id) continue;
    const existing = crewByEventId.get(row.event_id) ?? [];
    existing.push(row);
    crewByEventId.set(row.event_id, existing);
  }

  const shows: UpcomingShow[] = (events as any[]).map((e) => ({
    eventId: e.id as string,
    dealId: (e.deal_id as string | null) ?? null,
    title: (e.title as string | null) ?? null,
    // Use the event's own date, not the deal's proposed_date — in a series
    // these differ, and the deal proposed_date tracks only the first live show.
    proposedDate: (e.starts_at as string).slice(0, 10),
    eventArchetype: (e.event_archetype as string | null) ?? null,
  }));

  return { shows, crewByEventId };
}

// ── Individual evaluators ────────────────────────────────────────────────────

/**
 * Proposals viewed 2+ times but not signed (within last 7 days).
 * Dynamic priority: more views + more recent = higher priority.
 */
async function evaluateProposalViewedUnsigned(workspaceId: string): Promise<InsightCandidate[]> {
  const system = getSystemClient();

  const { data } = await system
    .from('proposals')
    .select('id, deal_id, view_count, last_viewed_at, sent_at, deals!inner(title, organization_id)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'sent')
    .is('signed_at', null)
    .gte('view_count', 2)
    .gte('last_viewed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (!data?.length) return [];

  // Batch-fetch client org names for all relevant deals
  const orgIds = [...new Set((data as any[]).map((p: any) => p.deals?.organization_id).filter(Boolean))];
  let orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await system
      .schema('directory')
      .from('entities')
      .select('id, name')
      .in('id', orgIds);
    orgNames = Object.fromEntries((orgs ?? []).map((o: any) => [o.id, o.name]));
  }

  return (data as any[]).map((p: any) => {
    const dealTitle = p.deals?.title ?? 'Untitled deal';
    const clientName = orgNames[p.deals?.organization_id] ?? null;
    const daysSinceSent = p.sent_at ? daysSince(p.sent_at) : null;
    const daysSinceLastView = daysSince(p.last_viewed_at);

    // Dynamic priority: base 25, +5 per view beyond 2, +5 if viewed in last 24h
    const dynamicPriority = Math.min(45, 25 + (p.view_count - 2) * 5 + (daysSinceLastView === 0 ? 5 : 0));

    const urgency: InsightCandidate['urgency'] =
      p.view_count >= 5 ? 'high' : p.view_count >= 3 ? 'medium' : 'low';

    return {
      triggerType: 'proposal_viewed_unsigned',
      entityType: 'proposal',
      entityId: p.id,
      title: `${dealTitle} proposal viewed ${p.view_count} times but not signed`,
      context: {
        dealId: p.deal_id,
        dealTitle,
        clientName,
        viewCount: p.view_count,
        lastViewed: p.last_viewed_at,
        daysSinceLastView,
        daysSinceSent,
      },
      priority: dynamicPriority,
      suggestedAction: 'Send a follow-up to the client',
      href: `/productions/deal/${p.deal_id}/proposal-builder`,
      urgency,
    };
  });
}

/**
 * Crew members unconfirmed for events within 7 days.
 * Dynamic priority: scales with proximity to event + unconfirmed ratio.
 * Consumes pre-fetched crew data to avoid N+1 queries.
 */
async function evaluateCrewUnconfirmed(
  _workspaceId: string,
  crewData: UpcomingShowsWithCrew,
): Promise<InsightCandidate[]> {
  const { shows, crewByEventId } = crewData;
  if (!shows.length) return [];

  const insights: InsightCandidate[] = [];

  for (const show of shows) {
    const crew = crewByEventId.get(show.eventId) ?? [];
    const totalCrew = crew.length;
    const unconfirmed = crew.filter((c) => !c.confirmed_at);
    if (unconfirmed.length === 0) continue;

    const daysOut = daysUntil(show.proposedDate);
    const urg = eventUrgency(daysOut);

    const allUnconfirmed = unconfirmed.length === totalCrew;
    const dynamicPriority = Math.min(50, 30 + (daysOut <= 3 ? 10 : 0) + (allUnconfirmed ? 5 : 0));

    const dateStr = shortDate(show.proposedDate);
    const title = allUnconfirmed
      ? `All ${totalCrew} crew unconfirmed for ${show.title ?? 'Untitled'} on ${dateStr}`
      : `${unconfirmed.length} of ${totalCrew} crew unconfirmed for ${show.title ?? 'Untitled'} on ${dateStr}`;

    insights.push({
      triggerType: 'crew_unconfirmed',
      entityType: 'deal',
      entityId: show.dealId ?? show.eventId,
      title,
      context: {
        eventId: show.eventId,
        dealTitle: show.title,
        unconfirmedCount: unconfirmed.length,
        totalCrew,
        allUnconfirmed,
        eventDate: show.proposedDate,
        daysUntilEvent: daysOut,
      },
      priority: dynamicPriority,
      suggestedAction: 'Confirm crew assignments or send reminders',
      href: show.dealId ? `/productions/deal/${show.dealId}` : `/events/${show.eventId}`,
      urgency: urg,
    });
  }

  return insights;
}

/**
 * Events within 7 days with zero crew assigned.
 * Highest base priority — dynamic escalation as event approaches.
 * Consumes pre-fetched crew data to avoid N+1 queries.
 */
async function evaluateShowNoCrew(
  _workspaceId: string,
  crewData: UpcomingShowsWithCrew,
): Promise<InsightCandidate[]> {
  const { shows, crewByEventId } = crewData;
  if (!shows.length) return [];

  const insights: InsightCandidate[] = [];

  for (const show of shows) {
    const crewCount = (crewByEventId.get(show.eventId) ?? []).length;
    if (crewCount > 0) continue;

    const daysOut = daysUntil(show.proposedDate);
    const urg = eventUrgency(daysOut);
    const dateStr = shortDate(show.proposedDate);
    const dealTitle = show.title ?? 'Untitled';

    const dynamicPriority = Math.min(50, 40 + (daysOut <= 3 ? 10 : 0));

    const title = daysOut <= 1
      ? `${dealTitle} is tomorrow and has no crew assigned`
      : `${dealTitle} on ${dateStr} has no crew assigned`;

    insights.push({
      triggerType: 'show_no_crew',
      entityType: 'deal',
      entityId: show.dealId ?? show.eventId,
      title,
      context: {
        eventId: show.eventId,
        dealTitle,
        eventDate: show.proposedDate,
        daysUntilEvent: daysOut,
        eventType: show.eventArchetype ?? null,
      },
      priority: dynamicPriority,
      suggestedAction: 'Assign crew to this show',
      href: show.dealId ? `/productions/deal/${show.dealId}` : `/events/${show.eventId}`,
      urgency: urg,
    });
  }

  return insights;
}

/**
 * Open deals with no activity (notes or log entries) in 14+ days.
 * Dynamic priority: longer staleness = higher priority. Deals with upcoming dates get extra weight.
 * Uses batch queries for notes + logs to avoid N+1.
 */
async function evaluateDealStale(workspaceId: string): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: deals } = await system
    .from('deals')
    .select('id, title, status, stage_id, updated_at, proposed_date, organization_id')
    .eq('workspace_id', workspaceId)
    .in('status', [...OPEN_DEAL_STATUSES])
    .is('archived_at', null);

  if (!deals?.length) return [];

  const dealIds = (deals as any[]).map((d: any) => d.id);
  const stageIds = [...new Set((deals as any[]).map((d: any) => d.stage_id).filter(Boolean))];

  // Batch-fetch client org names + recent activity + stage labels in parallel
  const orgIds = [...new Set((deals as any[]).map((d: any) => d.organization_id).filter(Boolean))];

  const [orgResult, notesResult, logsResult, stageResult] = await Promise.all([
    orgIds.length > 0
      ? system.schema('directory').from('entities').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
    // Batch: deals with recent notes
    system.schema('ops').from('deal_notes')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', fourteenDaysAgo),
    // Batch: deals with recent follow-up log entries
    system.schema('ops').from('follow_up_log')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', fourteenDaysAgo),
    // Phase 2c: batch-fetch stage labels so copy is rename-safe
    stageIds.length > 0
      ? system.schema('ops').from('pipeline_stages').select('id, label').in('id', stageIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const orgNames: Record<string, string> = Object.fromEntries(
    (orgResult.data ?? []).map((o: any) => [o.id, o.name]),
  );

  const stageLabels: Record<string, string> = Object.fromEntries(
    ((stageResult.data ?? []) as Array<{ id: string; label: string }>).map((s) => [s.id, s.label]),
  );

  // Build sets of deal IDs with recent activity
  const dealsWithRecentNotes = new Set(
    (notesResult.data ?? []).map((r: any) => r.deal_id),
  );
  const dealsWithRecentLogs = new Set(
    (logsResult.data ?? []).map((r: any) => r.deal_id),
  );

  const insights: InsightCandidate[] = [];

  for (const deal of deals as any[]) {
    // Skip deals with recent activity
    if (dealsWithRecentNotes.has(deal.id) || dealsWithRecentLogs.has(deal.id)) continue;

    const inactiveDays = daysSince(deal.updated_at);
    if (inactiveDays < 14) continue;

    const dealTitle = deal.title ?? 'Untitled';
    const clientName = orgNames[deal.organization_id] ?? null;
    const hasUpcomingDate = deal.proposed_date && new Date(deal.proposed_date) > new Date();

    // Dynamic priority: base 10, +5 per week of staleness (cap at 30), +5 if event is upcoming
    const dynamicPriority = Math.min(
      30,
      10 + Math.floor((inactiveDays - 14) / 7) * 5 + (hasUpcomingDate ? 5 : 0),
    );

    const urgency: InsightCandidate['urgency'] =
      hasUpcomingDate && inactiveDays >= 21
        ? 'high'
        : inactiveDays >= 28
          ? 'medium'
          : 'low';

    // Phase 3i: deal.status now collapses to kind ('working' / 'won' / 'lost'),
    // so the legacy-slug ternary never matches. Resolve the stage label
    // directly from the per-deal stage_id (batched at the top of this
    // function) for rename-safe copy. Fall back to 'deal' when the stage
    // label is unavailable.
    const stageLabel = (deal.stage_id && stageLabels[deal.stage_id])
      ? stageLabels[deal.stage_id].toLowerCase()
      : 'deal';

    insights.push({
      triggerType: 'deal_stale',
      entityType: 'deal',
      entityId: deal.id,
      title: `${dealTitle} has had no activity for ${inactiveDays} days`,
      context: {
        dealTitle,
        clientName,
        dealStage: deal.status,
        daysSinceActivity: inactiveDays,
        lastActivity: deal.updated_at,
        proposedDate: deal.proposed_date ?? null,
        hasUpcomingDate,
      },
      priority: dynamicPriority,
      suggestedAction: `Follow up — this ${stageLabel} has gone quiet`,
      href: `/productions/deal/${deal.id}`,
      urgency,
    });
  }

  return insights;
}
