/**
 * GET /api/aion/admin/kill-metric — Phase 3 §3.10 (Wk 13).
 *
 * Returns the per-(workspace, user) repeat-open stats for the §3.9 brief-me
 * kill metric ("≥30% of active owners open brief-me twice in a week at the
 * 90-day mark, else cut in Phase 4"). Routes through cortex.metric_brief_open_
 * kill_check (service-role-only RPC) and gates the route handler via
 * isAionAdmin(user.id) — belt + suspenders.
 *
 * Query params (all optional):
 *   window_days        — total lookback (default 90)
 *   repeat_window_days — sliding window for the repeat check (default 7)
 *   min_repeats        — minimum opens within the sliding window (default 2)
 *
 * Response (200):
 *   { ok: true, rows: [{ workspace_id, user_id, total_opens, max_in_window, first_open, last_open }, ...] }
 *
 * Response (403): { ok: false, error: 'forbidden' } — caller is not on the
 * AION_ADMIN_USER_IDS allowlist (or env var is missing entirely → fail-closed).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { isAionAdmin } from '@/app/api/aion/lib/admin-perimeter';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isAionAdmin(user.id)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const windowDays      = parseIntParam(url.searchParams.get('window_days'),        90);
  const repeatWindowDays = parseIntParam(url.searchParams.get('repeat_window_days'), 7);
  const minRepeats      = parseIntParam(url.searchParams.get('min_repeats'),        2);

  // Wk 15-pre — function lives in the dedicated aion.* admin/observability
  // namespace; the schema move makes "what's admin-only" auditable via
  // `pg_proc WHERE schema='aion'`. Route still gates via isAionAdmin above.
  const system = getSystemClient();
  const { data, error } = await system
    .schema('aion')
    .rpc('metric_brief_open_kill_check', {
      p_window_days:        windowDays,
      p_repeat_window_days: repeatWindowDays,
      p_min_repeats:        minRepeats,
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    params: { window_days: windowDays, repeat_window_days: repeatWindowDays, min_repeats: minRepeats },
    rows: data ?? [],
  });
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
