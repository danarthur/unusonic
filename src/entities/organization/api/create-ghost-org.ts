'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { createGhostOrgSchema } from '../model/schema';
import type { CreateGhostOrgInput } from '../model/schema';

export type CreateGhostOrgResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create a Ghost Organization (vendor/venue/partner) — no owner until claimed.
 * Writes directly to directory.entities (public.organizations was dropped in Session 10).
 */
export async function createGhostOrg(input: CreateGhostOrgInput): Promise<CreateGhostOrgResult> {
  const parsed = createGhostOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { workspace_id, name, city, state, type } = parsed.data;

  const category = type === 'client_company' ? 'client' : type === 'partner' ? 'coordinator' : type ?? null;
  const entityType = type === 'venue' ? 'venue' : 'company';

  const { data, error } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      owner_workspace_id: workspace_id,
      type: entityType,
      display_name: name,
      claimed_by_user_id: null,
      attributes: {
        is_ghost: true,
        is_claimed: false,
        category,
        address: { city, state: state ?? null },
      },
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, id: data.id };
}
