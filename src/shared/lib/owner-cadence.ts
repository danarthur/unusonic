/**
 * Owner-cadence profile reader (Fork C, Ext B — Scope 3).
 *
 * Wraps ops.metric_owner_cadence_profile RPC + applies the sample-quality
 * gate required by Critic's hard constraints (design doc §20.4):
 *
 *   sample_size >= 20
 *     AND stddev(days) / mean(days) < 0.5    (coefficient of variation)
 *     AND max(observation_age_days) < 180
 *     AND workspaces.aion_config.learn_owner_cadence = true
 *
 * Below gate: `sampleQuality = 'insufficient'`, caller falls back to
 * cadence-defaults. Above gate: personalization applies.
 *
 * All reads via service_role client because ops.* RPCs aren't PostgREST-
 * exposed to authenticated callers. Server actions must validate workspace
 * membership + opt-in flag before calling. Never import into client code.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { normalizeCadenceArchetype, type CadenceArchetype } from './cadence-defaults';

export type OwnerCadenceProfile = {
  userId: string;
  workspaceId: string;
  archetype: CadenceArchetype;
  sampleSize: number;
  sampleQuality: 'insufficient' | 'sufficient';
  typicalDaysProposalToFirstFollowup: number | null;
  typicalDaysBetweenFollowups: number | null;
  preferredChannelByStageTag: Record<string, 'email' | 'sms' | 'phone'> | null;
  oldestSampleAgeDays: number;
  computedAt: string;
  // Reason strings explaining why the gate failed (useful for debugging + telemetry)
  gateReasons: string[];
};

const MIN_SAMPLE_SIZE = 20;
const MAX_COEFFICIENT_OF_VARIATION = 0.5;
const MAX_SAMPLE_AGE_DAYS = 180;

/**
 * Read the owner-cadence profile for a single user+archetype. Returns
 * the gated profile — caller inspects `sampleQuality` to decide whether
 * to personalize or fall back to archetype defaults.
 *
 * Workspace-level opt-in check (`aion_config.learn_owner_cadence`) must
 * happen BEFORE calling this function. When opt-in is false, skip the
 * RPC entirely.
 */
export async function getOwnerCadenceProfile(
  userId: string,
  workspaceId: string,
  rawArchetype: string | null | undefined,
  lookbackDays = 180,
): Promise<OwnerCadenceProfile> {
  const archetype = normalizeCadenceArchetype(rawArchetype);
  const system = getSystemClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops RPC surfaced via typed regen; cast for call convention
  const { data, error } = await system
    .schema('ops')
    .rpc('metric_owner_cadence_profile', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_archetype: archetype,
      p_lookback_days: lookbackDays,
    });

  if (error) {
    console.error('[owner-cadence] RPC error:', error.message);
    return insufficientProfile(userId, workspaceId, archetype, ['rpc_error']);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    sample_size: number;
    typical_days_proposal_to_first_followup: string | number | null;
    stddev_days_proposal_to_first_followup: string | number | null;
    typical_days_between_followups: string | number | null;
    stddev_days_between_followups: string | number | null;
    preferred_channel_by_stage_tag: Record<string, string> | null;
    oldest_sample_age_days: number;
    computed_at: string;
  } | undefined;

  if (!row) return insufficientProfile(userId, workspaceId, archetype, ['empty_result']);

  const reasons: string[] = [];
  if (row.sample_size < MIN_SAMPLE_SIZE) reasons.push(`sample_size<${MIN_SAMPLE_SIZE}`);
  if (row.oldest_sample_age_days > MAX_SAMPLE_AGE_DAYS) reasons.push(`age>${MAX_SAMPLE_AGE_DAYS}d`);

  // Coefficient of variation on proposal→first followup. Null when we
  // don't have enough paired (proposal-sent, first-act) samples; that's
  // distinct from "high variance" and should fail the gate on its own.
  const median = toNum(row.typical_days_proposal_to_first_followup);
  const stddev = toNum(row.stddev_days_proposal_to_first_followup);
  if (median === null || median <= 0) {
    reasons.push('no_median_proposal_to_followup');
  } else if (stddev === null) {
    reasons.push('no_stddev');
  } else if (stddev / median >= MAX_COEFFICIENT_OF_VARIATION) {
    reasons.push(`cv>=${MAX_COEFFICIENT_OF_VARIATION}`);
  }

  const sampleQuality: 'insufficient' | 'sufficient' =
    reasons.length === 0 ? 'sufficient' : 'insufficient';

  // Channel map — keep only the known channel values (email/sms/phone).
  const rawChannels = row.preferred_channel_by_stage_tag ?? {};
  const channels: Record<string, 'email' | 'sms' | 'phone'> = {};
  for (const [tag, ch] of Object.entries(rawChannels)) {
    if (ch === 'email' || ch === 'sms' || ch === 'phone') channels[tag] = ch;
  }

  return {
    userId,
    workspaceId,
    archetype,
    sampleSize: row.sample_size,
    sampleQuality,
    // When insufficient, return null metrics even if RPC computed numbers —
    // callers must not accidentally render personalization below threshold.
    typicalDaysProposalToFirstFollowup:
      sampleQuality === 'sufficient' ? (median ?? null) : null,
    typicalDaysBetweenFollowups:
      sampleQuality === 'sufficient' ? toNum(row.typical_days_between_followups) : null,
    preferredChannelByStageTag:
      sampleQuality === 'sufficient' && Object.keys(channels).length > 0 ? channels : null,
    oldestSampleAgeDays: row.oldest_sample_age_days,
    computedAt: row.computed_at,
    gateReasons: reasons,
  };
}

/**
 * Check the workspace-level opt-in flag. Returns false (opt-in NOT granted)
 * by default — personalization is off unless explicitly enabled.
 *
 * Reads workspaces.aion_config jsonb → `learn_owner_cadence` boolean.
 */
export async function isOwnerCadenceLearningEnabled(workspaceId: string): Promise<boolean> {
  const system = getSystemClient();
  const { data, error } = await system
    .from('workspaces')
    .select('aion_config')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) return false;
  const config = (data.aion_config ?? {}) as Record<string, unknown>;
  return config.learn_owner_cadence === true;
}

function insufficientProfile(
  userId: string,
  workspaceId: string,
  archetype: CadenceArchetype,
  reasons: string[],
): OwnerCadenceProfile {
  return {
    userId,
    workspaceId,
    archetype,
    sampleSize: 0,
    sampleQuality: 'insufficient',
    typicalDaysProposalToFirstFollowup: null,
    typicalDaysBetweenFollowups: null,
    preferredChannelByStageTag: null,
    oldestSampleAgeDays: 0,
    computedAt: new Date().toISOString(),
    gateReasons: reasons,
  };
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}
