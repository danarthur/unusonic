'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { estimatedRoleCost, type RequiredRole } from './package-types';

export interface CrewCostComparison {
  estimatedTotal: number;
  actualTotal: number;
  overage: number;
  roles: {
    role: string;
    estimated: number;
    actual: number;
    delta: number;
  }[];
}

/**
 * Compares estimated crew cost (from proposal required_roles) against actual
 * crew cost (from ops.deal_crew day_rate values) for a given deal.
 *
 * Returns null if no proposal exists for the deal.
 */
export async function getCrewCostReconciliation(
  dealId: string
): Promise<CrewCostComparison | null> {
  const supabase = await createClient();

  // 1. Get the most recent proposal for this deal
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!proposal) return null;

  // 2. Get estimated crew costs from proposal line item snapshots
  const { data: proposalItems } = await supabase
    .from('proposal_items')
    .select('definition_snapshot, quantity, unit_multiplier, is_package_header, package_instance_id')
    .eq('proposal_id', proposal.id);

  let estimatedTotal = 0;
  const roleEstimates = new Map<string, number>();

  for (const item of proposalItems ?? []) {
    // Skip bundle children — header carries the full cost
    const row = item as {
      definition_snapshot: { crew_meta?: { required_roles?: RequiredRole[] } } | null;
      quantity: number;
      unit_multiplier: number | null;
      is_package_header?: boolean | null;
      package_instance_id?: string | null;
    };
    const isBundleChild = !row.is_package_header && row.package_instance_id != null;
    if (isBundleChild) continue;

    const roles = row.definition_snapshot?.crew_meta?.required_roles;
    if (!roles?.length) continue;

    for (const role of roles) {
      const cost = estimatedRoleCost(role);
      estimatedTotal += cost;
      roleEstimates.set(role.role, (roleEstimates.get(role.role) ?? 0) + cost);
    }
  }

  // 3. Get actual crew costs from ops.deal_crew
  const { data: crewRows } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('role_note, day_rate')
    .eq('deal_id', dealId);

  let actualTotal = 0;
  const roleActuals = new Map<string, number>();

  for (const row of (crewRows ?? []) as { role_note: string | null; day_rate: number | null }[]) {
    const rate = Number(row.day_rate) || 0;
    if (rate === 0) continue;
    actualTotal += rate;
    const role = row.role_note ?? 'Unspecified';
    roleActuals.set(role, (roleActuals.get(role) ?? 0) + rate);
  }

  // 4. Build comparison
  const allRoles = new Set([...roleEstimates.keys(), ...roleActuals.keys()]);
  const roles = Array.from(allRoles).map((role) => ({
    role,
    estimated: roleEstimates.get(role) ?? 0,
    actual: roleActuals.get(role) ?? 0,
    delta: (roleActuals.get(role) ?? 0) - (roleEstimates.get(role) ?? 0),
  }));

  return {
    estimatedTotal,
    actualTotal,
    overage: actualTotal - estimatedTotal,
    roles,
  };
}
