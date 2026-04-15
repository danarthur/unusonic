/**
 * Cron: Lobby pin refresh — Phase 3.3.
 *
 * Runs hourly (0 * * * * in vercel.json). Pulls lobby pins whose cadence has
 * lapsed (hourly: 55 min; daily: 23 h; live: 5 min), recomputes each metric
 * with the stored args, and writes a fresh last_value via
 * cortex.update_lobby_pin_value.
 *
 * Constraints (per docs/reference/pages/reports-and-analytics-design.md §2.2):
 *  - Service role only — bypasses RLS so we can refresh across workspaces.
 *  - Never calls canExecuteAionAction / recordAionAction. Pin refresh does
 *    not count against tier budgets.
 *  - One pin failing never aborts the run — the error is logged and we move on.
 *
 * Thundering-herd defense (implementation-plan v1.1 item #12):
 *  - Hard cap of CRON_PIN_REFRESH_BATCH pins per invocation.
 *  - Per-workspace cap of PER_WORKSPACE_CAP pins per run.
 *  - Sequential processing within a workspace (shared RPC paths).
 *  - Bounded parallelism across workspaces (WORKSPACE_POOL).
 */

import 'server-only';

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { getSystemClient } from '@/shared/api/supabase/system';
import { callMetric } from '@/shared/lib/metrics/call';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isScalarMetric, isWidgetMetric } from '@/shared/lib/metrics/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Tunables ───────────────────────────────────────────────────────────────

const CRON_PIN_REFRESH_BATCH = 200;
const PER_WORKSPACE_CAP = 5;
const WORKSPACE_POOL = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

type DuePinRow = {
  pin_id: string;
  workspace_id: string;
  user_id: string;
  metric_id: string;
  args: Record<string, unknown> | null;
  cadence: string;
  last_refreshed_at: string | null;
};

type RefreshOutcome = 'refreshed' | 'skipped' | 'failed';

type LastValue = {
  primary: string;
  unit: string;
  secondary?: string;
};

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const system = getSystemClient();

  // 1. Pull due pins via the helper RPC (oldest-last_refreshed-at first).
  //    cortex is not in the typed schema exposure — cast per CLAUDE.md rule.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cortex schema not in generated supabase types; .schema('cortex') requires an any-cast (CLAUDE.md PR-INFRA-2)
  const { data: dueData, error: dueErr } = await (system as any)
    .schema('cortex')
    .rpc('due_lobby_pins', { p_limit: CRON_PIN_REFRESH_BATCH });

  if (dueErr) {
    console.error('[cron/pin-refresh] Failed to read due pins:', dueErr);
    Sentry.captureException(dueErr, { tags: { cron: 'pin-refresh', phase: 'query' } });
    return NextResponse.json({ error: 'Could not load due pins' }, { status: 500 });
  }

  const dueAll = Array.isArray(dueData) ? (dueData as DuePinRow[]) : [];

  // 2. Per-workspace fair-share: cap PER_WORKSPACE_CAP pins per workspace.
  const byWorkspace = new Map<string, DuePinRow[]>();
  for (const row of dueAll) {
    if (!row || !row.workspace_id || !row.pin_id || !row.metric_id) continue;
    const bucket = byWorkspace.get(row.workspace_id) ?? [];
    if (bucket.length >= PER_WORKSPACE_CAP) continue;
    bucket.push(row);
    byWorkspace.set(row.workspace_id, bucket);
  }

  // 3. Process workspaces in parallel up to WORKSPACE_POOL, sequential within.
  const entries = [...byWorkspace.entries()];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  async function processWorkspace(
    workspaceId: string,
    pins: DuePinRow[],
  ): Promise<void> {
    for (const pin of pins) {
      const outcome = await refreshPin(system, workspaceId, pin);
      if (outcome === 'refreshed') refreshed += 1;
      else if (outcome === 'skipped') skipped += 1;
      else failed += 1;
    }
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    // Simple counting-semaphore loop — each worker pulls the next workspace
    // off the shared cursor until entries are exhausted.
    while (cursor < entries.length) {
      const i = cursor;
      cursor += 1;
      const [workspaceId, pins] = entries[i];
      try {
        await processWorkspace(workspaceId, pins);
      } catch (err) {
        // Per-workspace errors are already logged inside refreshPin, but guard
        // against an unexpected throw from the loop machinery itself.
        console.error(`[cron/pin-refresh] Workspace ${workspaceId} loop error:`, err);
        Sentry.captureException(err, {
          tags: { cron: 'pin-refresh', phase: 'workspace-loop' },
          extra: { workspaceId },
        });
      }
    }
  }

  const poolSize = Math.min(WORKSPACE_POOL, entries.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  console.log(
    `[cron/pin-refresh] done: refreshed=${refreshed} skipped=${skipped} failed=${failed} due=${dueAll.length}`,
  );
  return NextResponse.json({ refreshed, skipped, failed });
}

// ─── Per-pin processing ─────────────────────────────────────────────────────

async function refreshPin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cortex schema not in generated supabase types; .schema('cortex') requires an any-cast (CLAUDE.md PR-INFRA-2)
  system: any,
  workspaceId: string,
  pin: DuePinRow,
): Promise<RefreshOutcome> {
  // Registry gate — unknown or widget-kind pins are skipped (not failed). The
  // UI surface for registry-drift stale pins is Phase 5.
  const def = METRICS[pin.metric_id];
  if (!def) {
    console.warn(
      `[cron/pin-refresh] Skipping pin ${pin.pin_id} — unknown metric '${pin.metric_id}'`,
    );
    return 'skipped';
  }
  if (isWidgetMetric(def)) {
    console.warn(
      `[cron/pin-refresh] Skipping pin ${pin.pin_id} — widget-kind metric '${pin.metric_id}' is not callable`,
    );
    return 'skipped';
  }
  if (!isScalarMetric(def)) {
    // Table metrics aren't pinnable today; defensive skip.
    console.warn(
      `[cron/pin-refresh] Skipping pin ${pin.pin_id} — metric '${pin.metric_id}' is not a scalar kind`,
    );
    return 'skipped';
  }

  const args = (pin.args ?? {}) as Record<string, unknown>;

  let result;
  try {
    result = await callMetric(workspaceId, pin.metric_id, args, { client: system });
  } catch (err) {
    return recordFailure(pin, err, 'callMetric-threw');
  }

  if (!result.ok) {
    return recordFailure(pin, new Error(result.error), 'callMetric-not-ok');
  }
  if (result.kind !== 'scalar') {
    return recordFailure(
      pin,
      new Error(`Unexpected result kind '${result.kind}' for scalar metric`),
      'unexpected-kind',
    );
  }

  // Shape last_value to match what buildAnalyticsResultBlock emits in chat so
  // the pinned card reads identically (see Phase 3.1 analytics.ts).
  const lastValue: LastValue = {
    primary: result.value.primaryFormatted,
    unit: result.value.unit,
    ...(result.value.secondary ? { secondary: result.value.secondary } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cortex schema not in generated supabase types; .schema('cortex') requires an any-cast (CLAUDE.md PR-INFRA-2)
  const { error: updateErr } = await (system as any)
    .schema('cortex')
    .rpc('update_lobby_pin_value', {
      p_pin_id: pin.pin_id,
      p_value: lastValue,
    });

  if (updateErr) {
    return recordFailure(pin, updateErr, 'update-rpc');
  }

  return 'refreshed';
}

// ─── Failure path ───────────────────────────────────────────────────────────

async function recordFailure(
  pin: DuePinRow,
  err: unknown,
  stage: string,
): Promise<'failed'> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `[cron/pin-refresh] Pin ${pin.pin_id} (${pin.metric_id}) failed at ${stage}: ${message}`,
  );
  Sentry.addBreadcrumb({
    category: 'cron',
    level: 'warning',
    message: `pin-refresh failed: ${stage}`,
    data: { pinId: pin.pin_id, metricId: pin.metric_id, workspaceId: pin.workspace_id },
  });
  Sentry.captureException(err, {
    tags: { cron: 'pin-refresh', stage },
    extra: { pinId: pin.pin_id, metricId: pin.metric_id, workspaceId: pin.workspace_id },
  });

  // Phase 3.3 intentionally does NOT record metadata.last_error here. The
  // existing update_lobby_pin_value RPC merges p_value onto metadata.last_value,
  // which would clobber the last-good snapshot. The stale-with-error surface
  // (Phase 5) needs its own dedicated RPC + UI; until then we rely on Sentry
  // for observability. Leaving last_refreshed_at stale is the correct signal —
  // the pin will be re-evaluated on the next cron tick.
  return 'failed';
}
