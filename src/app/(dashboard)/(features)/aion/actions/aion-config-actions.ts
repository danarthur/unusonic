'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

// =============================================================================
// Types
// =============================================================================

export type AionVoiceConfig = {
  description: string;
  example_message: string;
  guardrails: string;
};

export type AionLearnedConfig = {
  vocabulary?: Array<{ from: string; to: string; count: number }>;
  patterns?: string[];
  preferences?: Record<string, string>;
};

export type AionFollowUpRule = {
  id: string;
  category: 'timing' | 'channel' | 'drafting' | 'backoff' | 'scheduling';
  rule: string;
  rationale?: string;
  conditions?: {
    event_type?: string;
    client_type?: string;
    deal_stage?: string;
    signal?: string;
  };
  structured?: {
    days?: number;
    channel?: 'sms' | 'email' | 'call';
    max_attempts?: number;
    blocked_days?: string[];
  };
  created_at: string;
  source: 'aion_chat' | 'manual';
};

export type AionFollowUpPlaybook = {
  rules: AionFollowUpRule[];
  version: number;
};

export type AionConfig = {
  voice?: AionVoiceConfig;
  learned?: AionLearnedConfig;
  follow_up_playbook?: AionFollowUpPlaybook;
  onboarding_state?: string;
  kill_switch?: boolean;
  /**
   * Fork C, Ext B — owner-cadence learning opt-in. Default false. When true,
   * `ops.metric_owner_cadence_profile` feeds `src/shared/lib/owner-cadence.ts`
   * which personalizes the unified Aion deal card's voice + priority.
   * GDPR Art 22 compliance — must be opt-in, never opt-out.
   *
   * Disabling schedules 30-day purge of `cortex.aion_memory` facts with
   * `scope='semantic' AND fact LIKE 'Owner cadence%'` (Phase 4 cron).
   */
  learn_owner_cadence?: boolean;
};

// =============================================================================
// Queries
// =============================================================================

export async function getAionConfig(): Promise<AionConfig> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return {};

  const supabase = await createClient();
  // aion_config is typed as Json in generated types; cast to AionConfig shape.
  const { data, error } = await supabase
    .from('workspaces')
    .select('aion_config')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) return {};
  return ((data as Record<string, unknown>).aion_config as AionConfig) ?? {};
}

/**
 * Read aion_config for a specific workspace using the system client.
 * Used by API routes that already have the workspaceId.
 */
export async function getAionConfigForWorkspace(workspaceId: string): Promise<AionConfig> {
  const { getSystemClient } = await import('@/shared/api/supabase/system');
  const system = getSystemClient();
  // aion_config is typed as Json in generated types; cast to AionConfig shape.
  const { data, error } = await system
    .from('workspaces')
    .select('aion_config')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) return {};
  return ((data as Record<string, unknown>).aion_config as AionConfig) ?? {};
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Fork C, Ext B — toggle the `learn_owner_cadence` opt-in.
 *
 * When disabled, the deal-card reader stops personalizing (falls back to
 * archetype defaults silently). Phase 4 cron soft-deletes existing cadence
 * memories then hard-purges after 30 days.
 */
export async function setLearnOwnerCadence(
  enabled: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    // Validate caller is a workspace member before the service-role write.
    // Workspace role gating for cadence opt-in itself is unnecessary (a user
    // opts themselves in), but the authenticated session must still own a
    // seat here.
    const supabase = await createClient();
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();
    if (!membership) return { success: false, error: 'Not a workspace member.' };

    const current = await getAionConfig();
    const updated: AionConfig = { ...current, learn_owner_cadence: enabled };

    // public.workspaces has RLS enabled but no UPDATE policy for authenticated
    // callers — writes must route through the service-role client.
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { error } = await system
      .from('workspaces')
      .update({ aion_config: updated })
      .eq('id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/aion');
    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update cadence opt-in.',
    };
  }
}

export async function saveAionVoiceConfig(
  voice: AionVoiceConfig,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // Read current config to merge
    const current = await getAionConfig();
    const updated: AionConfig = { ...current, voice };

    const { error } = await supabase
      .from('workspaces')
      .update({ aion_config: updated })
      .eq('id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/aion');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save voice config.' };
  }
}

/**
 * Deep-merge partial updates into the workspace's aion_config.
 * Uses the system client — suitable for API route handlers.
 */
export async function updateAionConfigForWorkspace(
  workspaceId: string,
  updates: Partial<AionConfig>,
): Promise<void> {
  const { getSystemClient } = await import('@/shared/api/supabase/system');
  const system = getSystemClient();
  const current = await getAionConfigForWorkspace(workspaceId);

  const merged: AionConfig = {
    ...current,
    ...updates,
    voice: {
      description: updates.voice?.description ?? current.voice?.description ?? '',
      example_message: updates.voice?.example_message ?? current.voice?.example_message ?? '',
      guardrails: updates.voice?.guardrails ?? current.voice?.guardrails ?? '',
    },
    learned: {
      vocabulary: updates.learned?.vocabulary ?? current.learned?.vocabulary,
      patterns: updates.learned?.patterns ?? current.learned?.patterns,
      preferences: { ...current.learned?.preferences, ...updates.learned?.preferences },
    },
    follow_up_playbook: updates.follow_up_playbook ?? current.follow_up_playbook,
  };

  await system
    .from('workspaces')
    .update({ aion_config: merged })
    .eq('id', workspaceId);
}

export async function toggleAionKillSwitch(
  enabled: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    const current = await getAionConfig();
    const updated: AionConfig = { ...current, kill_switch: enabled };

    const { error } = await supabase
      .from('workspaces')
      .update({ aion_config: updated })
      .eq('id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/aion');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle kill switch.' };
  }
}
