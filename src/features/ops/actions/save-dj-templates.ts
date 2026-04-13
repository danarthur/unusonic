'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { DjTimelineTemplate } from '@/features/ops/lib/dj-prep-schema';

type SaveResult = { ok: true } | { ok: false; error: string };

/* ── Helpers ───────────────────────────────────────────────────── */

async function getAuthedEntity() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  return person ? { supabase, person } : null;
}

/* ── Actions ───────────────────────────────────────────────────── */

/** Save a new program template to person entity attributes. Max 20. */
export async function saveDjTemplate(template: DjTimelineTemplate): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  const current = (ctx.person.attributes ?? {}) as Record<string, unknown>;
  const existing = (current.dj_program_templates ?? []) as DjTimelineTemplate[];

  if (existing.length >= 20) {
    return { ok: false, error: 'Maximum 20 templates. Delete one first.' };
  }

  const merged = {
    ...current,
    dj_program_templates: [...existing, template],
  };

  const { error } = await ctx.supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: merged })
    .eq('id', ctx.person.id);

  if (error) return { ok: false, error: 'Failed to save template.' };
  return { ok: true };
}

/** Delete a program template by ID. */
export async function deleteDjTemplate(templateId: string): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  const current = (ctx.person.attributes ?? {}) as Record<string, unknown>;
  const existing = (current.dj_program_templates ?? []) as DjTimelineTemplate[];

  const merged = {
    ...current,
    dj_program_templates: existing.filter(t => t.id !== templateId),
  };

  const { error } = await ctx.supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: merged })
    .eq('id', ctx.person.id);

  if (error) return { ok: false, error: 'Failed to delete template.' };
  return { ok: true };
}
