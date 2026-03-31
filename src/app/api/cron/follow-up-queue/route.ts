/**
 * Cron: Follow-up queue engine
 * Runs daily (Vercel Cron). Scans all open deals across all workspaces,
 * computes priority scores, and upserts into ops.follow_up_queue.
 *
 * Uses system client (service role) — cross-workspace by design.
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { computeStallSignalFromRaw } from '@/shared/lib/stall-signal';
import { differenceInDays, parseISO } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_TO_STAGE: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
};

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
  contextSnapshot: Record<string, unknown>;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();
  const db = supabase as any;
  let queued = 0;
  let removed = 0;
  let skipped = 0;

  try {
    // 1. Fetch all open deals
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, workspace_id, status, created_at, proposed_date, budget_estimated, title, organization_id, owner_user_id')
      .in('status', ['inquiry', 'proposal', 'contract_sent'])
      .is('archived_at', null);

    if (dealsErr || !deals?.length) {
      return NextResponse.json({ queued: 0, removed: 0, skipped: 0, note: 'No open deals' });
    }

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
      if (lastLogEntry) {
        const daysSinceActivity = differenceInDays(now, parseISO(lastLogEntry.created_at));
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

      // Skip low-score deals
      if (score <= 0) {
        skipped++;
        continue;
      }

      const reasonType = topSignal.type;
      const { reason, suggestedAction, suggestedChannel } = buildReasonText(reasonType, stall, proposal);

      scored.push({
        dealId: deal.id,
        workspaceId: deal.workspace_id,
        score,
        reasonType,
        reason,
        suggestedAction,
        suggestedChannel,
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

  console.log(`[cron/follow-up-queue] Done: queued=${queued}, removed=${removed}, skipped=${skipped}`);
  return NextResponse.json({ queued, removed, skipped });
}

function buildReasonText(
  reasonType: string,
  stall: ReturnType<typeof computeStallSignalFromRaw>,
  proposal: { status?: string } | null,
): { reason: string; suggestedAction: string | null; suggestedChannel: string | null } {
  switch (reasonType) {
    case 'stall':
      return {
        reason: stall
          ? `${stall.stageName} stage — ${stall.daysInStage} days without progress`
          : 'Deal appears stalled',
        suggestedAction: stall?.suggestion ?? 'Check in with the client',
        suggestedChannel: 'email',
      };
    case 'engagement_hot':
      return {
        reason: 'Client is actively viewing the proposal',
        suggestedAction: 'Strike while interest is high — call or send a personal note',
        suggestedChannel: 'call',
      };
    case 'deadline_proximity':
      return {
        reason: 'Event date is approaching',
        suggestedAction: 'Confirm details and push for commitment',
        suggestedChannel: 'email',
      };
    case 'no_owner':
      return {
        reason: 'No team member assigned to this deal',
        suggestedAction: 'Assign an owner so nothing falls through the cracks',
        suggestedChannel: 'manual',
      };
    case 'no_activity':
      return {
        reason: 'No recent follow-up activity',
        suggestedAction: 'Reach out to keep momentum',
        suggestedChannel: 'email',
      };
    case 'proposal_bounced':
      return {
        reason: 'Proposal email bounced',
        suggestedAction: 'Get the correct email address and resend',
        suggestedChannel: 'manual',
      };
    default:
      return {
        reason: 'Follow-up recommended',
        suggestedAction: null,
        suggestedChannel: null,
      };
  }
}
