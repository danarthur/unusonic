/**
 * Per-workspace feature flag reader.
 *
 * Sits below tier-gate and billing-gate in the access stack. A flag turning a
 * feature ON does not bypass paywalls — it only enables rendering/use of a
 * gated feature within the workspace's existing tier.
 *
 * Storage: public.workspaces.feature_flags JSONB. Convention: namespaced keys
 * like 'reports.modular_lobby'. Set via SQL until an admin UI exists.
 *
 * @module shared/lib/feature-flags
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';

/** Namespaced flag key. Use the FEATURE_FLAGS constant for known keys. */
export type FeatureFlagKey = `${string}.${string}`;

/**
 * Registry of known feature flag keys. Add entries here as phases ship dark.
 * Using the constant guards against typos at the call site.
 */
export const FEATURE_FLAGS = {
  REPORTS_AION_PIN: 'reports.aion_pin',
  REPORTS_RECONCILIATION: 'reports.reconciliation',
  AION_LOBBY_CAPTURE: 'aion.lobby_capture',
  /**
   * Unified Aion deal card (Fork C, Phase 3). When true, Deal Lens renders
   * `<AionDealCard>` instead of the four legacy surfaces (follow-up card,
   * AionSuggestionRow, computeStallSignal badge, NextActionsCard). Data
   * layer (Phase 1 migrations + Phase 2 reader) ships regardless — this
   * flag only gates Phase 3 UI for rollback safety.
   */
  CRM_UNIFIED_AION_CARD: 'crm.unified_aion_card',
  /**
   * Proposal-builder rebuild (Phase 1). When true, the /crm/deal/{id}/proposal-builder
   * route renders the legacy drag studio (`proposal-builder-studio-legacy.tsx`);
   * when false/unset, it renders the new palette-first studio
   * (`proposal-builder-studio.tsx`). Migration 20260501000000 backfills this to
   * `true` on every workspace that exists at migration time, so existing users
   * keep the drag muscle-memory until we flip them. Workspaces created after
   * migration default to unset → new studio.
   *
   * Design doc: docs/reference/proposal-builder-rebuild-design.md
   */
  CRM_PROPOSAL_BUILDER_DRAG: 'crm.proposal_builder_drag',
} as const satisfies Record<string, FeatureFlagKey>;

export type KnownFeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Returns true iff the workspace's feature_flags JSONB contains
 * { [flagKey]: true }. Any other value (false, missing, non-boolean) returns false.
 *
 * Reads through the standard server client, so RLS on workspaces enforces
 * that only members of the workspace can read its flags.
 */
export async function isFeatureEnabled(
  workspaceId: string,
  flagKey: FeatureFlagKey,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspaces')
    .select('feature_flags')
    .eq('id', workspaceId)
    .single();

  if (!data?.feature_flags) return false;
  const flags = data.feature_flags as Record<string, unknown>;
  return flags[flagKey] === true;
}

/**
 * Throws if the flag is not enabled. Use at the top of a server action to
 * gate a feature. The thrown error message names the flag key so a developer
 * triaging a failure knows what to enable.
 */
export async function requireFeatureEnabled(
  workspaceId: string,
  flagKey: FeatureFlagKey,
): Promise<void> {
  if (!(await isFeatureEnabled(workspaceId, flagKey))) {
    throw new Error(`Feature '${flagKey}' is not enabled for this workspace`);
  }
}
