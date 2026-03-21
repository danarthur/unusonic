'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { VENUE_ATTR } from '@/features/network-data/model/attribute-keys';

// ─── Deals ────────────────────────────────────────────────────────────────────

export type EntityDeal = {
  id: string;
  proposed_date: string;
  event_archetype: string | null;
  status: string;
  budget_estimated: number | null;
};

/**
 * Returns deals where this entity is a stakeholder.
 * Queries via ops.deal_stakeholders.entity_id — never via deals.organization_id
 * (legacy column under active migration).
 *
 * Two-step: ops.deal_stakeholders (schema='ops') → public.deals.
 * Cross-schema PostgREST joins are fragile; explicit two-step is safer.
 * RLS on deal_stakeholders chains through deals.workspace_id → get_my_workspace_ids().
 */
export async function getEntityDeals(entityId: string): Promise<EntityDeal[]> {
  const supabase = await createClient();

  // Step 1: get deal IDs for this entity (workspace-scoped via RLS on ops.deal_stakeholders)
  const { data: stakeRows, error: stakeErr } = await supabase
    .schema('ops')
    .from('deal_stakeholders')
    .select('deal_id')
    .eq('entity_id', entityId)
    .limit(10);

  if (stakeErr) {
    console.error('[network] getEntityDeals (stakeholders):', stakeErr.message);
    return [];
  }

  const dealIds = (stakeRows ?? []).map((r) => r.deal_id).filter(Boolean) as string[];
  if (dealIds.length === 0) return [];

  // Step 2: fetch the deals (workspace-scoped via RLS on public.deals)
  const { data, error } = await supabase
    .from('deals')
    .select('id, proposed_date, event_archetype, status, budget_estimated')
    .in('id', dealIds)
    .order('proposed_date', { ascending: false });

  if (error) {
    console.error('[network] getEntityDeals (deals):', error.message);
    return [];
  }

  return (data ?? []) as EntityDeal[];
}

// ─── Financial summary ────────────────────────────────────────────────────────

export type EntityInvoiceSummary = {
  id: string;
  status: string | null;
  total_amount: number;
  due_date: string | null;
};

/**
 * Returns open invoices for this entity from finance.invoices.
 * Scoped by bill_to_entity_id. RLS handles workspace isolation.
 */
export async function getEntityFinancialSummary(entityId: string): Promise<EntityInvoiceSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('finance')
    .from('invoices')
    .select('id, status, total_amount, due_date')
    .eq('bill_to_entity_id', entityId)
    .order('due_date', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[finance] getEntityFinancialSummary:', error.message);
    return [];
  }

  return (data ?? []) as EntityInvoiceSummary[];
}

// ─── Venue technical specs ────────────────────────────────────────────────────

export type VenueTechSpecsResult = { ok: true } | { ok: false; error: string };

export type VenueTechSpecs = {
  capacity?: number | null;
  load_in_notes?: string | null;
  power_notes?: string | null;
  stage_notes?: string | null;
};

/**
 * Merges venue technical specs into directory.entities.attributes
 * via patch_entity_attributes RPC (safe jsonb merge, no race condition).
 */
export async function updateVenueTechnicalSpecs(
  entityId: string,
  specs: VenueTechSpecs,
): Promise<VenueTechSpecsResult> {
  if (!entityId) return { ok: false, error: 'Missing entity ID.' };

  // Build payload — only include defined keys (using VENUE_ATTR constants for key safety)
  const payload: Record<string, unknown> = {};
  if (specs.capacity !== undefined) payload[VENUE_ATTR.capacity] = specs.capacity;
  if (specs.load_in_notes !== undefined) payload[VENUE_ATTR.load_in_notes] = specs.load_in_notes;
  if (specs.power_notes !== undefined) payload[VENUE_ATTR.power_notes] = specs.power_notes;
  if (specs.stage_notes !== undefined) payload[VENUE_ATTR.stage_notes] = specs.stage_notes;

  if (Object.keys(payload).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: payload,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
