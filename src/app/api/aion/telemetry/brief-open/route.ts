/**
 * POST /api/aion/telemetry/brief-open — log a Brief-me open event.
 *
 * Phase 3 §3.9 U1 "kill-if-usage" metric. Signal we need to track:
 *   • Do ≥30% of active owners open brief-me twice in a week at the 90-day mark?
 *   • If not, cut the feature in Phase 4.
 *
 * Wk 12: writes a row into ops.aion_events (event_type='aion.brief_open',
 * payload={ event_id }). RLS-on, no client policies — service-role write only.
 * The grepable console line is preserved for dev visibility while the table
 * fills up.
 *
 * Plan §3.10 (Wk 13+) ships partitioning + admin SECURITY DEFINER RPCs to
 * query this surface; until then, the rows accumulate so the kill-metric
 * window starts measuring against persisted data on day one.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: { eventId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const eventId = typeof body?.eventId === 'string' ? body.eventId : null;

  // Workspace scope is best-effort — a missing workspace shouldn't block the
  // grepable line or the row insert, and the kill-metric query tolerates NULL
  // workspace_id by treating those rows as cross-workspace noise to filter out.
  const workspaceId = await getActiveWorkspaceId().catch(() => null);

  // Persist to ops.aion_events. RLS is on with no client policies; the
  // service-role client bypasses RLS so this is the only path that can write.
  const system = getSystemClient();
  const { error } = await system
    .schema('ops')
    .from('aion_events')
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      event_type: 'aion.brief_open',
      payload: { event_id: eventId },
    });

  // Grepable mirror — Vercel logs catch it even if the insert fails for any
  // reason (RLS drift, schema bouncing, network hiccup). Telemetry is fire-
  // and-forget; never abort the brief overlay on a logging hiccup.
  console.log(
    `[aion.brief_open] user=${user.id} workspace=${workspaceId ?? 'null'} event=${eventId ?? 'null'} at=${new Date().toISOString()}${error ? ' insert_error=' + error.message : ''}`,
  );

  return NextResponse.json({ ok: true });
}
