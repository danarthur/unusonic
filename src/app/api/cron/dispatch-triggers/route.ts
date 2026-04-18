/**
 * Cron: Pipeline trigger dispatcher.
 *
 * Runs every minute (Vercel Cron — see vercel.json). Invokes
 * `dispatchPendingTransitions()` which claims pending `ops.deal_transitions`
 * rows for feature-flagged workspaces and runs the configured stage trigger
 * primitives via the registry.
 *
 * Feature-flagged: only workspaces with
 * `workspaces.feature_flags['pipelines.triggers_enabled'] = true` participate.
 * The claim RPC handles the filter — there's no app-side workspace loop.
 *
 * Design: docs/reference/custom-pipelines-design.md §7.
 */

import { NextResponse } from 'next/server';

import { dispatchPendingTransitions } from '@/shared/lib/triggers/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await dispatchPendingTransitions();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron/dispatch-triggers] Fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
