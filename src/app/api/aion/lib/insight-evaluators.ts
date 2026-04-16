/**
 * Aion Proactive Insight Evaluators
 *
 * Pure SQL-backed functions that detect conditions needing attention.
 * No LLM in the evaluation loop — titles are pre-formatted strings.
 * Called by the daily cron to populate cortex.aion_insights.
 */

import { getSystemClient } from '@/shared/api/supabase/system';

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
  const crewData = await getUpcomingDealsWithCrew(workspaceId);

  const results = await Promise.allSettled([
    evaluateProposalViewedUnsigned(workspaceId),
    evaluateCrewUnconfirmed(workspaceId, crewData),
    evaluateShowNoCrew(workspaceId, crewData),
    evaluateDealStale(workspaceId),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Days from now to a future date (negative if past). */
function daysUntil(date: string | Date): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Days since a past date. */
function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

/** Human-readable short date: "Apr 12" */
function shortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Urgency from days-until-event. */
function eventUrgency(daysOut: number): InsightCandidate['urgency'] {
  if (daysOut <= 1) return 'critical';
  if (daysOut <= 3) return 'high';
  if (daysOut <= 5) return 'medium';
  return 'low';
}

// ── Shared data fetchers (batch queries to avoid N+1) ───────────────────────

type CrewRow = { id: string; deal_id: string; confirmed_at: string | null; entity_id: string };
type UpcomingDeal = { id: string; title: string | null; proposed_date: string; event_archetype: string | null };
type UpcomingDealsWithCrew = {
  deals: UpcomingDeal[];
  crewByDealId: Map<string, CrewRow[]>;
};

/**
 * Batch-fetch upcoming deals (within 7 days) and all their crew in two queries.
 * Shared by evaluateCrewUnconfirmed and evaluateShowNoCrew.
 */
async function getUpcomingDealsWithCrew(workspaceId: string): Promise<UpcomingDealsWithCrew> {
  const system = getSystemClient();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: deals } = await system
    .from('deals')
    .select('id, title, proposed_date, event_archetype')
    .eq('workspace_id', workspaceId)
    .in('status', ['proposal', 'contract_sent', 'won'])
    .not('proposed_date', 'is', null)
    .lte('proposed_date', sevenDaysFromNow)
    .gte('proposed_date', new Date().toISOString());

  if (!deals?.length) return { deals: [], crewByDealId: new Map() };

  const dealIds = deals.map((d: any) => d.id);

  // Single batch query for all crew across all upcoming deals
  const { data: allCrew } = await (system as any)
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, confirmed_at, entity_id')
    .in('deal_id', dealIds)
    .eq('workspace_id', workspaceId);

  // Group crew by deal_id
  const crewByDealId = new Map<string, CrewRow[]>();
  for (const row of (allCrew ?? []) as CrewRow[]) {
    const existing = crewByDealId.get(row.deal_id) ?? [];
    existing.push(row);
    crewByDealId.set(row.deal_id, existing);
  }

  return { deals: deals as UpcomingDeal[], crewByDealId };
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
      href: `/crm/deal/${p.deal_id}/proposal-builder`,
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
  crewData: UpcomingDealsWithCrew,
): Promise<InsightCandidate[]> {
  const { deals, crewByDealId } = crewData;
  if (!deals.length) return [];

  const insights: InsightCandidate[] = [];

  for (const deal of deals) {
    const crew = crewByDealId.get(deal.id) ?? [];
    const totalCrew = crew.length;
    const unconfirmed = crew.filter((c) => !c.confirmed_at);
    if (unconfirmed.length === 0) continue;

    const daysOut = daysUntil(deal.proposed_date);
    const urg = eventUrgency(daysOut);

    // Dynamic priority: base 30, +10 if ≤3 days, +5 if all crew unconfirmed
    const allUnconfirmed = unconfirmed.length === totalCrew;
    const dynamicPriority = Math.min(50, 30 + (daysOut <= 3 ? 10 : 0) + (allUnconfirmed ? 5 : 0));

    const dateStr = shortDate(deal.proposed_date);
    const title = allUnconfirmed
      ? `All ${totalCrew} crew unconfirmed for ${deal.title ?? 'Untitled'} on ${dateStr}`
      : `${unconfirmed.length} of ${totalCrew} crew unconfirmed for ${deal.title ?? 'Untitled'} on ${dateStr}`;

    insights.push({
      triggerType: 'crew_unconfirmed',
      entityType: 'deal',
      entityId: deal.id,
      title,
      context: {
        dealTitle: deal.title,
        unconfirmedCount: unconfirmed.length,
        totalCrew,
        allUnconfirmed,
        eventDate: deal.proposed_date,
        daysUntilEvent: daysOut,
      },
      priority: dynamicPriority,
      suggestedAction: 'Confirm crew assignments or send reminders',
      href: `/crm/deal/${deal.id}`,
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
  crewData: UpcomingDealsWithCrew,
): Promise<InsightCandidate[]> {
  const { deals, crewByDealId } = crewData;
  if (!deals.length) return [];

  const insights: InsightCandidate[] = [];

  for (const deal of deals) {
    const crewCount = (crewByDealId.get(deal.id) ?? []).length;
    if (crewCount > 0) continue;

    const daysOut = daysUntil(deal.proposed_date);
    const urg = eventUrgency(daysOut);
    const dateStr = shortDate(deal.proposed_date);
    const dealTitle = deal.title ?? 'Untitled';

    // Dynamic priority: base 40, +10 if ≤3 days
    const dynamicPriority = Math.min(50, 40 + (daysOut <= 3 ? 10 : 0));

    const title = daysOut <= 1
      ? `${dealTitle} is tomorrow and has no crew assigned`
      : `${dealTitle} on ${dateStr} has no crew assigned`;

    insights.push({
      triggerType: 'show_no_crew',
      entityType: 'deal',
      entityId: deal.id,
      title,
      context: {
        dealTitle,
        eventDate: deal.proposed_date,
        daysUntilEvent: daysOut,
        eventType: deal.event_archetype ?? null,
      },
      priority: dynamicPriority,
      suggestedAction: 'Assign crew to this show',
      href: `/crm/deal/${deal.id}`,
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
    .select('id, title, status, updated_at, proposed_date, organization_id')
    .eq('workspace_id', workspaceId)
    .in('status', ['inquiry', 'proposal', 'contract_sent'])
    .is('archived_at', null);

  if (!deals?.length) return [];

  const dealIds = (deals as any[]).map((d: any) => d.id);

  // Batch-fetch client org names + recent activity in parallel
  const orgIds = [...new Set((deals as any[]).map((d: any) => d.organization_id).filter(Boolean))];

  const [orgResult, notesResult, logsResult] = await Promise.all([
    orgIds.length > 0
      ? system.schema('directory').from('entities').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
    // Batch: deals with recent notes
    (system as any).schema('ops').from('deal_notes')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', fourteenDaysAgo),
    // Batch: deals with recent follow-up log entries
    (system as any).schema('ops').from('follow_up_log')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', fourteenDaysAgo),
  ]);

  const orgNames: Record<string, string> = Object.fromEntries(
    (orgResult.data ?? []).map((o: any) => [o.id, o.name]),
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

    const stageLabel = deal.status === 'inquiry' ? 'inquiry' : deal.status === 'proposal' ? 'proposal' : 'contract sent';

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
      href: `/crm/deal/${deal.id}`,
      urgency,
    });
  }

  return insights;
}
