/**
 * GET /api/cron/aion-events-partition-lifecycle
 *
 * Phase 3 §3.10 Wk 15c partition-roll cron. Runs daily and:
 *   1. Creates the next 12 monthly partitions on ops.aion_events (current
 *      month + 12 ahead) if missing — first-of-the-month rolls in a new one
 *      automatically without a manual migration.
 *   2. Drops partitions whose range_end is more than 180 days in the past
 *      (plan §3.10 C10 retention).
 *
 * Idempotent. The ops.aion_events table was created with 13 monthly
 * partitions in 20260426210442_aion_events_partition_upgrade; this cron
 * keeps the rolling window in sync without anyone touching SQL.
 *
 * Auth: CRON_SECRET bearer token, matching the rest of the repo's cron
 * routes (e.g. aion-memory-drain).
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const system = getSystemClient();
  const { data, error } = await system
    .schema('aion')
    .rpc('roll_aion_events_partitions');

  if (error) {
    console.error('[cron/aion-events-partition-lifecycle] RPC failed:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const actions = (data ?? []) as Array<{
    action: 'created' | 'dropped';
    partition_name: string;
    range_start: string;
    range_end: string;
  }>;
  const created = actions.filter((a) => a.action === 'created').length;
  const dropped = actions.filter((a) => a.action === 'dropped').length;

  console.log(
    `[aion.partition_lifecycle] created=${created} dropped=${dropped} at=${new Date().toISOString()}`,
  );

  return NextResponse.json({
    ok: true,
    created,
    dropped,
    actions,
  });
}
