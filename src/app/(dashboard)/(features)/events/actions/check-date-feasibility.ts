'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeasibilityStatus = 'clear' | 'caution' | 'critical';

/** A confirmed show (ops.events row) that overlaps the queried date. */
export type FeasibilityShow = {
  id: string;
  title: string;
  starts_at: string;
  venue_id: string | null;
};

/**
 * A pre-handoff deal proposing the queried date.
 *
 * `is_committed` distinguishes contract-sent-and-beyond (`contract_out`,
 * `contract_signed`, `deposit_received`, `ready_for_handoff`) — which
 * count as bookings — from in-flight deals (`initial_contact`,
 * `proposal_sent`) which are softer signals.
 */
export type FeasibilityDeal = {
  id: string;
  title: string;
  stage_label: string | null;
  stage_id: string;
  is_committed: boolean;
};

/** A preferred-crew self-reported blackout overlapping the queried date. */
export type FeasibilityBlackout = {
  entity_id: string;
  entity_name: string;
  range_start: string;
  range_end: string;
  source: string;
};

/**
 * A confirmed event ±36h of the queried date but NOT on the same date.
 * Sprint 5 — surfaced in the popover Adjacent section.
 */
export type FeasibilityAdjacent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue_id: string | null;
  local_date: string;
  side: 'before' | 'after' | 'overlap';
};

/**
 * Soft-load aggregate: count of confirmed shows + open deals in the surrounding
 * 72h. Drives the "Heavy weekend — 3 confirmed in 72h" sub-line in the popover.
 * Sprint 5.
 */
export type FeasibilitySoftLoad = {
  confirmed_in_72h: number;
  deals_in_72h: number;
  is_heavy: boolean;
};

export type CheckDateFeasibilityResult = {
  status: FeasibilityStatus;
  /** Short one-liner for chip body + tooltip — see message-generation below. */
  message: string;
  confirmedCount: number;
  dealsCount: number;
  blackoutCount: number;
  confirmedShows: FeasibilityShow[];
  pendingDeals: FeasibilityDeal[];
  blackouts: FeasibilityBlackout[];
  /** Sprint 5 — confirmed events ±36h that aren't on the queried date. */
  adjacentEvents: FeasibilityAdjacent[];
  /** Sprint 5 — soft-load aggregate over 72h centered on the queried date. */
  softLoad: FeasibilitySoftLoad;
};

/** Per-date feasibility row. `date` is the input (yyyy-MM-dd) for chip correlation. */
export type DatedFeasibilityResult = CheckDateFeasibilityResult & { date: string };

// ─── State + message resolution ──────────────────────────────────────────────

/**
 * Resolve status + message from structured signal data.
 *
 * "Booked" (red, critical) = at least one ops.events row OR at least one
 * committed deal (contract-sent and beyond — these are functionally bookings).
 *
 * "In flight" (amber, caution) = tentative deals only (initial_contact /
 * proposal_sent), no commitments.
 *
 * "Open" (grey, clear) = nothing on the books.
 *
 * Voice: precision instrument (Linear / TE / Stripe register). Sentence case,
 * no exclamation marks, production vocabulary. Flat technical phrasing per
 * the Critic's call on the User Advocate vocabulary list.
 */
function resolve(
  confirmedShows: FeasibilityShow[],
  pendingDeals: FeasibilityDeal[],
): { status: FeasibilityStatus; message: string } {
  const committedDeals = pendingDeals.filter((d) => d.is_committed);
  const tentativeDeals = pendingDeals.filter((d) => !d.is_committed);
  const bookedCount = confirmedShows.length + committedDeals.length;

  if (bookedCount > 0) {
    let title: string;
    if (confirmedShows.length === 1 && committedDeals.length === 0) {
      title = confirmedShows[0].title;
    } else if (confirmedShows.length === 0 && committedDeals.length === 1) {
      title = committedDeals[0].title;
    } else {
      return { status: 'critical', message: `Booked — ${bookedCount} shows` };
    }
    return { status: 'critical', message: `Booked — ${title}` };
  }

  if (tentativeDeals.length > 0) {
    if (tentativeDeals.length === 1) {
      return { status: 'caution', message: `1 open deal — ${tentativeDeals[0].title}` };
    }
    return { status: 'caution', message: `${tentativeDeals.length} open deals` };
  }

  return { status: 'clear', message: 'Open' };
}

// ─── Action ──────────────────────────────────────────────────────────────────

const EMPTY_RESULT: CheckDateFeasibilityResult = {
  status: 'clear',
  message: 'Open',
  confirmedCount: 0,
  dealsCount: 0,
  blackoutCount: 0,
  confirmedShows: [],
  pendingDeals: [],
  blackouts: [],
  adjacentEvents: [],
  softLoad: { confirmed_in_72h: 0, deals_in_72h: 0, is_heavy: false },
};

/**
 * Read-only feasibility check for a proposed date.
 *
 * Composes three data sources via a single SECURITY DEFINER RPC
 * (`ops.feasibility_check_for_date`):
 *   1. ops.events  — confirmed shows overlapping the date (red, drives `confirmed`)
 *   2. public.deals — open pre-contract deals proposing the date (amber, drives `pending`)
 *   3. directory.entities.attributes.availability_blackouts — preferred crew with
 *      self-reported blackouts overlapping the date (informational only at Fork B,
 *      surfaced in the popover but does not escalate the badge color — see design
 *      doc open question §9.3)
 *
 * Returns the full structured payload so the tap-popover can render named
 * conflicts with deep links. The legacy `status`/`message` fields are preserved
 * for backward compatibility with the chip-strip / multi-day-badge consumers
 * that pre-date the popover.
 *
 * `currentDealId` is accepted but optional — the only call site today is the
 * create-gig modal, which has no deal_id yet (the deal hasn't been saved). The
 * parameter is reserved for future re-use on existing-deal edit flows.
 */
export async function checkDateFeasibility(
  date: string,
  workspaceIdOverride?: string,
  currentDealId?: string | null,
): Promise<CheckDateFeasibilityResult> {
  try {
    const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
    if (!workspaceId) {
      return EMPTY_RESULT;
    }

    const dateStr = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { ...EMPTY_RESULT, message: 'Select a date to check availability.' };
    }

    const supabase = await createClient();

    // ops schema isn't in the PostgREST exposed-schemas set yet, so the rpc
    // call needs `.schema('ops')` and the result is loosely typed. Cast the
    // jsonb payload to its known shape — the migration documents the contract.
    const { data, error } = await (supabase as unknown as {
      schema: (s: string) => {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    })
      .schema('ops')
      .rpc('feasibility_check_for_date', {
        p_workspace_id: workspaceId,
        p_date: dateStr,
        p_current_deal_id: currentDealId ?? null,
      });

    if (error) {
      console.error('[CRM] feasibility_check_for_date error:', error);
      return EMPTY_RESULT;
    }

    type RpcPayload = {
      state: 'open' | 'pending' | 'confirmed';
      confirmed_show_count: number;
      confirmed_shows: FeasibilityShow[];
      pending_deal_count: number;
      pending_deals: FeasibilityDeal[];
      committed_deal_count?: number;
      tentative_deal_count?: number;
      blackout_count: number;
      blackouts: FeasibilityBlackout[];
      adjacent_event_count?: number;
      adjacent_events?: FeasibilityAdjacent[];
      soft_load?: FeasibilitySoftLoad;
    };

    const payload = data as RpcPayload | null;
    if (!payload) return EMPTY_RESULT;

    const confirmedShows = payload.confirmed_shows ?? [];
    const pendingDeals = payload.pending_deals ?? [];
    const blackouts = payload.blackouts ?? [];
    const adjacentEvents = payload.adjacent_events ?? [];
    const softLoad: FeasibilitySoftLoad = payload.soft_load ?? {
      confirmed_in_72h: 0,
      deals_in_72h: 0,
      is_heavy: false,
    };

    // Recompute status + message client-side from structured data so the
    // chip's truth doesn't depend on the RPC's `state` field staying in sync.
    const { status, message } = resolve(confirmedShows, pendingDeals);

    return {
      status,
      message,
      confirmedCount: payload.confirmed_show_count ?? confirmedShows.length,
      dealsCount: payload.pending_deal_count ?? pendingDeals.length,
      blackoutCount: payload.blackout_count ?? blackouts.length,
      confirmedShows,
      pendingDeals,
      blackouts,
      adjacentEvents,
      softLoad,
    };
  } catch (err) {
    console.error('[CRM] checkDateFeasibility error:', err);
    return EMPTY_RESULT;
  }
}

/**
 * Batch feasibility check for a series (multiple dates) or multi-day range.
 *
 * - Pass an array of `yyyy-MM-dd` strings for series dates (returns one result per date).
 * - Pass `{ start, end }` for a multi-day range (returns one result per day).
 *
 * Returns a parallel array of {date, status, message, ...}. Callers render each
 * entry as a colored chip in the Stage 1 chip strip.
 *
 * Implementation runs one RPC per date concurrently. The RPC is cheap (three
 * indexed joins) so for typical residencies (≤30 dates) this is fine. Long
 * tours (200+ dates) can be batched via a future window-RPC; not P0.
 */
export async function checkDatesFeasibility(
  input: string[] | { start: string; end: string },
  workspaceIdOverride?: string,
  currentDealId?: string | null,
): Promise<DatedFeasibilityResult[]> {
  const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
  if (!workspaceId) return [];

  const dates = Array.isArray(input)
    ? input
    : expandDateRangeToList(input.start, input.end);

  const results = await Promise.all(
    dates.map(async (d): Promise<DatedFeasibilityResult> => {
      const r = await checkDateFeasibility(d, workspaceId, currentDealId);
      return { ...r, date: d };
    }),
  );
  return results;
}

/** Internal: expand a yyyy-MM-dd inclusive range to a list of all days. */
function expandDateRangeToList(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
