/**
 * POST /api/aion/telemetry/brief-open — log a Brief-me open event.
 *
 * Phase 3 §3.9 U1 "kill-if-usage" metric. Signal we need to track:
 *   • Do ≥30% of active owners open brief-me twice in a week at the 90-day mark?
 *   • If not, cut the feature in Phase 4.
 *
 * Wk 13: routes through the shared recordAionEvent helper instead of an
 * inline insert. Same write target (ops.aion_events) but the helper handles
 * the failure-isolation pattern (telemetry must never block) and ships the
 * grepable Vercel mirror via the structured aion_event_log_error log line
 * when the insert fails.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { recordAionEvent } from '@/app/api/aion/lib/event-logger';

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

  // Workspace scope is best-effort. Missing workspace doesn't block the row;
  // the kill-metric query filters NULL workspace rows out as cross-workspace
  // noise.
  const workspaceId = await getActiveWorkspaceId().catch(() => null);

  // Grepable mirror — Vercel logs catch the open even if the table insert
  // fails. The helper logs its own structured error line on failure too.
  console.log(
    `[aion.brief_open] user=${user.id} workspace=${workspaceId ?? 'null'} event=${eventId ?? 'null'} at=${new Date().toISOString()}`,
  );

  await recordAionEvent({
    eventType: 'aion.brief_open',
    workspaceId,
    userId: user.id,
    payload: { event_id: eventId },
  });

  return NextResponse.json({ ok: true });
}
