'use server';

/**
 * Pin CRUD server actions for the Phase 3.2 Lobby-pin flow.
 *
 * Every action resolves the caller's user + workspace at the pre-auth boundary,
 * gates on the `reports.aion_pin` feature flag, validates inputs against the
 * METRICS registry, and delegates the write/read to a cortex SECURITY DEFINER
 * RPC. Direct table writes are not permitted — cortex.aion_memory has
 * SELECT-only RLS per the cortex write-protection rule.
 *
 * Cap, cadence validation, and args-hash dedup live inside `save_lobby_pin`;
 * this module only enforces the registry-level "known metric" gate so an
 * unknown metric id never reaches the RPC.
 *
 * @module app/(dashboard)/(features)/aion/actions/pin-actions
 */

import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import {
  FEATURE_FLAGS,
  requireFeatureEnabled,
} from '@/shared/lib/feature-flags';
import { METRICS } from '@/shared/lib/metrics/registry';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PinCadence = 'live' | 'hourly' | 'daily' | 'manual';

export type PinInitialValue = {
  primary: string;
  unit: string;
  secondary?: string;
};

export type LobbyPin = {
  pinId: string;
  title: string;
  metricId: string;
  args: Record<string, unknown>;
  cadence: PinCadence;
  lastValue: Record<string, unknown>;
  lastRefreshedAt: string | null;
  position: number;
};

const CADENCES: ReadonlySet<PinCadence> = new Set([
  'live',
  'hourly',
  'daily',
  'manual',
]);

// ─── Context resolution ─────────────────────────────────────────────────────

/**
 * Resolves the current user id + workspace id in one pass. Throws on missing
 * auth or missing workspace so callers surface a single, consistent error.
 */
async function resolveContext(): Promise<{
  userId: string;
  workspaceId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in');
  }

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

  if (!workspaceId) {
    throw new Error('No workspace for current user');
  }

  return { userId: user.id, workspaceId };
}

// ─── Validators ────────────────────────────────────────────────────────────

function assertKnownMetric(metricId: string): void {
  if (!METRICS[metricId]) {
    throw new Error(`Unknown metric id: ${metricId}`);
  }
}

function assertCadence(cadence: string): asserts cadence is PinCadence {
  if (!CADENCES.has(cadence as PinCadence)) {
    throw new Error(`Invalid cadence: ${cadence}`);
  }
}

function assertTitle(title: string): void {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Pin title required');
  }
  if (title.length > 200) {
    throw new Error('Pin title too long (max 200 characters)');
  }
}

// ─── Save ──────────────────────────────────────────────────────────────────

export async function savePin(input: {
  title: string;
  metricId: string;
  args: Record<string, unknown>;
  cadence: PinCadence;
  initialValue: PinInitialValue;
}): Promise<{ pinId: string }> {
  assertTitle(input.title);
  assertKnownMetric(input.metricId);
  assertCadence(input.cadence);

  const { userId, workspaceId } = await resolveContext();
  await requireFeatureEnabled(workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);

  const supabase = await createClient();
  // cortex schema is not surfaced in generated types — cast to any so the RPC
  // call compiles without a schema-exposed types regeneration.
  const { data, error } = await (supabase as unknown as {
    schema: (s: string) => { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  })
    .schema('cortex')
    .rpc('save_lobby_pin', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_title: input.title.trim(),
      p_metric_id: input.metricId,
      p_args: input.args,
      p_cadence: input.cadence,
      p_initial_value: input.initialValue,
    });

  if (error) {
    throw new Error(`Could not save pin: ${error.message}`);
  }

  const pinId = typeof data === 'string' ? data : null;
  if (!pinId) {
    throw new Error('Save pin RPC returned no id');
  }
  return { pinId };
}

// ─── List ──────────────────────────────────────────────────────────────────

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

export async function listPins(): Promise<LobbyPin[]> {
  const { userId, workspaceId } = await resolveContext();
  await requireFeatureEnabled(workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);

  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as {
    schema: (s: string) => { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  })
    .schema('cortex')
    .rpc('list_lobby_pins', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
    });

  if (error) {
    throw new Error(`Could not list pins: ${error.message}`);
  }

  const rows = Array.isArray(data) ? (data as RawPinRow[]) : [];
  return rows.map((r) => ({
    pinId: r.pin_id,
    title: r.title,
    metricId: r.metric_id,
    args: r.args ?? {},
    cadence: (CADENCES.has(r.cadence as PinCadence)
      ? (r.cadence as PinCadence)
      : 'manual'),
    lastValue: r.last_value ?? {},
    lastRefreshedAt: r.last_refreshed_at,
    position: r.position,
  }));
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deletePin(pinId: string): Promise<void> {
  if (typeof pinId !== 'string' || pinId.length === 0) {
    throw new Error('pinId required');
  }
  const { workspaceId } = await resolveContext();
  await requireFeatureEnabled(workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);

  const supabase = await createClient();
  const { error } = await (supabase as unknown as {
    schema: (s: string) => { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  })
    .schema('cortex')
    .rpc('delete_lobby_pin', { p_pin_id: pinId });

  if (error) {
    throw new Error(`Could not delete pin: ${error.message}`);
  }
}

// ─── Reorder ───────────────────────────────────────────────────────────────

export async function reorderPins(ids: string[]): Promise<void> {
  if (!Array.isArray(ids)) {
    throw new Error('ids must be an array');
  }
  const { userId, workspaceId } = await resolveContext();
  await requireFeatureEnabled(workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);

  const supabase = await createClient();
  const { error } = await (supabase as unknown as {
    schema: (s: string) => { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  })
    .schema('cortex')
    .rpc('reorder_lobby_pins', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_ids: ids,
    });

  if (error) {
    throw new Error(`Could not reorder pins: ${error.message}`);
  }
}
