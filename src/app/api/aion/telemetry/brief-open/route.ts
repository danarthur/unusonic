/**
 * POST /api/aion/telemetry/brief-open — log a Brief-me open event.
 *
 * Phase 3 §3.9 U1 "kill-if-usage" metric. Signal we need to track:
 *   • Do ≥30% of active owners open brief-me twice in a week at the 90-day mark?
 *   • If not, cut the feature in Phase 4.
 *
 * Sprint 2 Wk 7 ships a minimal console-log logger; the Sprint 3 Wk 11
 * admin-telemetry partition (§3.10) brings `ops.aion_events` and this route
 * writes there instead. Until then, a grepable log line keeps the signal in
 * Vercel's log pipeline.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';

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

  // Grepable line — matches the pattern used in knowledge.ts launch telemetry.
  console.log(
    `[aion.brief_open] user=${user.id} event=${eventId ?? 'null'} at=${new Date().toISOString()}`,
  );

  return NextResponse.json({ ok: true });
}
