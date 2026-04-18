/**
 * Cron: owner-cadence rollup (Fork C, Ext B — Scope 3).
 *
 * Nightly pass that:
 *   1. For each workspace with `aion_config.learn_owner_cadence=true`, iterates
 *      active owners × archetypes and writes rolled-up cadence facts to
 *      `cortex.aion_memory` (scope='semantic'). The deal-card reader
 *      consults these facts (via owner-cadence.ts → RPC call) at render
 *      time. This cron primes the cache and the RPC result in parallel —
 *      the app currently reads from the RPC directly, but the memory
 *      writes are a P2 upgrade path for fast-cache lookups.
 *
 *   2. For any workspace with `learn_owner_cadence=false` (or unset),
 *      purges cadence facts from `cortex.aion_memory`. Honors the "we'll
 *      forget within 30 days" commitment shown in the opt-in toggle copy
 *      by hard-deleting on first run after the flip.
 *
 * Auth: bearer CRON_SECRET, same pattern as other crons in this folder.
 * Service role only — cross-workspace writes.
 *
 * Skipped quietly when anon/unauthenticated requests land (401).
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { normalizeCadenceArchetype, type CadenceArchetype } from '@/shared/lib/cadence-defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const CADENCE_FACT_PREFIX = 'Owner cadence';
const ARCHETYPES: CadenceArchetype[] = ['wedding', 'corporate', 'tour', 'other'];

// Sample-quality gate mirrors src/shared/lib/owner-cadence.ts. Keeping the
// two in sync is manual; if one moves the other must too.
const MIN_SAMPLE_SIZE = 20;
const MAX_COEFFICIENT_OF_VARIATION = 0.5;
const MAX_SAMPLE_AGE_DAYS = 180;

type CadenceRow = {
  sample_size: number;
  typical_days_proposal_to_first_followup: string | number | null;
  stddev_days_proposal_to_first_followup: string | number | null;
  typical_days_between_followups: string | number | null;
  oldest_sample_age_days: number;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSystemClient();
  let rolled = 0;
  let purged = 0;
  let errors = 0;

  try {
    // Pull all workspaces; bucket by opt-in state. Cheap read and lets us
    // purge even workspaces that never had the RPC run.
    const { data: workspaces } = await db.from('workspaces').select('id, aion_config');
    const rows = (workspaces ?? []) as Array<{
      id: string;
      aion_config: Record<string, unknown> | null;
    }>;

    for (const ws of rows) {
      const optedIn = (ws.aion_config ?? {}).learn_owner_cadence === true;

      if (!optedIn) {
        // Purge cadence facts for this workspace — honors the opt-in copy.
        purged += await purgeCadenceFacts(db, ws.id).catch((e) => {
          errors++;
          // eslint-disable-next-line no-console
          console.error('[owner-cadence-rollup] purge failed', ws.id, e);
          return 0;
        });
        continue;
      }

      // Opted in: iterate active owners × archetypes. "Active" owners are
      // the distinct `owner_user_id` on deals created or touched in the
      // last 180 days. Skipping inactive users avoids tombstone profiles.
      const owners = await fetchActiveOwnerIds(db, ws.id).catch((e) => {
        errors++;
        // eslint-disable-next-line no-console
        console.error('[owner-cadence-rollup] owner lookup failed', ws.id, e);
        return [] as string[];
      });

      for (const ownerId of owners) {
        for (const archetype of ARCHETYPES) {
          try {
            const rolledOne = await rollOwnerArchetype(db, ws.id, ownerId, archetype);
            if (rolledOne) rolled++;
          } catch (err) {
            errors++;
            // eslint-disable-next-line no-console
            console.error(
              '[owner-cadence-rollup] rollup failed',
              { ws: ws.id, owner: ownerId, archetype },
              err,
            );
          }
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[owner-cadence-rollup] fatal', err);
    return NextResponse.json(
      { success: false, rolled, purged, errors: errors + 1 },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, rolled, purged, errors });
}

/**
 * Active owners: distinct owner_user_id on deals touched in the last 180d.
 * Skip NULL owners (ghost/unclaimed deals).
 */
async function fetchActiveOwnerIds(
  db: ReturnType<typeof getSystemClient>,
  workspaceId: string,
): Promise<string[]> {
  const cutoffIso = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data } = await db
    .from('deals')
    .select('owner_user_id')
    .eq('workspace_id', workspaceId)
    .gte('updated_at', cutoffIso);

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ owner_user_id: string | null }>) {
    if (row.owner_user_id) ids.add(row.owner_user_id);
  }
  return Array.from(ids);
}

/**
 * Roll one (user, archetype) into a cadence fact. Returns true when a row
 * was written, false when the sample-quality gate failed (silent — no fact
 * means the reader falls back to archetype defaults).
 */
async function rollOwnerArchetype(
  db: ReturnType<typeof getSystemClient>,
  workspaceId: string,
  userId: string,
  archetype: CadenceArchetype,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
  const { data, error } = await (db as any)
    .schema('ops')
    .rpc('metric_owner_cadence_profile', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_archetype: normalizeCadenceArchetype(archetype),
      p_lookback_days: 180,
    });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as CadenceRow | undefined;
  if (!row) return false;

  if (!passesGate(row)) return false;

  const median = toNum(row.typical_days_proposal_to_first_followup);
  if (median === null) return false;

  const fact = `${CADENCE_FACT_PREFIX} (${archetype}): typical_days_proposal_to_first_followup=${median.toFixed(2)}, sample_size=${row.sample_size}`;

  await db.schema('cortex').rpc('save_aion_memory', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_scope: 'semantic',
    p_fact: fact,
    p_source: 'owner_cadence_rollup_cron',
  });

  return true;
}

function passesGate(row: CadenceRow): boolean {
  if (row.sample_size < MIN_SAMPLE_SIZE) return false;
  if (row.oldest_sample_age_days > MAX_SAMPLE_AGE_DAYS) return false;

  const median = toNum(row.typical_days_proposal_to_first_followup);
  const stddev = toNum(row.stddev_days_proposal_to_first_followup);
  if (median === null || median <= 0) return false;
  if (stddev === null) return false;
  if (stddev / median >= MAX_COEFFICIENT_OF_VARIATION) return false;

  return true;
}

/**
 * Hard-delete all cadence facts for a workspace. Returns the number of
 * rows removed. Honors the opt-in toggle's "we'll forget" copy.
 */
async function purgeCadenceFacts(
  db: ReturnType<typeof getSystemClient>,
  workspaceId: string,
): Promise<number> {
  // cortex.aion_memory has dedup-on-fact but no dedicated delete RPC;
  // direct DELETE via service role is the pattern used by
  // src/app/api/cron/follow-up-queue/route.ts for superseded cleanup.
  const { data, error } = await db
    .schema('cortex')
    .from('aion_memory')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('scope', 'semantic')
    .like('fact', `${CADENCE_FACT_PREFIX}%`)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}
