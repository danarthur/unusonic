'use server';

/**
 * Multi-stop rollup widget — data fetcher.
 *
 * Reads the `ops.multi_stop_rollup` table metric (Phase 5.4). Next 3–5
 * markets on the active tour. Gated on `planning:view`.
 *
 * The parallel Phase 4.2+5.4 agent may ship a stub shape
 * `{ event_id, event_title, event_date, status }` before the richer
 * city/market columns land; the fetcher normalizes both.
 *
 * @module widgets/multi-stop-rollup/api/get-multi-stop-rollup
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

export type TourStopRow = {
  event_id: string;
  /** Preferred display label — city/market when present, else the event title. */
  label: string;
  /** Pre-formatted date string, e.g. "Apr 18". */
  dateFormatted: string;
  /** Status slug from the RPC: 'advanced' | 'pending' | 'load_in' | etc. */
  status: string;
};

export type MultiStopRollupDTO = {
  /** True when there's no active tour — renders the "Not on tour" empty state. */
  notOnTour: boolean;
  rows: TourStopRow[];
  errored: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function fmtDate(raw: string): string {
  if (!raw) return '';
  // Accept YYYY-MM-DD or ISO timestamp.
  const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Fetcher ────────────────────────────────────────────────────────────────

export async function getMultiStopRollup(): Promise<MultiStopRollupDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const allowed = await hasCapability(user.id, workspaceId, 'planning:view');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'ops.multi_stop_rollup');

  if (!result.ok || result.kind !== 'table') {
    return { notOnTour: false, rows: [], errored: true };
  }

  if (result.rows.length === 0) {
    return { notOnTour: true, rows: [], errored: false };
  }

  const rows: TourStopRow[] = result.rows.slice(0, 5).map((raw) => {
    const city = pickString(raw, 'city', 'market');
    const eventTitle = pickString(raw, 'event_title', 'title', 'name');
    const dateRaw = pickString(raw, 'date', 'event_date');
    return {
      event_id: pickString(raw, 'event_id', 'id'),
      label: city || eventTitle || 'Next stop',
      dateFormatted: fmtDate(dateRaw),
      status: pickString(raw, 'status').toLowerCase(),
    };
  });

  return { notOnTour: false, rows, errored: false };
}
