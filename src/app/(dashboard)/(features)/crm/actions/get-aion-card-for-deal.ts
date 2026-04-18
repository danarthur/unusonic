'use server';

/**
 * Consolidated Aion deal-card reader (Fork C, Phase 2).
 *
 * Replaces the four prior surfaces (follow-up card, AionSuggestionRow,
 * computeStallSignal JS util, NextActionsCard) with a single joined read:
 *
 *   ops.follow_up_queue
 *     LEFT JOIN cortex.aion_insights (on linked_insight_id, active-only)
 *   + independent cortex.aion_insights for unlinked active rows
 *   + ops.events (for days-out via src/shared/lib/deal-urgency)
 *   + public.proposals (for engagement + sent_at)
 *   + ops.pipeline_stages (for stall vs rotting_days + tags)
 *   + directory.entities (for the client's first_name)
 *   + ops.metric_owner_cadence_profile (Scope 3 personalization)
 *
 * All cortex + ops reads route through the system client because those
 * schemas aren't PostgREST-exposed to authenticated callers. Workspace
 * membership is validated via a workspace_members query on the authenticated
 * client BEFORE service-role reads — matches the existing pattern in
 * src/app/(dashboard)/(features)/crm/actions/aion-suggestion-actions.ts.
 *
 * See docs/reference/aion-deal-card-unified-design.md §7, §8.3a, §11, §20.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  composeAionVoice,
  composeCadenceTooltipLine,
  type CardVariant,
  type ComposeInput,
  type ProposalEngagement,
  type StallSnapshot,
} from '@/shared/lib/compose-aion-voice';
import {
  computeDealUrgency,
  type DealUrgency,
} from '@/shared/lib/deal-urgency';
import {
  getOwnerCadenceProfile,
  isOwnerCadenceLearningEnabled,
  type OwnerCadenceProfile,
} from '@/shared/lib/owner-cadence';

// =============================================================================
// Types
// =============================================================================

export type PriorityBreakdown = {
  base: number;
  priorityBoost: number;
  escalation: number;
  daysOutMultiplier: number;
  cadenceMultiplier: number;
  dwellMultiplier: number;
  ceilingApplied: boolean;
  finalScore: number;
};

export type OutboundRow = {
  kind: 'outbound';
  followUpId: string;
  reasonType: string;
  reasonLabel: string;
  linkedInsightId: string | null;
  priorityBreakdown: PriorityBreakdown;
  confidence: 'high' | 'medium' | 'low';
  lastTouchAt: string | null;
  suggestedChannel: 'email' | 'sms' | 'phone' | null;
};

export type PipelineRow = {
  kind: 'pipeline';
  insightId: string;
  triggerType: string;
  title: string;
  suggestedStageTag: string | null;
  priorityBreakdown: PriorityBreakdown;
  confidence: 'high' | 'medium' | 'low';
};

export type AionCardData = {
  dealId: string;
  variant: CardVariant;
  voice: string;
  outboundRows: OutboundRow[];
  pipelineRows: PipelineRow[];
  urgency: DealUrgency;
  stall: StallSnapshot | null;
  cadenceTooltip: string | null;
  cadence: OwnerCadenceProfile | null;
  suppress: boolean;           // true = all events past; card must not render
};

export type AionCardSummary = {
  dealId: string;
  hasPipeline: boolean;
  hasOutbound: boolean;
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Full resolver for the deal detail page. Returns `null` only when the
 * caller lacks workspace membership. Returns `suppress: true` when all the
 * deal's events are in the past (archive territory).
 */
export async function resolveAionCardForDeal(dealId: string): Promise<AionCardData | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const system = getSystemClient();

  // 1. Deal row (includes stage_id, owner_user_id, archetype, contact, proposed_date).
  const dealRow = await fetchDealRow(system, workspaceId, dealId);
  if (!dealRow) return null;

  // 2. Events — upcoming + past (sorted for deal-urgency composer).
  const { upcoming, past } = await fetchEventsForDeal(system, workspaceId, dealId);
  const urgency = computeDealUrgency({
    upcomingEventStartsAt: upcoming,
    pastEventStartsAt: past,
    dealProposedDate: dealRow.proposed_date,
  });

  // 3. Active follow-ups + linked-insight join (§8.3a).
  const followUps = await fetchActiveFollowUps(system, workspaceId, dealId);
  const linkedInsightIds = new Set(
    followUps.map((f) => f.linked_insight_id).filter((id): id is string => !!id),
  );

  // 4. Independent active insights (not already linked to a follow-up).
  const unlinkedInsights = await fetchUnlinkedActiveInsights(
    system,
    workspaceId,
    dealId,
    linkedInsightIds,
  );

  // 5. Stage label / tags / rotting_days for the deal's current stage.
  const stage = dealRow.stage_id
    ? await fetchStage(system, dealRow.stage_id)
    : null;

  // 6. Stall snapshot from the current pipeline dwell.
  const stall = await buildStallSnapshot(system, dealId, stage);

  // 7. Proposal engagement (most recent active proposal).
  const proposal = await fetchProposalEngagement(system, workspaceId, dealId);

  // 8. Client first name (from main_contact_id → directory.entities).
  const firstName = dealRow.main_contact_id
    ? await fetchContactFirstName(system, dealRow.main_contact_id)
    : null;

  // 9. Owner cadence profile (Scope 3 — gated by opt-in + sample quality).
  let cadence: OwnerCadenceProfile | null = null;
  if (dealRow.owner_user_id) {
    const enabled = await isOwnerCadenceLearningEnabled(workspaceId);
    if (enabled) {
      cadence = await getOwnerCadenceProfile(
        dealRow.owner_user_id,
        workspaceId,
        dealRow.event_archetype,
      );
    }
  }

  // 10. Apply conflict resolution (§11.1) — resolve case 2 at read time too.
  //     (The enroll primitive resolves at write time via cortex.resolve_aion_insight;
  //      read-time dedup handles stale-state cases where a deal_stale insight was
  //      surfaced before the stall-narrative follow-up enrolled.)
  const outboundRows = followUps.map((f) => toOutboundRow(f, urgency, cadence, stall));
  const pipelineRows = unlinkedInsights
    .filter((i) => i.trigger_type === 'stage_advance_suggestion')
    .map((i) => toPipelineRow(i, urgency, stall));

  // 11. Determine card variant.
  const variant: CardVariant = pickVariant(outboundRows, pipelineRows);

  // 12. Compose voice.
  const composeInput: ComposeInput = {
    variant,
    urgency,
    stall,
    proposal,
    client: { firstName },
    cadence,
  };
  const composed = composeAionVoice(composeInput);

  return {
    dealId,
    variant,
    voice: composed.voice,
    outboundRows,
    pipelineRows,
    urgency,
    stall,
    cadenceTooltip: composeCadenceTooltipLine(cadence, dealRow.event_archetype),
    cadence,
    suppress: urgency.suppress,
  };
}

/**
 * Batch prefetch for the stream rail — one query per `/crm` page load.
 * Returns per-deal flags without the voice/breakdown cost. Prevents the
 * N+1 that would re-emerge if every stream card self-fetched on render.
 *
 * Caller (stream rail container) runs this once; the compact chip uses
 * `hasPipeline` / `hasOutbound` to render the ★ indicator and let the user
 * click through to Deal Lens for the full card.
 */
export async function getAionCardSummariesForDeals(
  dealIds: string[],
): Promise<AionCardSummary[]> {
  if (dealIds.length === 0) return [];
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return [];

  const system = getSystemClient();

  // Follow-ups per deal (pending, not superseded).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data: fuRows } = await (system as any)
    .schema('ops')
    .from('follow_up_queue')
    .select('deal_id')
    .eq('workspace_id', workspaceId)
    .in('deal_id', dealIds)
    .eq('status', 'pending')
    .is('superseded_at', null);
  const outboundSet = new Set<string>();
  for (const row of (fuRows ?? []) as Array<{ deal_id: string }>) {
    outboundSet.add(row.deal_id);
  }

  // Stage-advance insights per deal.
  const dealIdStrings = dealIds.map(String);
  const { data: insightRows } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('entity_id, trigger_type')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'deal')
    .in('entity_id', dealIdStrings)
    .eq('trigger_type', 'stage_advance_suggestion')
    .in('status', ['pending', 'surfaced']);
  const pipelineSet = new Set<string>();
  for (const row of (insightRows ?? []) as Array<{ entity_id: string }>) {
    pipelineSet.add(row.entity_id);
  }

  return dealIds.map((id) => ({
    dealId: id,
    hasOutbound: outboundSet.has(id),
    hasPipeline: pipelineSet.has(id),
  }));
}

// =============================================================================
// Fetch helpers
// =============================================================================

type DealRow = {
  id: string;
  workspace_id: string;
  stage_id: string | null;
  owner_user_id: string | null;
  main_contact_id: string | null;
  event_archetype: string | null;
  proposed_date: string | null;
};

async function fetchDealRow(
  system: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  dealId: string,
): Promise<DealRow | null> {
  const { data } = await system
    .from('deals')
    .select('id, workspace_id, stage_id, owner_user_id, main_contact_id, event_archetype, proposed_date')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return (data as DealRow) ?? null;
}

async function fetchEventsForDeal(
  system: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  dealId: string,
): Promise<{ upcoming: string[]; past: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data } = await (system as any)
    .schema('ops')
    .from('events')
    .select('starts_at, archived_at')
    .eq('workspace_id', workspaceId)
    .eq('deal_id', dealId)
    .is('archived_at', null)
    .order('starts_at', { ascending: true });

  const rows = (data ?? []) as Array<{ starts_at: string | null }>;
  const nowMs = Date.now();
  const upcoming: string[] = [];
  const past: string[] = [];
  for (const r of rows) {
    if (!r.starts_at) continue;
    const ms = new Date(r.starts_at).getTime();
    if (ms >= nowMs) upcoming.push(r.starts_at);
    else past.push(r.starts_at);
  }
  return { upcoming, past };
}

type FollowUpRow = {
  id: string;
  deal_id: string;
  reason: string | null;
  reason_type: string;
  suggested_channel: string | null;
  priority_score: number;
  priority_ceiling: number | null;
  escalation_count: number | null;
  linked_insight_id: string | null;
  created_at: string;
  acted_at: string | null;
  context_snapshot: Record<string, unknown> | null;
};

async function fetchActiveFollowUps(
  system: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  dealId: string,
): Promise<FollowUpRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data } = await (system as any)
    .schema('ops')
    .from('follow_up_queue')
    .select('id, deal_id, reason, reason_type, suggested_channel, priority_score, priority_ceiling, escalation_count, linked_insight_id, created_at, acted_at, context_snapshot')
    .eq('workspace_id', workspaceId)
    .eq('deal_id', dealId)
    .eq('status', 'pending')
    .is('superseded_at', null)
    .order('priority_score', { ascending: false });
  return (data ?? []) as FollowUpRow[];
}

type InsightRow = {
  id: string;
  trigger_type: string;
  title: string;
  context: Record<string, unknown> | null;
  priority: number | null;
  created_at: string;
};

async function fetchUnlinkedActiveInsights(
  system: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  dealId: string,
  excludeIds: Set<string>,
): Promise<InsightRow[]> {
  const { data } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, trigger_type, title, context, priority, created_at')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .in('status', ['pending', 'surfaced'])
    .order('priority', { ascending: false });

  const rows = (data ?? []) as InsightRow[];
  return rows.filter((r) => !excludeIds.has(r.id));
}

async function fetchStage(
  system: ReturnType<typeof getSystemClient>,
  stageId: string,
): Promise<{ label: string | null; tags: string[]; rotting_days: number | null } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data } = await (system as any)
    .schema('ops')
    .from('pipeline_stages')
    .select('label, tags, rotting_days')
    .eq('id', stageId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { label: string | null; tags: string[] | null; rotting_days: number | null };
  return {
    label: row.label,
    tags: row.tags ?? [],
    rotting_days: row.rotting_days,
  };
}

async function buildStallSnapshot(
  system: ReturnType<typeof getSystemClient>,
  dealId: string,
  stage: { label: string | null; rotting_days: number | null } | null,
): Promise<StallSnapshot | null> {
  if (!stage) return null;

  // Most-recent transition INTO the current stage = when dwell started.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data } = await (system as any)
    .schema('ops')
    .from('deal_transitions')
    .select('entered_at, to_stage_id')
    .eq('deal_id', dealId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const enteredAt = (data as { entered_at: string | null } | null)?.entered_at ?? null;
  let daysInStage: number | null = null;
  if (enteredAt) {
    const ms = Date.now() - new Date(enteredAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) daysInStage = Math.floor(ms / 86_400_000);
  }

  return {
    daysInStage,
    stageLabel: stage.label,
    stageRottingDays: stage.rotting_days,
  };
}

async function fetchProposalEngagement(
  system: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  dealId: string,
): Promise<ProposalEngagement | null> {
  const { data } = await system
    .from('proposals')
    .select('status, email_delivered_at, created_at, view_count, last_viewed_at')
    .eq('workspace_id', workspaceId)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    status: string | null;
    email_delivered_at: string | null;
    created_at: string;
    view_count: number | null;
    last_viewed_at: string | null;
  };

  const sentAt = row.email_delivered_at ?? (
    row.status && ['sent', 'viewed', 'accepted', 'rejected'].includes(row.status)
      ? row.created_at
      : null
  );

  const viewCount = row.view_count ?? 0;
  const lastViewedMs = row.last_viewed_at ? new Date(row.last_viewed_at).getTime() : null;
  const recentHotOpens = viewCount >= 2
    && lastViewedMs !== null
    && Date.now() - lastViewedMs <= 48 * 3_600_000;

  return {
    sentAt,
    viewCount,
    lastViewedAt: row.last_viewed_at,
    recentHotOpens,
  };
}

async function fetchContactFirstName(
  system: ReturnType<typeof getSystemClient>,
  entityId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- directory schema cast
  const { data } = await (system as any)
    .schema('directory')
    .from('entities')
    .select('display_name, attributes')
    .eq('id', entityId)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    display_name: string | null;
    attributes: Record<string, unknown> | null;
  };
  const attrs = row.attributes ?? {};
  const first = typeof attrs.first_name === 'string' ? attrs.first_name : null;
  if (first) return first;
  // Fallback: take the first space-delimited token from display_name.
  if (row.display_name) {
    const first = row.display_name.trim().split(/\s+/)[0];
    return first || null;
  }
  return null;
}

// =============================================================================
// Row composition + priority breakdown
// =============================================================================

function pickVariant(out: OutboundRow[], pipe: PipelineRow[]): CardVariant {
  const hasOut = out.length > 0;
  const hasPipe = pipe.length > 0;
  if (hasOut && hasPipe) return 'both';
  if (hasOut) return 'outbound_only';
  if (hasPipe) return 'pipeline_only';
  return 'collapsed';
}

function computePriorityBreakdown(params: {
  base: number;
  priorityBoost: number;
  escalationCount: number;
  ceiling: number | null;
  daysOutMultiplier: number;
  cadenceMultiplier: number;
  dwellMultiplier: number;
}): PriorityBreakdown {
  const { base, priorityBoost, escalationCount, ceiling } = params;
  const escalation = Math.pow(1.15, Math.max(0, escalationCount)) - 1;
  const pre = (base + priorityBoost) * (1 + escalation);
  const withMultipliers = pre
    * params.daysOutMultiplier
    * params.cadenceMultiplier
    * params.dwellMultiplier;
  const ceilingVal = ceiling ?? 100;
  const ceilingApplied = withMultipliers > ceilingVal;
  const finalScore = Math.min(withMultipliers, ceilingVal);
  return {
    base,
    priorityBoost,
    escalation: Number(escalation.toFixed(3)),
    daysOutMultiplier: params.daysOutMultiplier,
    cadenceMultiplier: params.cadenceMultiplier,
    dwellMultiplier: params.dwellMultiplier,
    ceilingApplied,
    finalScore: Number(finalScore.toFixed(2)),
  };
}

function toOutboundRow(
  row: FollowUpRow,
  urgency: DealUrgency,
  cadence: OwnerCadenceProfile | null,
  stall: StallSnapshot | null,
): OutboundRow {
  const ctx = (row.context_snapshot ?? {}) as Record<string, unknown>;
  const priorityBoost = typeof ctx.priority_boost === 'number' ? ctx.priority_boost : 0;
  const cadenceMultiplier = cadenceExceededMultiplier(cadence, row.created_at);
  const dwellMultiplier = stallDwellMultiplier(stall);

  const priorityBreakdown = computePriorityBreakdown({
    base: 10,
    priorityBoost,
    escalationCount: row.escalation_count ?? 0,
    ceiling: row.priority_ceiling,
    daysOutMultiplier: urgency.multiplier,
    cadenceMultiplier,
    dwellMultiplier,
  });

  return {
    kind: 'outbound',
    followUpId: row.id,
    reasonType: row.reason_type,
    reasonLabel: row.reason ?? row.reason_type,
    linkedInsightId: row.linked_insight_id,
    priorityBreakdown,
    confidence: scoreToConfidence(priorityBreakdown.finalScore),
    lastTouchAt: row.acted_at,
    suggestedChannel: normalizeChannel(row.suggested_channel),
  };
}

function toPipelineRow(
  insight: InsightRow,
  urgency: DealUrgency,
  stall: StallSnapshot | null,
): PipelineRow {
  const ctx = (insight.context ?? {}) as Record<string, unknown>;
  const suggestedStageTag =
    typeof ctx.suggested_stage_tag === 'string' ? ctx.suggested_stage_tag : null;
  const priorityBoost = typeof ctx.priority_boost === 'number' ? ctx.priority_boost : 0;

  const priorityBreakdown = computePriorityBreakdown({
    base: 10,
    priorityBoost,
    escalationCount: 0,
    ceiling: 100,
    daysOutMultiplier: urgency.multiplier,
    cadenceMultiplier: 1.0,
    dwellMultiplier: stallDwellMultiplier(stall),
  });

  return {
    kind: 'pipeline',
    insightId: insight.id,
    triggerType: insight.trigger_type,
    title: insight.title,
    suggestedStageTag,
    priorityBreakdown,
    confidence: scoreToConfidence(priorityBreakdown.finalScore),
  };
}

function cadenceExceededMultiplier(
  cadence: OwnerCadenceProfile | null,
  followUpCreatedAt: string,
): number {
  if (!cadence || cadence.sampleQuality !== 'sufficient') return 1.0;
  const typical = cadence.typicalDaysProposalToFirstFollowup;
  if (typical === null || typical <= 0) return 1.0;
  const daysSince = Math.floor(
    (Date.now() - new Date(followUpCreatedAt).getTime()) / 86_400_000,
  );
  if (daysSince > typical) return 1.2;
  return 1.0;
}

function stallDwellMultiplier(stall: StallSnapshot | null): number {
  if (!stall || stall.daysInStage === null || !stall.stageRottingDays || stall.stageRottingDays <= 0) {
    return 1.0;
  }
  const ratio = stall.daysInStage / stall.stageRottingDays;
  // Cap at 1.5 so dwell can't dominate the score.
  return Math.min(1.5, Math.max(1.0, ratio));
}

function scoreToConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

function normalizeChannel(raw: string | null): 'email' | 'sms' | 'phone' | null {
  if (raw === 'email' || raw === 'sms' || raw === 'phone') return raw;
  return null;
}
