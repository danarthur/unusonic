/**
 * Cron: dwell-SLA dispatcher.
 *
 * Runs hourly. Evaluates `ops.evaluate_dwell_sla(...)` and enrolls a
 * follow-up for every deal whose current stage has a `dwell_sla` trigger
 * whose dwell window has elapsed and that has not yet been enrolled.
 *
 * Dedup is covered by the same unique index the on-enter dispatcher relies
 * on (`originating_transition_id, primitive_key`); the SLA prefix prevents
 * collision with the stage's on-enter enrollments.
 */

import { NextResponse } from 'next/server';

import { dispatchDwellSla } from '@/shared/lib/triggers/dwell-sla';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await dispatchDwellSla();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron/dwell-sla] Fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
