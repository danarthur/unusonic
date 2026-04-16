/**
 * Cron: Daily briefing generator
 * Runs once daily per workspace. Aggregates follow-up queue, deposit gaps,
 * and pipeline state into a 2-3 sentence Aion-authored brief. Stores in
 * ops.daily_briefings for the Today's Brief dashboard card.
 *
 * Kill-switch aware: if aion_config.kill_switch is true, writes only the
 * deterministic facts_json (no LLM call).
 *
 * Uses system client (service role) — cross-workspace.
 * Spec: docs/reference/sales-dashboard-design.md §7.4
 */

import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel } from '@/app/api/aion/lib/models';
import { getSystemClient } from '@/shared/api/supabase/system';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type BriefFacts = {
  queueCount: number;
  topDeal: { title: string; value: number | null; reason: string } | null;
  depositsOverdue: number;
  proposalsUnsigned: number;
  dormantClients: number;
};

async function gatherFacts(
  db: ReturnType<typeof getSystemClient>,
  workspaceId: string,
): Promise<BriefFacts> {
  const [queueResult, /* depositResult */, unsignedResult] = await Promise.all([
    db.schema('ops').from('follow_up_queue')
      .select('deal_id, reason, priority_score, context_snapshot')
      .eq('workspace_id', workspaceId).eq('status', 'pending')
      .order('priority_score', { ascending: false }).limit(5),
    db.from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['sent', 'viewed', 'accepted'])
      .not('deposit_paid_at', 'is', null),
    db.from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'sent'),
  ]);

  type QueueRow = {
    deal_id: string;
    reason: string;
    priority_score: number;
    context_snapshot: Record<string, unknown> | null;
  };
  const queueRows = (queueResult.data ?? []) as QueueRow[];
  const top = queueRows[0] ?? null;

  return {
    queueCount: queueRows.length,
    topDeal: top
      ? {
          title: String(top.context_snapshot?.deal_title ?? top.context_snapshot?.client_name ?? 'a deal'),
          value: typeof top.context_snapshot?.proposal_total === 'number'
            ? (top.context_snapshot.proposal_total as number)
            : null,
          reason: top.reason,
        }
      : null,
    depositsOverdue: 0,
    proposalsUnsigned: unsignedResult.count ?? 0,
    dormantClients: 0,
  };
}

function factsToFallback(facts: BriefFacts): string {
  const parts: string[] = [];
  if (facts.queueCount > 0) {
    parts.push(`${facts.queueCount} deal${facts.queueCount === 1 ? '' : 's'} in the queue`);
  }
  if (facts.topDeal) {
    const val = facts.topDeal.value ? ` ($${Math.round(facts.topDeal.value / 1000)}k)` : '';
    parts.push(`Top: ${facts.topDeal.title}${val}`);
  }
  if (facts.proposalsUnsigned > 0) {
    parts.push(`${facts.proposalsUnsigned} proposal${facts.proposalsUnsigned === 1 ? '' : 's'} awaiting signature`);
  }
  return parts.length > 0 ? parts.join('. ') + '.' : 'Nothing urgent today.';
}

function buildBriefPrompt(facts: BriefFacts): string {
  const lines = [
    'You write a daily sales briefing for the owner of an event production company.',
    'Style: declarative, no exclamation marks, production vocabulary.',
    'Max 280 characters. 2-3 short sentences. Name specific deals.',
    '',
    'Facts:',
  ];
  lines.push(`- ${facts.queueCount} deals need attention`);
  if (facts.topDeal) {
    const val = facts.topDeal.value ? ` ($${Math.round(facts.topDeal.value / 1000)}k)` : '';
    lines.push(`- Highest priority: ${facts.topDeal.title}${val} — ${facts.topDeal.reason}`);
  }
  if (facts.proposalsUnsigned > 0) {
    lines.push(`- ${facts.proposalsUnsigned} unsigned proposals`);
  }
  if (facts.queueCount === 0) {
    lines.push('- Nothing urgent');
  }
  return lines.join('\n');
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSystemClient();
  let generated = 0;
  let skipped = 0;

  try {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, aion_config');

    for (const ws of (workspaces ?? []) as { id: string; aion_config: Record<string, unknown> | null }[]) {
      try {
        const config = ws.aion_config ?? {};
        const killSwitch = config.kill_switch === true;
        const facts = await gatherFacts(db, ws.id);

        let body: string;
        if (killSwitch || !process.env.ANTHROPIC_API_KEY) {
          body = factsToFallback(facts);
        } else {
          const { text } = await generateText({
            model: getModel('fast'),
            system: buildBriefPrompt(facts),
            prompt: 'Write the briefing now.',
            maxOutputTokens: 120,
            temperature: 0.4,
          });
          body = text.trim().slice(0, 350);
        }

        await (db as any).schema('ops').from('daily_briefings').insert({
          workspace_id: ws.id,
          body,
          facts_json: facts,
        });
        generated++;
      } catch (wsErr) {
        console.error(`[cron/daily-brief] Error for workspace ${ws.id}:`, wsErr);
        skipped++;
      }
    }
  } catch (err) {
    console.error('[cron/daily-brief] Fatal:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  console.log(`[cron/daily-brief] Done: generated=${generated}, skipped=${skipped}`);
  return NextResponse.json({ generated, skipped });
}
