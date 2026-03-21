'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { createGhostOrgSchema } from '../model/schema';
import type { CreateGhostOrgInput } from '../model/schema';

export type CreateGhostOrgResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create a Ghost Organization (vendor/venue/partner) — no owner until claimed.
 * Used for the Rolodex: "Add Connection" creates a ghost org and links it.
 */
export async function createGhostOrg(input: CreateGhostOrgInput): Promise<CreateGhostOrgResult> {
  const parsed = createGhostOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { workspace_id, name, city, state, type, created_by_org_id } = parsed.data;
  const category = type === 'client_company' ? 'client' : type === 'partner' ? 'coordinator' : type ?? null;

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      workspace_id,
      name,
      is_ghost: true,
      is_claimed: false,
      owner_id: null,
      created_by_org_id: created_by_org_id ?? null,
      address: { city, state: state ?? null },
      category,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  // Dual-write: mirror to directory.entities (new schema)
  const entityType = type === 'venue' ? 'venue' : 'company';
  await supabase
    .schema('directory')
    .from('entities')
    .insert({
      owner_workspace_id: workspace_id,
      type: entityType,
      display_name: name,
      claimed_by_user_id: null, // ghost — not yet claimed
      attributes: {
        is_ghost: true,
        is_claimed: false,
        category,
        address: { city, state: state ?? null },
      },
      legacy_org_id: data.id,
    });
  // Non-fatal: if directory.entities insert fails, org was still created in public.organizations.

  return { ok: true, id: data.id };
}
