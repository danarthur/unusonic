'use server';

/**
 * loadPinToAion — Phase 3.3.
 *
 * Given a pin id, returns the minimal shape the Aion chat page needs to
 * re-materialize a pinned analytics card as a fresh chat turn.
 *
 * The caller (the Aion page reading `?openPin=<id>`) uses this to inject a
 * synthetic user message into the session — the existing chat route's
 * `[arg-edit]` short-circuit pattern is reused to re-run callMetric with the
 * pin's stored metric_id + args and emit an analytics_result block.
 *
 * Ownership rule: the pin must belong to the current user. `cortex.list_lobby_pins`
 * is already scoped to `(workspace_id, user_id)`, so we simply filter its output
 * by pin id. Cross-user reads return null (not an error) — the redirect landing
 * logic reads that as "no pin loaded" and falls through to a normal chat start.
 *
 * @module app/(dashboard)/(features)/aion/actions/open-pin
 */

import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '@/shared/lib/feature-flags';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LoadedPin = {
  pinId: string;
  metricId: string;
  title: string;
  args: Record<string, unknown>;
  cadence: 'live' | 'hourly' | 'daily' | 'manual';
  lastValue: Record<string, unknown>;
};

type RawPinRow = {
  pin_id: string;
  title: string;
  metric_id: string;
  args: Record<string, unknown> | null;
  cadence: string;
  last_value: Record<string, unknown> | null;
  last_refreshed_at: string | null;
  position: number;
};

// ─── Context resolution ─────────────────────────────────────────────────────

async function resolveContext(): Promise<{
  userId: string;
  workspaceId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  let workspaceId = cookieStore.get('workspace_id')?.value ?? null;

  if (!workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = membership?.workspace_id ?? null;
  }

  if (!workspaceId) return null;
  return { userId: user.id, workspaceId };
}

// ─── Action ────────────────────────────────────────────────────────────────

/**
 * Resolve a pin by id for the current user. Returns null for:
 *  - unauthenticated callers
 *  - workspace not resolvable
 *  - feature flag off
 *  - pin not found OR owned by someone else (RPC scopes to user_id)
 */
export async function loadPinToAion(pinId: string): Promise<LoadedPin | null> {
  if (typeof pinId !== 'string' || pinId.length === 0) return null;

  const ctx = await resolveContext();
  if (!ctx) return null;

  // Guard the feature flag so disabling Aion pins effectively hides loads too.
  try {
    const enabled = await isFeatureEnabled(ctx.workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);
    if (!enabled) return null;
  } catch {
    return null;
  }

  const supabase = await createClient();
  // cortex schema is not surfaced in generated types — cast per CLAUDE.md rule.
  const { data, error } = await (supabase as unknown as {
    schema: (s: string) => {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  })
    .schema('cortex')
    .rpc('list_lobby_pins', {
      p_workspace_id: ctx.workspaceId,
      p_user_id: ctx.userId,
    });

  if (error) return null;

  const rows = Array.isArray(data) ? (data as RawPinRow[]) : [];
  const row = rows.find((r) => r.pin_id === pinId);
  if (!row) return null;

  const cadence = normalizeCadence(row.cadence);

  return {
    pinId: row.pin_id,
    metricId: row.metric_id,
    title: row.title,
    args: row.args ?? {},
    cadence,
    lastValue: row.last_value ?? {},
  };
}

function normalizeCadence(raw: string): LoadedPin['cadence'] {
  if (raw === 'live' || raw === 'hourly' || raw === 'daily') return raw;
  return 'manual';
}
