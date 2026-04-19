/**
 * Cron: Follow-up queue engine
 * Runs daily (Vercel Cron). Scans all open deals across all workspaces,
 * computes priority scores, and upserts into ops.follow_up_queue.
 *
 * Uses system client (service role) — cross-workspace by design.
 */

import { NextResponse } from 'next/server';
import type { Json } from '@/types/supabase';
import { getSystemClient } from '@/shared/api/supabase/system';
import { computeFollowUpPriority } from '@/shared/lib/follow-up-priority';
import { renderReason } from '@/shared/lib/follow-up-reasons';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';
import { differenceInDays, parseISO } from 'date-fns';
import type { AionFollowUpPlaybook, AionConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Playbook helpers ─────────────────────────────────────────────────────────

function getTimingOverrides(
  playbook: AionFollowUpPlaybook | undefined,
  deal: { status: string; event_archetype: string | null },
): { inquiry?: number; proposal?: number; contract_sent?: number } | undefined {
  if (!playbook?.rules?.length) return undefined;

  const timingRules = playbook.rules.filter((r) => r.category === 'timing' && r.structured?.days != null);
  if (timingRules.length === 0) return undefined;

  const overrides: { inquiry?: number; proposal?: number; contract_sent?: number } = {};

  for (const rule of timingRules) {
    // Check if this rule applies to this deal's event type
    if (rule.conditions?.event_type && deal.event_archetype &&
        !deal.event_archetype.toLowerCase().includes(rule.conditions.event_type.toLowerCase())) {
      continue;
    }

    const stage = rule.conditions?.deal_stage;
    if (stage === 'inquiry' || stage === 'all') overrides.inquiry = rule.structured!.days!;
    if (stage === 'proposal' || stage === 'all') overrides.proposal = rule.structured!.days!;
    if (stage === 'contract_sent' || stage === 'all') overrides.contract_sent = rule.structured!.days!;

    // If no stage specified, apply to all stages
    if (!stage) {
      overrides.inquiry = rule.structured!.days!;
      overrides.proposal = rule.structured!.days!;
      overrides.contract_sent = rule.structured!.days!;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function getChannelOverride(
  playbook: AionFollowUpPlaybook | undefined,
  deal: { status: string; event_archetype: string | null },
  signal: string,
): string | null {
  if (!playbook?.rules?.length) return null;

  const channelRules = playbook.rules.filter((r) => r.category === 'channel' && r.structured?.channel);

  for (const rule of channelRules) {
    if (rule.conditions?.event_type && deal.event_archetype &&
        !deal.event_archetype.toLowerCase().includes(rule.conditions.event_type.toLowerCase())) {
      continue;
    }
    if (rule.conditions?.deal_stage && rule.conditions.deal_stage !== deal.status) continue;
    if (rule.conditions?.signal && rule.conditions.signal !== signal) continue;
    return rule.structured!.channel!;
  }

  return null;
}

function isDayBlocked(playbook: AionFollowUpPlaybook | undefined): boolean {
  if (!playbook?.rules?.length) return false;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  return playbook.rules.some((r) =>
    r.category === 'scheduling' && r.structured?.blocked_days?.includes(today),
  );
}

function shouldBackOff(
  playbook: AionFollowUpPlaybook | undefined,
  followUpCount: number,
): boolean {
  if (!playbook?.rules?.length) return false;
  const backoffRules = playbook.rules.filter((r) => r.category === 'backoff' && r.structured?.max_attempts != null);
  for (const rule of backoffRules) {
    if (followUpCount >= rule.structured!.max_attempts!) return true;
  }
  return false;
}

type ScoredDeal = {
  dealId: string;
  workspaceId: string;
  score: number;
  reasonType: string;
  reason: string;
  suggestedAction: string | null;
  suggestedChannel: string | null;
  followUpCategory: 'sales' | 'ops' | 'nurture';
  // Typed as `Json` so it passes the supabase-js 2.103 strict-insert check
  // on follow_up_queue.context_snapshot (jsonb) without a cast.
  contextSnapshot: Json;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();
  const db = supabase;
  let queued = 0;
  let removed = 0;
  let skipped = 0;
  let escalated = 0;
  // Workspace IDs touched by Phase 1 (deal scan) — consumed by Phase 2
  // (insight evaluation) which lives in a sibling try block and would
  // otherwise reference out-of-scope `deals`. Declared at function scope
  // so both phases can see it.
  const dealWorkspaceIds = new Set<string>();

  try {
    // 1. Fetch all open deals
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, workspace_id, status, stage_id, created_at, proposed_date, budget_estimated, title, organization_id, owner_user_id, event_archetype')
      .in('status', [...OPEN_DEAL_STATUSES])
      .is('archived_at', null);

    if (dealsErr || !deals?.length) {
      return NextResponse.json({ queued: 0, removed: 0, skipped: 0, note: 'No open deals' });
    }

    // 1b. Fetch per-stage rotting_days for every stage the current deal set
    //     references. Phase 2c: lets workspaces tune stall thresholds via their
    //     own ops.pipeline_stages.rotting_days column. Falls back to the
    //     hardcoded STALL_STAGE_META values (via follow-up-priority) when a
    //     stage or its rotting_days is missing.
    const stageIds = [...new Set(deals.map((d) => (d as { stage_id: string | null }).stage_id).filter(Boolean) as string[])];
    const stageRottingMap = new Map<string, number | null>();
    if (stageIds.length > 0) {
      const { data: stageRows } = await (supabase as any)
        .schema('ops')
        .from('pipeline_stages')
        .select('id, rotting_days')
        .in('id', stageIds);
      for (const row of (stageRows ?? []) as Array<{ id: string; rotting_days: number | null }>) {
        stageRottingMap.set(row.id, row.rotting_days);
      }
    }

    // Track workspace IDs for Phase 2 insight evaluation (separate try block).
    for (const d of deals) dealWorkspaceIds.add(d.workspace_id);

    const dealIds = deals.map((d) => d.id);

    // 2. Batch-fetch latest non-draft proposal per deal (window function via ordering + dedup)
    const { data: proposals } = await supabase
      .from('proposals')
      .select('id, deal_id, created_at, updated_at, status, view_count, last_viewed_at, email_bounced_at')
      .in('deal_id', dealIds)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    const proposalMap = new Map<string, (typeof proposals extends (infer T)[] | null ? T : never)>();
    for (const p of proposals ?? []) {
      if (!proposalMap.has(p.deal_id)) {
        proposalMap.set(p.deal_id, p);
      }
    }

    // 3. Batch-fetch most recent follow_up_log entry per deal
    const { data: logEntries } = await db
      .schema('ops')
      .from('follow_up_log')
      .select('deal_id, created_at')
      .in('deal_id', dealIds)
      .order('created_at', { ascending: false });

    const lastLogMap = new Map<string, { deal_id: string; created_at: string }>();
    for (const entry of (logEntries ?? []) as { deal_id: string; created_at: string }[]) {
      if (!lastLogMap.has(entry.deal_id)) {
        lastLogMap.set(entry.deal_id, entry);
      }
    }

    // 3b. Batch-fetch workspace configs for playbook rules
    const workspaceIds = [...new Set(deals.map((d) => d.workspace_id))];
    const { data: workspaceConfigs } = await db
      .from('workspaces')
      .select('id, aion_config')
      .in('id', workspaceIds);

    const playbookMap = new Map<string, AionFollowUpPlaybook>();
    for (const ws of ((workspaceConfigs ?? []) as unknown as Array<{ id: string; aion_config: any }>)) {
      const config = ws.aion_config as AionConfig | null;
      if (config?.follow_up_playbook?.rules?.length) {
        playbookMap.set(ws.id, config.follow_up_playbook);
      }
    }

    // 3c. Batch-fetch follow-up action counts per deal (for backoff rules)
    const { data: logCounts } = await db
      .schema('ops')
      .from('follow_up_log')
      .select('deal_id')
      .in('deal_id', dealIds)
      .in('action_type', ['sms_sent', 'email_sent', 'call_logged']);

    const followUpCountMap = new Map<string, number>();
    for (const entry of (logCounts ?? []) as { deal_id: string }[]) {
      followUpCountMap.set(entry.deal_id, (followUpCountMap.get(entry.deal_id) ?? 0) + 1);
    }

    const now = new Date();

    // 4. Expire snoozed items before reading current state
    const { data: snoozedExpired } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id, deal_id')
      .eq('status', 'snoozed')
      .lte('snoozed_until', now.toISOString());

    if ((snoozedExpired as any[])?.length) {
      await db
        .schema('ops')
        .from('follow_up_queue')
        .update({ status: 'pending', snoozed_until: null })
        .in('id', (snoozedExpired as { id: string }[]).map((s) => s.id));
    }

    // 5. Batch-fetch existing queue items (after snooze expiry)
    const { data: existingQueue } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id, deal_id, status, acted_at, created_at')
      .in('deal_id', dealIds);

    const queueMap = new Map<string, { id: string; deal_id: string; status: string; acted_at: string | null; created_at: string }>();
    for (const item of (existingQueue ?? []) as { id: string; deal_id: string; status: string; acted_at: string | null; created_at: string }[]) {
      queueMap.set(item.deal_id, item);
    }

    // 5. Batch-fetch client names for context snapshot
    const orgIds = [...new Set(deals.map((d) => d.organization_id).filter(Boolean) as string[])];
    const { data: orgEntities } = orgIds.length
      ? await db.schema('directory').from('entities').select('id, display_name').in('id', orgIds)
      : { data: [] };
    const orgNameMap = new Map(((orgEntities ?? []) as { id: string; display_name: string | null }[]).map((e) => [e.id, e.display_name]));

    // 5b. Batch-fetch entity communication preferences for channel overrides
    const { data: entityPrefs } = orgIds.length
      ? await db.schema('cortex').from('aion_memory')
          .select('entity_id, fact')
          .in('entity_id', orgIds)
          .eq('scope', 'episodic')
          .order('updated_at', { ascending: false })
      : { data: [] };

    const entityPrefMap = new Map<string, string[]>();
    for (const pref of (entityPrefs ?? []) as { entity_id: string; fact: string }[]) {
      if (!entityPrefMap.has(pref.entity_id)) entityPrefMap.set(pref.entity_id, []);
      entityPrefMap.get(pref.entity_id)!.push(pref.fact);
    }

    // 5c. Build date hold pressure map: proposed_date → set of deal IDs per workspace
    const dateHoldMap = new Map<string, Set<string>>();
    for (const d of deals) {
      if (!d.proposed_date) continue;
      const key = `${d.workspace_id}:${d.proposed_date}`;
      if (!dateHoldMap.has(key)) dateHoldMap.set(key, new Set());
      dateHoldMap.get(key)!.add(d.id);
    }

    // 6. Score each deal
    const scored: ScoredDeal[] = [];

    for (const deal of deals) {
      try {
      const existing = queueMap.get(deal.id);

      // Skip recently dismissed (within 30 days)
      if (existing?.status === 'dismissed') {
        const dismissedAt = new Date(existing.created_at);
        if (differenceInDays(now, dismissedAt) < 30) {
          skipped++;
          continue;
        }
      }

      // Skip recently acted (within 7 days)
      if (existing?.status === 'acted' && existing.acted_at) {
        if (differenceInDays(now, parseISO(existing.acted_at)) < 7) {
          skipped++;
          continue;
        }
      }

      const proposal = proposalMap.get(deal.id) ?? null;
      const lastLogEntry = lastLogMap.get(deal.id) ?? null;

      // Playbook overrides
      const playbook = playbookMap.get(deal.workspace_id);

      // Skip all deals for this workspace if today is a blocked day
      if (isDayBlocked(playbook)) {
        skipped++;
        continue;
      }

      // Backoff: skip if max follow-up attempts reached
      const followUpCount = followUpCountMap.get(deal.id) ?? 0;
      if (shouldBackOff(playbook, followUpCount)) {
        skipped++;
        continue;
      }

      const timingOverrides = getTimingOverrides(playbook, {
        status: deal.status,
        event_archetype: deal.event_archetype ?? null,
      });

      const daysSinceActivity = lastLogEntry
        ? differenceInDays(now, parseISO(lastLogEntry.created_at))
        : null;

      let hasContestedDate = false;
      if (deal.proposed_date) {
        const dateKey = `${deal.workspace_id}:${deal.proposed_date}`;
        const dealsOnDate = dateHoldMap.get(dateKey);
        hasContestedDate = !!(dealsOnDate && dealsOnDate.size > 1);
      }

      const dealStageId = (deal as { stage_id: string | null }).stage_id;
      const stageRottingDays = dealStageId ? (stageRottingMap.get(dealStageId) ?? null) : null;

      const scoreResult = computeFollowUpPriority({
        deal: {
          status: deal.status,
          createdAt: deal.created_at,
          proposedDate: deal.proposed_date,
          budgetEstimated: (deal as any).budget_estimated as number | null,
          ownerUserId: (deal as any).owner_user_id as string | null,
          stageRottingDays,
        },
        proposal: proposal
          ? {
              createdAt: proposal.created_at,
              updatedAt: proposal.updated_at,
              status: (proposal as any).status ?? null,
              viewCount: (proposal as any).view_count ?? 0,
              lastViewedAt: (proposal as any).last_viewed_at ?? null,
              emailBouncedAt: (proposal as any).email_bounced_at ?? null,
            }
          : null,
        daysSinceActivity,
        hasContestedDate,
        thresholdOverrides: timingOverrides,
        now,
      });

      if (!scoreResult) {
        skipped++;
        continue;
      }

      const score = scoreResult.score;
      const reasonType = scoreResult.reasonType;
      const { reason, suggestedAction, suggestedChannel: defaultChannel } = renderReason(
        reasonType,
        scoreResult.reasonContext,
      );

      // Channel override: entity preferences take priority, then playbook rules
      let channelOverride: string | null = null;
      if (deal.organization_id && entityPrefMap.has(deal.organization_id)) {
        const prefs = entityPrefMap.get(deal.organization_id)!;
        const channelPref = prefs.find((p) => /\b(prefer|use|text|email|call|phone)\b/i.test(p) && /\b(sms|text|email|call|phone)\b/i.test(p));
        if (channelPref) {
          if (/\bemail\b/i.test(channelPref)) channelOverride = 'email';
          else if (/\b(text|sms)\b/i.test(channelPref)) channelOverride = 'sms';
          else if (/\b(call|phone)\b/i.test(channelPref)) channelOverride = 'call';
        }
      }
      if (!channelOverride) {
        channelOverride = getChannelOverride(playbook, {
          status: deal.status,
          event_archetype: deal.event_archetype ?? null,
        }, reasonType);
      }
      const suggestedChannel = channelOverride ?? defaultChannel;

      scored.push({
        dealId: deal.id,
        workspaceId: deal.workspace_id,
        score,
        reasonType,
        reason,
        suggestedAction,
        suggestedChannel,
        followUpCategory: 'sales',
        contextSnapshot: {
          deal_title: deal.title,
          client_name: deal.organization_id ? orgNameMap.get(deal.organization_id) ?? null : null,
          event_date: deal.proposed_date,
          proposal_status: proposal?.status ?? null,
          proposal_views: (proposal as any)?.view_count ?? 0,
        },
      });
      } catch (dealErr) {
        console.error(`[cron/follow-up-queue] Error scoring deal ${deal.id}:`, dealErr);
        skipped++;
      }
    }

    // 6b. Second pass: proposal-level signals (draft_aging, unsigned, deposit_overdue)
    // Only for deals NOT already scored (to avoid overwriting higher-priority signals).
    const alreadyScoredDealIds = new Set(scored.map((s) => s.dealId));

    // Draft aging: proposals sitting in draft > 3 days
    const { data: draftProposals } = await supabase
      .from('proposals')
      .select('id, deal_id, created_at, workspace_id')
      .eq('status', 'draft')
      .lt('created_at', new Date(now.getTime() - 3 * 86_400_000).toISOString());

    for (const dp of (draftProposals ?? []) as { deal_id: string; created_at: string; workspace_id: string }[]) {
      if (alreadyScoredDealIds.has(dp.deal_id)) continue;
      const days = differenceInDays(now, parseISO(dp.created_at));
      const { reason, suggestedAction, suggestedChannel } = renderReason('draft_aging', { daysSinceDraft: days });
      scored.push({
        dealId: dp.deal_id, workspaceId: dp.workspace_id, score: 7,
        reasonType: 'draft_aging', reason, suggestedAction, suggestedChannel,
        followUpCategory: 'sales', contextSnapshot: { days_since_draft: days },
      });
      alreadyScoredDealIds.add(dp.deal_id);
    }

    // Unsigned: accepted proposals not yet signed > 3 days
    const { data: unsignedProposals } = await supabase
      .from('proposals')
      .select('id, deal_id, accepted_at, workspace_id')
      .eq('status', 'accepted')
      .is('signed_at', null)
      .lt('accepted_at', new Date(now.getTime() - 3 * 86_400_000).toISOString());

    for (const up of (unsignedProposals ?? []) as { deal_id: string; accepted_at: string; workspace_id: string }[]) {
      if (alreadyScoredDealIds.has(up.deal_id)) continue;
      const days = differenceInDays(now, parseISO(up.accepted_at));
      const { reason, suggestedAction, suggestedChannel } = renderReason('unsigned', { daysSinceAcceptance: days });
      scored.push({
        dealId: up.deal_id, workspaceId: up.workspace_id, score: 9,
        reasonType: 'unsigned', reason, suggestedAction, suggestedChannel,
        followUpCategory: 'sales', contextSnapshot: { days_since_acceptance: days },
      });
      alreadyScoredDealIds.add(up.deal_id);
    }

    // 7. Upsert scored deals
    for (const item of scored) {
      const existing = queueMap.get(item.dealId);

      if (existing && (existing.status === 'pending' || existing.status === 'snoozed')) {
        // Update existing pending/snoozed item with new score
        await db
          .schema('ops')
          .from('follow_up_queue')
          .update({
            priority_score: item.score,
            reason: item.reason,
            reason_type: item.reasonType,
            suggested_action: item.suggestedAction,
            suggested_channel: item.suggestedChannel,
            follow_up_category: item.followUpCategory,
            context_snapshot: item.contextSnapshot,
          })
          .eq('id', existing.id);
      } else {
        // Insert new queue item (or re-queue after acted/dismissed expiry)
        if (existing) {
          // Delete the old acted/dismissed item first
          await db.schema('ops').from('follow_up_queue').delete().eq('id', existing.id);
        }
        await db
          .schema('ops')
          .from('follow_up_queue')
          .insert({
            workspace_id: item.workspaceId,
            deal_id: item.dealId,
            priority_score: item.score,
            reason: item.reason,
            reason_type: item.reasonType,
            suggested_action: item.suggestedAction,
            suggested_channel: item.suggestedChannel,
            follow_up_category: item.followUpCategory,
            context_snapshot: item.contextSnapshot,
            status: 'pending',
          });
      }
      queued++;
    }

    // 7.5 Escalate-in-place for rows that already existed and were NOT
    //     re-scored this run. Priority climbs by 15% per run (capped at
    //     priority_ceiling), escalation_count bumps, last_escalated_at
    //     stamps. Dismiss/snooze resets escalation_count + priority_score.
    //     See docs/reference/code/follow-up-engine.md and P0 plan §5.
    const scoredDealIds = new Set(scored.map((s) => s.dealId));
    // Columns priority_ceiling/escalation_count/last_escalated_at/superseded_at
    // were added in migration 20260423000000; generated types are stale until
    // `npm run db:types` runs post-deploy. Route through `any` for these
    // reads/writes — same pattern the ops.* code uses elsewhere.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale types
    const opsDb = db.schema('ops') as any;

    const { data: pendingForEscalation } = await opsDb
      .from('follow_up_queue')
      .select('id, deal_id, priority_score, priority_ceiling, escalation_count, reason_type')
      .eq('status', 'pending')
      .is('superseded_at', null);

    const nowIso = now.toISOString();
    for (const row of ((pendingForEscalation ?? []) as unknown) as Array<{
      id: string;
      deal_id: string;
      priority_score: number;
      priority_ceiling: number;
      escalation_count: number;
      reason_type: string;
    }>) {
      // Rows we just re-scored above get the fresh score; skip escalation.
      if (scoredDealIds.has(row.deal_id)) continue;
      // Thank-you follow-ups fire once and don't climb — they're not a nag.
      if (row.reason_type === 'thank_you') continue;
      // Safety cap so a forgotten row doesn't loop forever.
      if (row.escalation_count >= 100) continue;

      const nextScore = Math.min(row.priority_score * 1.15, row.priority_ceiling);
      if (nextScore > row.priority_score) {
        await opsDb
          .from('follow_up_queue')
          .update({
            priority_score: nextScore,
            escalation_count: row.escalation_count + 1,
            last_escalated_at: nowIso,
          })
          .eq('id', row.id);
        escalated++;
      }
    }

    // 8. Won/lost deals: stamp superseded_at on remaining pending rows
    //    (record_deal_transition supersedes at transition time; this is a
    //    belt-and-suspenders sweep for deals won before supersession
    //    shipped). thank_you enrollments stay — they're the whole point
    //    of the won stage's on_enter trigger.
    const { data: wonLostDeals } = await supabase
      .from('deals')
      .select('id')
      .in('status', ['won', 'lost']);

    if ((wonLostDeals ?? []).length) {
      const wonLostIds = wonLostDeals!.map((d) => d.id);
      const { data: staleItems } = await opsDb
        .from('follow_up_queue')
        .select('id, deal_id, workspace_id, reason_type')
        .in('deal_id', wonLostIds)
        .eq('status', 'pending')
        .is('superseded_at', null)
        .neq('reason_type', 'thank_you');

      for (const stale of ((staleItems ?? []) as unknown) as Array<{
        id: string;
        deal_id: string;
        workspace_id: string;
        reason_type: string;
      }>) {
        await opsDb
          .from('follow_up_queue')
          .update({ superseded_at: nowIso })
          .eq('id', stale.id);
        await db.schema('ops').from('follow_up_log').insert({
          workspace_id: stale.workspace_id,
          deal_id: stale.deal_id,
          action_type: 'system_removed',
          channel: 'system',
          summary: 'Deal status changed — follow-up superseded',
          queue_item_id: stale.id,
        });
        removed++;
      }
    }
  } catch (err) {
    console.error('[cron/follow-up-queue] Fatal:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // ── Phase 2: Evaluate proactive insights ──────────────────────────────────
  let insightsGenerated = 0;
  try {
    const { evaluateAllInsights, upsertInsights, resolveStaleInsights } = await import('@/app/api/aion/lib/insight-evaluators');
    // Unique workspace IDs populated during Phase 1 (deal scan).
    const wsIds = [...dealWorkspaceIds];
    for (const wsId of wsIds) {
      const insights = await evaluateAllInsights(wsId);
      await upsertInsights(wsId, insights);
      await resolveStaleInsights(wsId);
      insightsGenerated += insights.length;
    }
  } catch (err) {
    console.error('[cron/follow-up-queue] Insight evaluation error:', err);
  }

  // ── Phase 3: Dwell-SLA dispatch ────────────────────────────────────────────
  // Folded in here instead of its own Vercel cron entry so we stay under the
  // project's cron-registration limit. The standalone endpoint at
  // /api/cron/dwell-sla still exists and can be invoked manually when
  // debugging; this call covers the scheduled path once per day.
  let slaEvaluated = 0;
  let slaSuccess = 0;
  try {
    const { dispatchDwellSla } = await import('@/shared/lib/triggers/dwell-sla');
    const slaSummary = await dispatchDwellSla();
    slaEvaluated = slaSummary.evaluated;
    slaSuccess = slaSummary.success;
  } catch (err) {
    console.error('[cron/follow-up-queue] Dwell-SLA dispatch error:', err);
  }

  console.log(`[cron/follow-up-queue] Done: queued=${queued}, removed=${removed}, escalated=${escalated}, skipped=${skipped}, insights=${insightsGenerated}, sla_evaluated=${slaEvaluated}, sla_success=${slaSuccess}`);
  return NextResponse.json({
    queued,
    removed,
    escalated,
    skipped,
    insights: insightsGenerated,
    sla_evaluated: slaEvaluated,
    sla_success: slaSuccess,
  });
}

