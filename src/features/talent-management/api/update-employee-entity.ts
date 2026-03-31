'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { PERSON_ATTR } from '@/entities/directory/model/attribute-keys';

// ─── Input schema ─────────────────────────────────────────────────────────────

const UpdateEmployeeEntitySchema = z.object({
  relationshipId: z.string().uuid(),
  entityId: z.string().uuid(),
  sourceOrgId: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional(),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  job_title: z.string().max(120).nullable().optional(),
  market: z.string().max(100).nullable().optional(),
  union_status: z.string().max(120).nullable().optional(),
  cdl: z.boolean().optional(),
  w9_status: z.boolean().optional(),
  coi_expiry: z.string().nullable().optional(),
  emergency_contact: z
    .object({
      name: z.string().max(100).nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
    })
    .nullable()
    .optional(),
  instagram: z.string().max(60).nullable().optional(),
  doNotRebook: z.boolean().optional(),
});

// ─── Return types ─────────────────────────────────────────────────────────────

export type EmployeeEntityUpdateResult =
  | { ok: true }
  | { ok: false; error: string };

// ─── Action ───────────────────────────────────────────────────────────────────

export async function updateEmployeeEntityAttrs(
  input: unknown
): Promise<EmployeeEntityUpdateResult> {
  // 1. Parse and validate input
  const parsed = UpdateEmployeeEntitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input.' };
  }

  const {
    relationshipId,
    entityId,
    sourceOrgId,
    first_name,
    last_name,
    email,
    phone,
    job_title,
    market,
    union_status,
    cdl,
    w9_status,
    coi_expiry,
    emergency_contact,
    instagram,
    doNotRebook,
  } = parsed.data;

  // 2. Auth — verify caller has an active workspace
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: 'Not authorised.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not authorised.' };
  }

  // 3. Build attributes patch — only include fields that are not undefined.
  //    Empty string → null (clear the field).
  const patch: Record<string, unknown> = {};

  patch[PERSON_ATTR.first_name] = first_name;

  if (last_name !== undefined) {
    patch[PERSON_ATTR.last_name] = last_name || null;
  }
  if (email !== undefined) {
    patch[PERSON_ATTR.email] = email === '' ? null : email;
  }
  if (phone !== undefined) {
    patch[PERSON_ATTR.phone] = phone === '' ? null : phone;
  }
  if (job_title !== undefined) {
    patch[PERSON_ATTR.job_title] = job_title === '' ? null : job_title;
  }
  if (market !== undefined) {
    patch[PERSON_ATTR.market] = market === '' ? null : market;
  }
  if (union_status !== undefined) {
    patch[PERSON_ATTR.union_status] = union_status === '' ? null : union_status;
  }
  if (cdl !== undefined) {
    patch[PERSON_ATTR.cdl] = cdl;
  }
  if (w9_status !== undefined) {
    patch[PERSON_ATTR.w9_status] = w9_status;
  }
  if (coi_expiry !== undefined) {
    patch[PERSON_ATTR.coi_expiry] = coi_expiry === '' ? null : coi_expiry;
  }
  if (emergency_contact !== undefined) {
    patch[PERSON_ATTR.emergency_contact] = emergency_contact ?? null;
  }
  if (instagram !== undefined) {
    patch[PERSON_ATTR.instagram] = instagram === '' ? null : instagram;
  }

  // 4. Call patch_entity_attributes RPC (p_attributes, not p_patch)
  const { error: attrErr } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: patch,
  });
  if (attrErr) {
    return { ok: false, error: attrErr.message };
  }

  // 5. If doNotRebook is provided, fetch the edge and patch context_data.
  // Verify the target entity is owned by the caller's workspace before writing.
  if (doNotRebook !== undefined) {
    const { data: edge } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('source_entity_id, target_entity_id')
      .eq('id', relationshipId)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .maybeSingle();

    if (edge) {
      // Guard: confirm the org entity this ROSTER_MEMBER points at belongs to the caller's workspace.
      const { data: orgEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('owner_workspace_id')
        .eq('id', edge.target_entity_id)
        .maybeSingle();

      if (!orgEnt || orgEnt.owner_workspace_id !== workspaceId) {
        return { ok: false, error: 'Not authorised.' };
      }

      const { error: relErr } = await supabase.rpc('patch_relationship_context', {
        p_source_entity_id: edge.source_entity_id,
        p_target_entity_id: edge.target_entity_id,
        p_relationship_type: 'ROSTER_MEMBER',
        p_patch: { do_not_rebook: doNotRebook },
      });
      if (relErr) {
        return { ok: false, error: relErr.message };
      }
    }
  }

  // 6. Update display_name on the entity
  const displayName = [first_name, last_name].filter(Boolean).join(' ');
  await supabase
    .schema('directory')
    .from('entities')
    .update({ display_name: displayName })
    .eq('id', entityId);

  // 7. Revalidate and return
  revalidatePath('/network');
  return { ok: true };
}
