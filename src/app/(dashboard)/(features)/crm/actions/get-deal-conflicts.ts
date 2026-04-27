'use server';

import { createClient } from '@/shared/api/supabase/server';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DealConflictDimension = 'crew' | 'gear' | 'travel' | 'scope';
export type DealConflictSeverity = 'high' | 'medium' | 'low';
export type DealConflictState = 'open' | 'acknowledged' | 'resolved';

export type DealConflict = {
  item_key: string;
  dimension: DealConflictDimension;
  severity: DealConflictSeverity;
  state: DealConflictState;
  title: string;
  subtitle: string | null;
  ack_note: string | null;
  ack_by: string | null;
  ack_at: string | null;
  days_to_event: number | null;
  payload: unknown;
};

/** Sprint 5 — soft-load aggregate over 72h centered on the deal's date. */
export type DealConflictsSoftLoad = {
  confirmed_in_72h: number;
  deals_in_72h: number;
  is_heavy: boolean;
};

export type DealConflictsPayload = {
  deal_id: string;
  proposed_date: string | null;
  archetype_slug: string | null;
  days_to_event: number | null;
  conflicts: DealConflict[];
  total_conflicts: number;
  /** Sprint 5 — soft-load aggregate. Drives the panel's "Heavy weekend" sub-line. */
  soft_load: DealConflictsSoftLoad;
};

const EMPTY_SOFT_LOAD: DealConflictsSoftLoad = {
  confirmed_in_72h: 0,
  deals_in_72h: 0,
  is_heavy: false,
};

const EMPTY_PAYLOAD: DealConflictsPayload = {
  deal_id: '',
  proposed_date: null,
  archetype_slug: null,
  days_to_event: null,
  conflicts: [],
  total_conflicts: 0,
  soft_load: EMPTY_SOFT_LOAD,
};

// ─── Read action ─────────────────────────────────────────────────────────────

/**
 * Returns the full Conflicts-panel payload for a deal: derived conflicts
 * (Phase 1 + Sprint 1/3 helpers) joined with persisted state from
 * ops.deal_open_items.
 *
 * Wraps `ops.feasibility_check_for_deal`. Used by the Conflicts panel on
 * the deal-lens right rail.
 */
export async function getDealConflicts(dealId: string): Promise<DealConflictsPayload> {
  try {
    if (!dealId) return EMPTY_PAYLOAD;

    const supabase = await createClient();

    const { data, error } = await (supabase as unknown as {
      schema: (s: string) => {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    })
      .schema('ops')
      .rpc('feasibility_check_for_deal', {
        p_deal_id: dealId,
      });

    if (error) {
      console.error('[CRM] feasibility_check_for_deal error:', error);
      return { ...EMPTY_PAYLOAD, deal_id: dealId };
    }

    const payload = data as DealConflictsPayload | null;
    if (!payload) return { ...EMPTY_PAYLOAD, deal_id: dealId };

    return {
      deal_id: payload.deal_id ?? dealId,
      proposed_date: payload.proposed_date ?? null,
      archetype_slug: payload.archetype_slug ?? null,
      days_to_event: payload.days_to_event ?? null,
      conflicts: payload.conflicts ?? [],
      total_conflicts: payload.total_conflicts ?? 0,
      soft_load: payload.soft_load ?? EMPTY_SOFT_LOAD,
    };
  } catch (err) {
    console.error('[CRM] getDealConflicts error:', err);
    return { ...EMPTY_PAYLOAD, deal_id: dealId };
  }
}

// ─── Mutation action ─────────────────────────────────────────────────────────

export type DealConflictMutateResult = {
  ok: boolean;
  error?: string;
};

/**
 * Transitions a Conflicts-panel item to a new state (Open / Acknowledged /
 * Resolved). Persists into ops.deal_open_items via ops.set_deal_open_item_state
 * with audit metadata (acted_by, acted_at) attached server-side.
 *
 * Used by the panel's "Mark handled", "Reopen", and "Mark resolved" actions.
 */
export async function setDealConflictItemState(
  dealId: string,
  itemKey: string,
  state: DealConflictState,
  ackNote?: string | null,
): Promise<DealConflictMutateResult> {
  try {
    if (!dealId || !itemKey) {
      return { ok: false, error: 'dealId and itemKey are required' };
    }

    const supabase = await createClient();

    const { error } = await (supabase as unknown as {
      schema: (s: string) => {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    })
      .schema('ops')
      .rpc('set_deal_open_item_state', {
        p_deal_id: dealId,
        p_item_key: itemKey,
        p_state: state,
        p_ack_note: ackNote ?? null,
      });

    if (error) {
      console.error('[CRM] set_deal_open_item_state error:', error);
      return { ok: false, error: error.message ?? 'Failed to update conflict state' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[CRM] setDealConflictItemState error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
