/**
 * GET /api/aion/admin/metrics — Phase 3 §3.10 Wk 15a unified admin payload.
 *
 * Returns one JSON envelope with every cross-workspace admin metric the
 * dashboard renders. Calls four `aion.metric_*` SECURITY DEFINER RPCs in
 * parallel; gates via isAionAdmin() before any DB work.
 *
 * Query params (all optional, default per plan §3.10):
 *   window_days        — lookback window for cortex.aion_proactive_lines
 *                        (dismiss + hit metrics). Default 30.
 *   tool_window_days   — lookback for ops.aion_events (tool_depth + click_through).
 *                        Default 7.
 *   min_sample         — minimum total emissions before above_threshold flips.
 *                        Default 20.
 *
 * Response (200):
 *   { ok: true, params: {...}, metrics: { dismiss_rate, hit_rate, tool_depth,
 *                                          pill_click_through } }
 *
 * Response (401): { ok: false, error: 'unauthorized' }   — no session.
 * Response (403): { ok: false, error: 'forbidden' }      — not on the
 *                                                          AION_ADMIN_USER_IDS allowlist.
 * Response (500): { ok: false, error: <message> }        — RPC failure.
 *
 * The kill-metric (brief-open repeat-user stats) lives at
 * /api/aion/admin/kill-metric and is excluded from this payload because its
 * row shape (per-user stats) doesn't fit the four-card shape the dashboard
 * renders. Treat them as siblings.
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
  const windowDays     = parseIntParam(url.searchParams.get('window_days'),       30);
  const toolWindowDays = parseIntParam(url.searchParams.get('tool_window_days'),   7);
  const minSample      = parseIntParam(url.searchParams.get('min_sample'),         20);

  const system = getSystemClient();

  // Run all four metric RPCs in parallel — each is fast (<50ms) but the
  // dashboard wants one round-trip from the browser, not four.
  const [
    dismissRateRes,
    hitRateRes,
    toolDepthRes,
    pillClickThroughRes,
  ] = await Promise.all([
    system.schema('aion').rpc('metric_dismiss_rate', {
      p_window_days: windowDays,
      p_min_sample:  minSample,
    }),
    system.schema('aion').rpc('metric_hit_rate', {
      p_window_days: windowDays,
      p_min_sample:  minSample,
    }),
    system.schema('aion').rpc('metric_tool_depth', {
      p_window_days: toolWindowDays,
    }),
    system.schema('aion').rpc('metric_pill_click_through', {
      p_window_days: toolWindowDays,
    }),
  ]);

  // Surface the first error encountered; partial results aren't useful for
  // the dashboard, and admin telemetry RPCs should never fail in normal use.
  for (const r of [dismissRateRes, hitRateRes, toolDepthRes, pillClickThroughRes]) {
    if (r.error) {
      return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    params: {
      window_days:      windowDays,
      tool_window_days: toolWindowDays,
      min_sample:       minSample,
    },
    metrics: {
      dismiss_rate:        dismissRateRes.data ?? [],
      hit_rate:            hitRateRes.data ?? [],
      tool_depth:          toolDepthRes.data?.[0] ?? null,
      pill_click_through:  pillClickThroughRes.data?.[0] ?? null,
    },
  });
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
