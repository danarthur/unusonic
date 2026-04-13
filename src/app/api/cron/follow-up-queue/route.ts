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
import { computeStallSignalFromRaw } from '@/shared/lib/stall-signal';
import { differenceInDays, parseISO } from 'date-fns';
import type { AionFollowUpPlaybook, AionConfig } from '@/app/(dashboard)/(features)/brain/actions/aion-config-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_TO_STAGE: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
};

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

function isWithinHours(dateStr: string, hours: number): boolean {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs >= 0 && diffMs <= hours * 3600000;
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
  // Workspace IDs touched by Phase 1 (deal scan) — consumed by Phase 2
  // (insight evaluation) which lives in a sibling try block and would
  // otherwise reference out-of-scope `deals`. Declared at function scope
  // so both phases can see it.
  const dealWorkspaceIds = new Set<string>();

  try {
    // 1. Fetch all open deals
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, workspace_id, status, created_at, proposed_date, budget_estimated, title, organization_id, owner_user_id, event_archetype')
      .in('status', ['inquiry', 'proposal', 'contract_sent'])
      .is('archived_at', null);

    if (dealsErr || !deals?.length) {
      return NextResponse.json({ queued: 0, removed: 0, skipped: 0, note: 'No open deals' });
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
      const currentStage = STATUS_TO_STAGE[deal.status] ?? 0;

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

      let score = 0;
      let topSignal = { type: 'no_activity' as string, weight: 0 };

      // Stall signal
      const stall = computeStallSignalFromRaw({
        status: deal.status,
        createdAt: deal.created_at,
        proposalCreatedAt: proposal?.created_at ?? null,
        proposalUpdatedAt: proposal?.updated_at ?? null,
        proposedDate: deal.proposed_date,
        currentStage,
        thresholdOverrides: timingOverrides,
      });
      if (stall) {
        const stallScore = stall.urgent ? 15 : (stall.stalled ? 8 : 0);
        score += stallScore;
        if (stallScore > topSignal.weight) {
          topSignal = { type: 'stall', weight: stallScore };
        }
      }

      // Event proximity
      if (deal.proposed_date) {
        const daysUntil = Math.max(0, differenceInDays(parseISO(deal.proposed_date), now));
        const proximityScore = Math.max(0, 30 - daysUntil) * 1.5;
        score += proximityScore;
        if (proximityScore > topSignal.weight) {
          topSignal = { type: 'deadline_proximity', weight: proximityScore };
        }
      }

      // Deal value
      const budgetEstimated = (deal as any).budget_estimated as number | null;
      if (budgetEstimated) {
        score += Math.min(5, budgetEstimated / 10000);
      }

      // Engagement signals
      if (proposal) {
        const viewCount = (proposal as any).view_count as number | null ?? 0;
        const lastViewedAt = (proposal as any).last_viewed_at as string | null;
        const emailBouncedAt = (proposal as any).email_bounced_at as string | null;

        if (viewCount >= 2 && lastViewedAt && isWithinHours(lastViewedAt, 48)) {
          score += 25;
          if (25 > topSignal.weight) {
            topSignal = { type: 'engagement_hot', weight: 25 };
          }
        } else if (viewCount > 0) {
          score += 5;
        }

        if (emailBouncedAt) {
          score += 12;
          if (12 > topSignal.weight) {
            topSignal = { type: 'proposal_bounced', weight: 12 };
          }
        }
      }

      // No owner
      if (!(deal as any).owner_user_id) {
        score += 8;
        if (8 > topSignal.weight) {
          topSignal = { type: 'no_owner', weight: 8 };
        }
      }

      // No recent activity
      let daysSinceActivity: number | null = null;
      if (lastLogEntry) {
        daysSinceActivity = differenceInDays(now, parseISO(lastLogEntry.created_at));
        if (daysSinceActivity > 14) {
          score += 6;
          if (6 > topSignal.weight) topSignal = { type: 'no_activity', weight: 6 };
        } else if (daysSinceActivity > 7) {
          score += 3;
        }
      } else {
        score += 4;
        if (4 > topSignal.weight) topSignal = { type: 'no_activity', weight: 4 };
      }

      // Date hold pressure: another inquiry shares this date
      if (deal.proposed_date) {
        const dateKey = `${deal.workspace_id}:${deal.proposed_date}`;
        const dealsOnDate = dateHoldMap.get(dateKey);
        if (dealsOnDate && dealsOnDate.size > 1 && deal.status !== 'contract_sent') {
          score += 10;
          if (10 > topSignal.weight) {
            topSignal = { type: 'date_hold_pressure', weight: 10 };
          }
        }
      }

      // Skip low-score deals
      if (score <= 0) {
        skipped++;
        continue;
      }

      const daysUntilEvent = deal.proposed_date
        ? Math.max(0, differenceInDays(parseISO(deal.proposed_date), now))
        : null;

      const reasonType = topSignal.type;
      const { reason, suggestedAction, suggestedChannel: defaultChannel } = buildReasonText(reasonType, {
        stall,
        proposal,
        daysUntilEvent,
        daysSinceActivity,
      });

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

    // 8. Remove queue items for deals no longer qualifying (won/lost)
    const { data: wonLostDeals } = await supabase
      .from('deals')
      .select('id')
      .in('status', ['won', 'lost']);

    if ((wonLostDeals ?? []).length) {
      const wonLostIds = wonLostDeals!.map((d) => d.id);
      const { data: staleItems } = await db
        .schema('ops')
        .from('follow_up_queue')
        .select('id, deal_id, workspace_id')
        .in('deal_id', wonLostIds)
        .in('status', ['pending', 'snoozed']);

      for (const stale of (staleItems ?? []) as { id: string; deal_id: string; workspace_id: string }[]) {
        await db.schema('ops').from('follow_up_queue').delete().eq('id', stale.id);
        await db.schema('ops').from('follow_up_log').insert({
          workspace_id: stale.workspace_id,
          deal_id: stale.deal_id,
          action_type: 'system_removed',
          channel: 'system',
          summary: 'Deal status changed — removed from follow-up queue',
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

  console.log(`[cron/follow-up-queue] Done: queued=${queued}, removed=${removed}, skipped=${skipped}, insights=${insightsGenerated}`);
  return NextResponse.json({ queued, removed, skipped, insights: insightsGenerated });
}

type ReasonContext = {
  stall: ReturnType<typeof computeStallSignalFromRaw>;
  proposal: { status?: string } | null;
  daysUntilEvent: number | null;
  daysSinceActivity: number | null;
};

function buildReasonText(
  reasonType: string,
  ctx: ReasonContext,
): { reason: string; suggestedAction: string | null; suggestedChannel: string | null } {
  const { stall, daysUntilEvent, daysSinceActivity } = ctx;

  switch (reasonType) {
    case 'stall': {
      if (!stall) return { reason: 'This deal may need attention.', suggestedAction: 'Check in with the client', suggestedChannel: 'email' };
      const days = stall.daysInStage;
      const stage = stall.stageName;
      if (stage === 'Inquiry') {
        return {
          reason: `This inquiry has been sitting for ${days} days without a proposal. Building one gives you a reason to re-engage.`,
          suggestedAction: 'Draft a proposal or reach out to clarify their needs',
          suggestedChannel: 'call',
        };
      }
      if (stage === 'Contract Sent') {
        return {
          reason: `Contract sent ${days} days ago with no response. A quick call to check if they have questions keeps it moving.`,
          suggestedAction: 'Call to see if they need anything before signing',
          suggestedChannel: 'call',
        };
      }
      // Proposal stage (most common)
      return {
        reason: `The proposal has been out for ${days} days — a check-in referencing their event date gives you a natural reason to call.`,
        suggestedAction: 'A short, specific message works better than "just checking in"',
        suggestedChannel: 'sms',
      };
    }

    case 'engagement_hot':
      return {
        reason: "They've viewed the proposal multiple times recently — they're actively considering. A quick call while it's on their mind.",
        suggestedAction: 'Call now or send a personal text acknowledging their interest',
        suggestedChannel: 'call',
      };

    case 'deadline_proximity': {
      const daysOut = daysUntilEvent ?? 0;
      if (daysOut <= 14) {
        return {
          reason: `The event is ${daysOut} days out with no contract signed. This is urgent — time pressure is your strongest pretext.`,
          suggestedAction: `"We need to lock this in soon to guarantee the date"`,
          suggestedChannel: 'call',
        };
      }
      return {
        reason: `The event is ${daysOut} days out and no contract is signed. Referencing the timeline gives you a natural reason to follow up.`,
        suggestedAction: 'Mention the date and ask if they are ready to move forward',
        suggestedChannel: 'sms',
      };
    }

    case 'date_hold_pressure':
      return {
        reason: "You have another inquiry for this date. A date hold is the most effective follow-up line — \"I'm holding your date but have another inquiry.\"",
        suggestedAction: 'Let them know the date may not be available much longer',
        suggestedChannel: 'sms',
      };

    case 'no_owner':
      return {
        reason: 'Nobody is assigned to this deal. It needs an owner before it needs a follow-up.',
        suggestedAction: 'Assign someone so this doesn\'t fall through the cracks',
        suggestedChannel: 'manual',
      };

    case 'no_activity': {
      const days = daysSinceActivity;
      if (days !== null && days > 0) {
        return {
          reason: `No contact logged in ${days} days. If you've been in touch outside the system, log it so the queue stays accurate.`,
          suggestedAction: 'A quick text or call keeps the momentum going',
          suggestedChannel: 'sms',
        };
      }
      return {
        reason: 'No follow-up activity has been logged on this deal yet.',
        suggestedAction: 'Reach out to start the conversation, or log a past interaction',
        suggestedChannel: 'sms',
      };
    }

    case 'proposal_bounced':
      return {
        reason: "The proposal email bounced — the client may not know you sent it. Get the right address and resend.",
        suggestedAction: 'Call or text to confirm their email, then resend the proposal',
        suggestedChannel: 'call',
      };

    case 'proposal_sent':
      return {
        reason: 'Proposal delivered — give them a few days, then check if they have had a chance to look.',
        suggestedAction: 'Wait 2-3 days, then a short text asking if they received it',
        suggestedChannel: 'sms',
      };

    default:
      return {
        reason: 'This deal could use some attention.',
        suggestedAction: null,
        suggestedChannel: null,
      };
  }
}
