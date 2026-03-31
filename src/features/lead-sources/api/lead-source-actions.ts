'use server';

import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

// =============================================================================
// Types
// =============================================================================

export type WorkspaceLeadSource = {
  id: string;
  label: string;
  category: string;
  is_referral: boolean;
  sort_order: number;
  archived_at: string | null;
};

export type LeadSourceActionResult = { ok: true } | { ok: false; error: string };

// =============================================================================
// Schemas
// =============================================================================

const CATEGORIES = ['referral', 'digital', 'marketplace', 'offline', 'relationship', 'custom'] as const;

const addLeadSourceSchema = z.object({
  label: z.string().min(1).max(120),
  category: z.enum(CATEGORIES).default('custom'),
  isReferral: z.boolean().optional().default(false),
});

const renameLeadSourceSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(120),
});

// =============================================================================
// getWorkspaceLeadSources — all active (non-archived) sources for workspace
// =============================================================================

export async function getWorkspaceLeadSources(): Promise<WorkspaceLeadSource[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
   
  const { data, error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .select('id, label, category, is_referral, sort_order, archived_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('sort_order')
    .order('label');

  if (error) {
    console.error('[lead-sources] getWorkspaceLeadSources error:', error.message);
    return [];
  }

  return (data ?? []) as WorkspaceLeadSource[];
}

// =============================================================================
// getAllWorkspaceLeadSources — includes archived, for settings page
// =============================================================================

export async function getAllWorkspaceLeadSources(): Promise<WorkspaceLeadSource[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
   
  const { data } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .select('id, label, category, is_referral, sort_order, archived_at')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .order('label');

  return (data ?? []) as WorkspaceLeadSource[];
}

// =============================================================================
// addWorkspaceLeadSource — owner/admin only
// =============================================================================

export async function addWorkspaceLeadSource(
  input: unknown
): Promise<LeadSourceActionResult> {
  const parsed = addLeadSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .insert({
      workspace_id: workspaceId,
      label: parsed.data.label.trim(),
      category: parsed.data.category,
      is_referral: parsed.data.isReferral,
    });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Lead source already exists.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/lead-sources');
  return { ok: true };
}

// =============================================================================
// renameWorkspaceLeadSource — owner/admin only
// =============================================================================

export async function renameWorkspaceLeadSource(
  input: unknown
): Promise<LeadSourceActionResult> {
  const parsed = renameLeadSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .update({ label: parsed.data.label.trim() })
    .eq('id', parsed.data.id)
    .eq('workspace_id', workspaceId);

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A source with that name already exists.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/lead-sources');
  return { ok: true };
}

// =============================================================================
// archiveWorkspaceLeadSource — soft-delete
// =============================================================================

export async function archiveWorkspaceLeadSource(
  id: string
): Promise<LeadSourceActionResult> {
  if (!id) return { ok: false, error: 'Missing id.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/lead-sources');
  return { ok: true };
}

// =============================================================================
// restoreWorkspaceLeadSource — un-archive
// =============================================================================

export async function restoreWorkspaceLeadSource(
  id: string
): Promise<LeadSourceActionResult> {
  if (!id) return { ok: false, error: 'Missing id.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/lead-sources');
  return { ok: true };
}

// =============================================================================
// removeWorkspaceLeadSource — hard delete only if no deals reference it
// =============================================================================

export async function removeWorkspaceLeadSource(
  id: string
): Promise<LeadSourceActionResult> {
  if (!id) return { ok: false, error: 'Missing id.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Check if any deals reference this lead source
  const { count } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('lead_source_id', id)
    .eq('workspace_id', workspaceId);

  if (count && count > 0) {
    return { ok: false, error: `${count} deal${count > 1 ? 's' : ''} use this source. Archive it instead.` };
  }

   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/lead-sources');
  return { ok: true };
}

// =============================================================================
// getLeadSourceLabel — resolve a lead_source_id to its label (for display)
// =============================================================================

export async function getLeadSourceLabel(
  leadSourceId: string
): Promise<string | null> {
  if (!leadSourceId) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
   
  const { data } = await (supabase as any)
    .schema('ops')
    .from('workspace_lead_sources')
    .select('label')
    .eq('id', leadSourceId)
    .maybeSingle();

  return data?.label ?? null;
}
