/**
 * Aion tier gating — server-only.
 * Controls what Aion can do based on the workspace's subscription tier.
 *
 * Three capability levels:
 *   passive  — suggestions and alerts only (Foundation)
 *   active   — drafts and recommendations (Growth)
 *   autonomous — actions without approval (Studio, monthly limit)
 *
 * @module features/intelligence/lib/aion-gate
 */

import 'server-only';

import { getWorkspaceTier } from '@/shared/lib/tier-gate';
import { getAionMode, type AionMode, type TierSlug } from '@/shared/lib/tier-config';
import { getSystemClient } from '@/shared/api/supabase/system';

// ─── Mode ordering ──────────────────────────────────────────────────────────

const AION_MODE_ORDER: Record<AionMode, number> = {
  passive: 0,
  active: 1,
  autonomous: 2,
};

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Returns the Aion capability level for a workspace based on its tier.
 */
export async function getAionCapabilityLevel(workspaceId: string): Promise<AionMode> {
  const tier = await getWorkspaceTier(workspaceId);
  return getAionMode(tier);
}

/**
 * Checks whether the workspace can execute an Aion action at the required level.
 *
 * For autonomous-level actions, also checks the monthly action limit.
 */
export async function canExecuteAionAction(
  workspaceId: string,
  requiredLevel: AionMode,
): Promise<{ allowed: boolean; currentLevel: AionMode; reason?: string }> {
  const tier = await getWorkspaceTier(workspaceId);
  const currentLevel = getAionMode(tier);

  // Check if the tier supports the required level
  if (AION_MODE_ORDER[currentLevel] < AION_MODE_ORDER[requiredLevel]) {
    return {
      allowed: false,
      currentLevel,
      reason: 'tier_insufficient',
    };
  }

  // For autonomous actions, check the monthly action limit
  if (requiredLevel === 'autonomous') {
    const usage = await getAionUsage(workspaceId);
    if (usage.limit !== null && usage.used >= usage.limit) {
      return {
        allowed: false,
        currentLevel,
        reason: 'aion_action_limit_reached',
      };
    }
  }

  return { allowed: true, currentLevel };
}

/**
 * Increments the `aion_actions_used` counter on the workspace.
 * Uses the system client (service role) because this column may not be
 * writable via RLS for regular users.
 */
export async function recordAionAction(workspaceId: string): Promise<void> {
  const system = getSystemClient();

  // Atomic increment via RPC.
  // NOTE: `increment_aion_actions` RPC and `aion_actions_used` column are created
  // by the Phase 1 migration. Until types are regenerated after that migration,
  // we cast through `unknown` to avoid TS errors against the current schema.
  const { error } = await (system.rpc as Function)('increment_aion_actions', {
    p_workspace_id: workspaceId,
  });

  // Fallback: if the RPC doesn't exist yet, do a manual read-increment-write
  if (error) {
    const { data } = await system
      .from('workspaces')
      .select('subscription_tier')
      .eq('id', workspaceId)
      .single();

    if (data) {
      // Read current value via raw query workaround until column exists in types
      const raw = data as unknown as Record<string, unknown>;
      const current = (raw.aion_actions_used as number) ?? 0;

      await (system.from('workspaces').update as Function)(
        { aion_actions_used: current + 1 },
      ).eq('id', workspaceId);
    }
  }
}

/**
 * Returns the current Aion action usage for a workspace.
 * - `used`: number of autonomous actions taken this billing period
 * - `limit`: monthly action limit (null = unlimited within mode)
 * - `resetAt`: ISO timestamp when the counter resets (null if not set)
 */
export async function getAionUsage(
  workspaceId: string,
): Promise<{ used: number; limit: number | null; resetAt: string | null }> {
  const system = getSystemClient();

  // NOTE: `aion_actions_used` and `aion_actions_reset_at` columns are created
  // by the Phase 1 migration. Until types are regenerated, we select only the
  // typed column and cast the full row to access future columns.
  const { data, error } = await system
    .from('workspaces')
    .select('subscription_tier')
    .eq('id', workspaceId)
    .single();

  if (error || !data) {
    // Fail safe — report no usage, no limit
    return { used: 0, limit: null, resetAt: null };
  }

  const record = data as unknown as Record<string, unknown>;
  const tier = (record.subscription_tier as TierSlug) ?? 'foundation';
  const { aionMonthlyActions } = await import('@/shared/lib/tier-config').then((m) =>
    m.getTierConfig(tier),
  );

  return {
    used: (record.aion_actions_used as number) ?? 0,
    limit: aionMonthlyActions,
    resetAt: (record.aion_actions_reset_at as string) ?? null,
  };
}
