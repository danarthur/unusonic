/**
 * Cron: Aion proactive-line evaluator — Phase 2 Sprint 2 / Week 4b.
 *
 * Runs cross-workspace, evaluates three signal types, and emits at most one
 * proactive line per deal per workspace-local day (the DB unique index is the
 * atomic cap; this route just avoids obvious duplicates).
 *
 * Gates applied here (in order):
 *   1. Bearer-token auth (CRON_SECRET).
 *   2. Per-workspace kill_switch (workspaces.aion_config.kill_switch).
 *   3. Per-workspace quiet hours (7pm–8am local + weekends → skip entirely).
 *   4. Per-(deal, signal_type) throttle (2 dismisses in 14d → mute 7d).
 *   5. Per-deal kill toggle (public.deals.aion_proactive_enabled) — enforced
 *      inside the emit RPC, not this module.
 *   6. Daily cap (1 line per deal per workspace-local day) — enforced by the
 *      DB unique index via ON CONFLICT in the emit RPC.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.2.
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  evaluateProposalEngagement,
  evaluateMoneyEvent,
  evaluateDeadSilence,
  fetchAutoDisabledSignals,
  isSignalMuted,
  isWithinEmissionWindow,
  type ProactiveCandidate,
} from './evaluators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type WorkspaceRow = {
  id: string;
  timezone: string | null;
  aion_config: Record<string, unknown> | null;
};

type WorkspaceOutcome = {
  workspace_id: string;
  emitted: number;
  skipped_reason?: 'kill_switch' | 'quiet_hours';
  muted: number;
  auto_disabled: number;
  capped: number;
  errors: number;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSystemClient();
  const now = new Date();
  const outcomes: WorkspaceOutcome[] = [];

  try {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, timezone, aion_config');
    const rows = (workspaces ?? []) as WorkspaceRow[];

    for (const ws of rows) {
      const outcome = await runForWorkspace(db, ws, now);
      outcomes.push(outcome);
      // Phase 2 launch telemetry — per-workspace structured line.
      // Grep '[aion.proactive.ws]' post-launch to see dismiss-rate trends.
      console.log(
        `[aion.proactive.ws] workspace=${ws.id} emitted=${outcome.emitted} muted=${outcome.muted} auto_disabled=${outcome.auto_disabled} capped=${outcome.capped} errors=${outcome.errors} skipped=${outcome.skipped_reason ?? 'none'}`,
      );
    }
  } catch (err) {
    console.error('[cron/aion-proactive] Fatal:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const summary = summarize(outcomes);
  console.log('[cron/aion-proactive]', summary);
  return NextResponse.json(summary);
}

// ---------------------------------------------------------------------------
// Per-workspace orchestration
// ---------------------------------------------------------------------------

async function runForWorkspace(
  db: ReturnType<typeof getSystemClient>,
  ws: WorkspaceRow,
  now: Date,
): Promise<WorkspaceOutcome> {
  const outcome: WorkspaceOutcome = {
    workspace_id: ws.id,
    emitted: 0,
    muted: 0,
    auto_disabled: 0,
    capped: 0,
    errors: 0,
  };

  // Gate 2 — workspace kill switch.
  const config = ws.aion_config ?? {};
  if (config.kill_switch === true) {
    outcome.skipped_reason = 'kill_switch';
    return outcome;
  }

  // Gate 3 — quiet hours + weekends (workspace-local).
  const tz = ws.timezone && ws.timezone.length > 0 ? ws.timezone : 'UTC';
  if (!isWithinEmissionWindow(now, tz)) {
    outcome.skipped_reason = 'quiet_hours';
    return outcome;
  }

  // Collect candidates from each signal evaluator. Run in parallel — they
  // each query independent data and take longer than any single user should
  // wait, so concurrency here pays off.
  let candidates: ProactiveCandidate[] = [];
  try {
    const [engagement, money, silence] = await Promise.all([
      evaluateProposalEngagement(db, ws.id, now),
      evaluateMoneyEvent(db, ws.id, now),
      evaluateDeadSilence(db, ws.id, now),
    ]);
    candidates = [...engagement, ...money, ...silence];
  } catch (err) {
    console.error(`[cron/aion-proactive] Evaluator failed for workspace ${ws.id}:`, err);
    outcome.errors += 1;
    return outcome;
  }

  if (candidates.length === 0) return outcome;

  // Gate 3.5 — workspace-wide auto-disable per signal type.
  // If dismiss-rate on this signal > 35% on ≥3 emissions in the last 7d,
  // the whole type is muted workspace-wide until the window forgets the
  // bad run. This is the Critic-specified guardrail: "If dismiss-rate >
  // 35% on any signal type within 7 days, disable that type by default."
  const autoDisabled = await fetchAutoDisabledSignals(db, ws.id);
  const filtered = candidates.filter((c) => {
    if (autoDisabled.has(c.signal_type)) {
      outcome.auto_disabled += 1;
      return false;
    }
    return true;
  });
  if (filtered.length === 0) return outcome;

  // Pre-dedupe: if two signals fired on the same deal, keep the highest-value
  // one so the daily cap doesn't just pick whichever hits ON CONFLICT first.
  // Priority: money_event > proposal_engagement > dead_silence.
  const byDeal = new Map<string, ProactiveCandidate>();
  for (const c of filtered) {
    const prev = byDeal.get(c.deal_id);
    if (!prev || priority(c.signal_type) > priority(prev.signal_type)) {
      byDeal.set(c.deal_id, c);
    }
  }

  // Gate 4 — throttle check + Gate 6 — emit RPC (daily cap).
  for (const c of byDeal.values()) {
    try {
      const muted = await isSignalMuted(db, ws.id, c.deal_id, c.signal_type, now);
      if (muted) {
        outcome.muted += 1;
        continue;
      }
      // jsonb params: Supabase's generated types expect the `Json` type, which
      // is a strict recursive union. Our candidate payloads are plain records
      // of primitives — safe at the boundary, so cast through `unknown` to
      // satisfy the generated signature without loosening types elsewhere.
      const { data: lineId } = await db
        .schema('cortex')
        .rpc('emit_aion_proactive_line', {
          p_workspace_id: ws.id,
          p_deal_id: c.deal_id,
          p_signal_type: c.signal_type,
          p_headline: c.headline,
          p_artifact_ref: c.artifact_ref as unknown as import('@/types/supabase').Json,
          p_payload: c.payload as unknown as import('@/types/supabase').Json,
        });
      if (lineId) {
        outcome.emitted += 1;
        // Wk 15a-ii — telemetry. recordAionEvent is fire-and-forget by design;
        // a failed insert never blocks the emit path.
        const { recordAionEvent } = await import('@/app/api/aion/lib/event-logger');
        void recordAionEvent({
          eventType:    'aion.pill_emit',
          workspaceId:  ws.id,
          payload: {
            line_id:     typeof lineId === 'string' ? lineId : String(lineId),
            signal_type: c.signal_type,
            deal_id:     c.deal_id,
          },
        });
      } else {
        // Either the per-deal kill toggle blocked it or the daily cap fired.
        outcome.capped += 1;
      }
    } catch (err) {
      console.error(`[cron/aion-proactive] Emit failed for deal ${c.deal_id}:`, err);
      outcome.errors += 1;
    }
  }

  return outcome;
}

function priority(signalType: ProactiveCandidate['signal_type']): number {
  if (signalType === 'money_event') return 3;
  if (signalType === 'proposal_engagement') return 2;
  return 1; // dead_silence
}

function summarize(outcomes: WorkspaceOutcome[]): {
  workspaces: number;
  emitted: number;
  muted: number;
  auto_disabled: number;
  capped: number;
  errors: number;
  skipped_kill_switch: number;
  skipped_quiet_hours: number;
} {
  let emitted = 0, muted = 0, autoDisabled = 0, capped = 0, errors = 0;
  let killSwitch = 0, quietHours = 0;
  for (const o of outcomes) {
    emitted += o.emitted;
    muted += o.muted;
    autoDisabled += o.auto_disabled;
    capped += o.capped;
    errors += o.errors;
    if (o.skipped_reason === 'kill_switch') killSwitch += 1;
    if (o.skipped_reason === 'quiet_hours') quietHours += 1;
  }
  return {
    workspaces: outcomes.length,
    emitted,
    muted,
    auto_disabled: autoDisabled,
    capped,
    errors,
    skipped_kill_switch: killSwitch,
    skipped_quiet_hours: quietHours,
  };
}
