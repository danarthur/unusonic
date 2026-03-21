'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';

const addJobTitleSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().min(1).max(120),
});

const removeJobTitleSchema = z.object({
  job_title_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

export type JobTitleActionResult = { ok: true } | { ok: false; error: string };

export async function addWorkspaceJobTitle(
  input: unknown
): Promise<JobTitleActionResult> {
  const parsed = addJobTitleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_job_titles')
    .insert({
      workspace_id: parsed.data.workspace_id,
      title: parsed.data.title.trim(),
    });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Job title already exists.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeWorkspaceJobTitle(
  input: unknown
): Promise<JobTitleActionResult> {
  const parsed = removeJobTitleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_job_titles')
    .delete()
    .eq('id', parsed.data.job_title_id)
    .eq('workspace_id', parsed.data.workspace_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
