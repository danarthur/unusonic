'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A workspace member tagged with a role, with their commitment status on the queried date. */
export type RolePoolEntry = {
  entity_id: string;
  name: string;
  committed: boolean;
  conflict_label: string | null;
};

/** A preferred sub-vendor / freelancer tagged with the role. */
export type RolePoolPreferredEntry = {
  entity_id: string;
  name: string;
  kind: 'person' | 'company';
  last_used_at: string | null;
};

/**
 * One role's pool — what `ops.get_role_pool` returns. When fetched via
 * the archetype-aware path (`ops.get_role_pools_for_archetype`), the row
 * also carries `qty_required` and `is_optional` from the role mix.
 */
export type RolePool = {
  role_tag: string;
  in_house: RolePoolEntry[];
  preferred: RolePoolPreferredEntry[];
  in_house_total: number;
  in_house_available: number;
  preferred_total: number;
  /** Present only when the pool was fetched via archetype-aware path. */
  qty_required?: number;
  /** Present only when the pool was fetched via archetype-aware path. */
  is_optional?: boolean;
};

/** Aggregate across all populated roles — what `ops.get_role_pools_summary` returns. */
export type RolePoolsSummary = {
  pools: RolePool[];
  total_pools: number;
};

const EMPTY_SUMMARY: RolePoolsSummary = { pools: [], total_pools: 0 };

// ─── Action ──────────────────────────────────────────────────────────────────

/**
 * Read-only role-pool summary for the popover.
 *
 * Two modes:
 *   * **Sparse** (no archetype): returns one entry per role_tag that has at
 *     least one entity tagged in this workspace, with per-date commitment
 *     status on each in-house person. Calls `ops.get_role_pools_summary`.
 *   * **Archetype-aware** (Sprint 3): when an archetype slug is passed,
 *     returns one entry per role in the archetype's role-mix, including
 *     zero-entity pools so the popover can render "Not set up yet" honesty
 *     lines on required roles. Calls `ops.get_role_pools_for_archetype`.
 *
 * Sprint 4 will compose this into `feasibility_check_for_deal` so the chip
 * itself becomes archetype-aware. Until then, the popover surfaces it.
 */
export async function getRolePoolsSummary(
  date: string,
  archetypeSlug?: string | null,
  workspaceIdOverride?: string,
): Promise<RolePoolsSummary> {
  try {
    const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
    if (!workspaceId) return EMPTY_SUMMARY;

    const dateStr = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return EMPTY_SUMMARY;

    const supabase = await createClient();
    const opsSchema = (supabase as unknown as {
      schema: (s: string) => {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    }).schema('ops');

    const useArchetypePath = typeof archetypeSlug === 'string' && archetypeSlug.length > 0;

    const { data, error } = useArchetypePath
      ? await opsSchema.rpc('get_role_pools_for_archetype', {
          p_workspace_id: workspaceId,
          p_archetype_slug: archetypeSlug,
          p_date: dateStr,
        })
      : await opsSchema.rpc('get_role_pools_summary', {
          p_workspace_id: workspaceId,
          p_date: dateStr,
        });

    if (error) {
      console.error('[CRM] role pools RPC error:', error);
      return EMPTY_SUMMARY;
    }

    const payload = data as RolePoolsSummary | null;
    if (!payload) return EMPTY_SUMMARY;

    return {
      pools: payload.pools ?? [],
      total_pools: payload.total_pools ?? 0,
    };
  } catch (err) {
    console.error('[CRM] getRolePoolsSummary error:', err);
    return EMPTY_SUMMARY;
  }
}
