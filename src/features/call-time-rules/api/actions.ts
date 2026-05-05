'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { WorkspaceCallTimeRule } from '@/app/(dashboard)/(features)/productions/actions/apply-call-time-rules';

// NOTE: do NOT re-export `WorkspaceCallTimeRule` from this 'use server'
// file. Next.js 16's server-action bundler produces a value-level
// re-export for every `export type { X }` block and fails the
// production build when the symbol is type-only. Consumers should
// import the type directly from `apply-call-time-rules.ts` (or the
// barrel re-export in `../index.ts` if one exists post-fix).

export type UpsertCallTimeRulePayload = {
  id?: string;
  name: string;
  role_patterns: string[];
  entity_ids: string[];
  event_archetypes: string[];
  action_type: 'slot' | 'offset';
  slot_label?: string | null;
  offset_minutes?: number | null;
  priority: number;
  apply_only_when_unset: boolean;
};

export type CallTimeRuleResult =
  | { success: true; rule: WorkspaceCallTimeRule }
  | { success: false; error: string };

export type CallTimeRulesListResult =
  | { success: true; rules: WorkspaceCallTimeRule[] }
  | { success: false; error: string };

export async function getCallTimeRules(): Promise<CallTimeRulesListResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('workspace_call_time_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, rules: (data ?? []) as WorkspaceCallTimeRule[] };
}

export async function upsertCallTimeRule(
  payload: UpsertCallTimeRulePayload
): Promise<CallTimeRuleResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const row = {
    workspace_id: workspaceId,
    name: payload.name.trim(),
    role_patterns: payload.role_patterns,
    entity_ids: payload.entity_ids,
    event_archetypes: payload.event_archetypes,
    action_type: payload.action_type,
    slot_label: payload.action_type === 'slot' ? (payload.slot_label ?? null) : null,
    offset_minutes: payload.action_type === 'offset' ? (payload.offset_minutes ?? null) : null,
    priority: payload.priority,
    apply_only_when_unset: payload.apply_only_when_unset,
    updated_at: new Date().toISOString(),
  };

  if (payload.id) {
    const { data, error } = await supabase
      .schema('ops')
      .from('workspace_call_time_rules')
      .update(row)
      .eq('id', payload.id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, rule: data as WorkspaceCallTimeRule };
  }

  const { data, error } = await supabase
    .schema('ops')
    .from('workspace_call_time_rules')
    .insert(row)
    .select('*')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, rule: data as WorkspaceCallTimeRule };
}

export async function deleteCallTimeRule(id: string): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_call_time_rules')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
