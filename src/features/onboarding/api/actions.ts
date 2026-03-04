/**
 * Signal Onboarding – Server Actions for Ghost org creation and claiming.
 * Session 10: fully migrated to directory.entities + cortex.relationships.
 * All writes to public.organizations, public.affiliations, public.org_members, public.entities removed.
 * @module features/onboarding/api/actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getSession } from '@/shared/lib/auth/session';
import {
  createGhostOrganizationSchema,
  claimOrganizationSchema,
  createGenesisOrganizationSchema,
} from '../model/schema';
import type {
  CreateGhostOrganizationResult,
  ClaimOrganizationResult,
  CreateGenesisOrganizationResult,
  NexusResult,
  GhostOrgPreview,
} from '../model/types';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-|-$/g, '');
}

/**
 * Helper: look up a directory.entities org by either its id or legacy_org_id.
 * Handles both old orgs (legacy_org_id = public.organizations.id) and new orgs
 * (no legacy_org_id; identified directly by id).
 */
async function findOrgEntity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{ id: string; legacy_org_id: string | null; owner_workspace_id: string | null; display_name: string | null; attributes: unknown } | null> {
  // Try by directory entity id first (new orgs), then by legacy_org_id (old orgs)
  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, legacy_org_id, owner_workspace_id, display_name, attributes')
    .or(`id.eq.${orgId},legacy_org_id.eq.${orgId}`)
    .eq('type', 'company')
    .maybeSingle();
  return data ?? null;
}

/**
 * Check if a slug is available for a new organization (Genesis) or for an existing org (exclude its id).
 */
export async function checkSlugAvailability(
  slug: string,
  excludeOrgId?: string
): Promise<{ available: boolean }> {
  const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '') || '';
  if (!normalized || normalized.length < 2) {
    return { available: false };
  }
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('commercial_organizations')
    .select('id, name');

  if (error) return { available: true };
  const taken = (rows ?? []).some(
    (row) =>
      slugify(row.name ?? '') === normalized &&
      (excludeOrgId == null || row.id !== excludeOrgId)
  );
  return { available: !taken };
}

/**
 * Check Nexus availability for Quantum Input flow.
 * Returns VOID (available), TAKEN (claimed org), or GHOST (unclaimed org with preview).
 */
export async function checkNexusAvailability(slug: string): Promise<NexusResult> {
  const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '') || '';
  if (!normalized || normalized.length < 2) {
    return { type: 'VOID' };
  }
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('commercial_organizations')
    .select('id, name');

  if (error) return { type: 'VOID' };
  const match = (rows ?? []).find((row) => slugify(row.name ?? '') === normalized);
  if (!match) return { type: 'VOID' };
  return { type: 'TAKEN' };
}

/**
 * Claim an unclaimed (ghost) organization by slug.
 * Session 10: directory.entities + cortex.relationships only. No legacy writes.
 */
export async function claimGhostOrganizationBySlug(
  _prev: unknown,
  formData: FormData
): Promise<ClaimOrganizationResult> {
  const slug = (formData.get('slug') as string)?.trim()?.toLowerCase().replace(/[^a-z0-9-]/g, '') || '';
  if (!slug || slug.length < 2) {
    return { ok: false, error: 'Invalid slug.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to claim an organization.' };
  }

  // Look up org in directory.entities only
  const { data: orgDirEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, legacy_org_id, owner_workspace_id, attributes')
    .eq('handle', slug)
    .eq('type', 'company')
    .maybeSingle();

  if (!orgDirEntity) {
    return { ok: false, error: 'Organization not found or already claimed.' };
  }

  const attrs = (orgDirEntity.attributes as Record<string, unknown>) ?? {};
  if (attrs.is_claimed === true) {
    return { ok: false, error: 'Organization not found or already claimed.' };
  }

  const orgWorkspaceId = orgDirEntity.owner_workspace_id;
  if (!orgWorkspaceId) {
    return { ok: false, error: 'Organization not found or already claimed.' };
  }

  // Get or create person entity in directory.entities
  const { data: personDirEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();

  let personDirId = personDirEnt?.id ?? null;
  if (!personDirId) {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const { data: newPerson, error: personErr } = await supabase
      .schema('directory')
      .from('entities')
      .insert({
        display_name: (profileRow as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'Owner',
        type: 'person',
        claimed_by_user_id: user.id,
        owner_workspace_id: orgWorkspaceId,
        attributes: { email: user.email ?? '', is_ghost: false },
      })
      .select('id')
      .maybeSingle();
    if (personErr || !newPerson) {
      return { ok: false, error: personErr?.message ?? 'Failed to create your profile.' };
    }
    personDirId = newPerson.id;
  }

  // Mark org as claimed in directory.entities
  const { error: orgUpdateErr } = await supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: { ...attrs, is_claimed: true } })
    .eq('id', orgDirEntity.id);
  if (orgUpdateErr) {
    return { ok: false, error: orgUpdateErr.message ?? 'Failed to claim organization.' };
  }

  // Create ROSTER_MEMBER edge via RPC
  const { error: relErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: personDirId,
    p_target_entity_id: orgDirEntity.id,
    p_type: 'ROSTER_MEMBER',
    p_context_data: { role: 'owner', employment_status: 'internal_employee' },
  });
  if (relErr) {
    // Rollback claimed status
    await supabase.schema('directory').from('entities')
      .update({ attributes: { ...attrs, is_claimed: false } })
      .eq('id', orgDirEntity.id);
    return { ok: false, error: relErr.message ?? 'Failed to link you to the organization.' };
  }

  // Ensure workspace_members
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', orgWorkspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existingMember) {
    await supabase.from('workspace_members').insert({
      workspace_id: orgWorkspaceId,
      user_id: user.id,
      role: 'owner',
    });
  }

  // Mark onboarding complete
  await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);

  revalidatePath('/network');
  revalidatePath('/onboarding');
  redirect('/network');
}

/**
 * Create a Ghost organization and link a contact (entity) to it.
 * Session 10: directory.entities + cortex.relationships only.
 */
export async function createGhostOrganization(
  _prev: unknown,
  formData: FormData
): Promise<CreateGhostOrganizationResult> {
  const raw = {
    name: formData.get('name'),
    contact_email: formData.get('contact_email'),
    creator_org_id: formData.get('creator_org_id') || undefined,
    workspace_id: formData.get('workspace_id'),
  };
  const parsed = createGhostOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const { name, contact_email, creator_org_id, workspace_id } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to create a ghost organization.' };
  }

  // 1) Get creator person entity from directory
  const { data: creatorPersonEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!creatorPersonEnt) {
    return { ok: false, error: 'Your account is not linked to an organization.' };
  }

  // 2) Resolve creator org via cortex ROSTER_MEMBER/MEMBER edges
  let resolvedCreatorOrgEntityId: string;
  let resolvedCreatorOrgId: string;

  if (creator_org_id) {
    const { data: orgEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, legacy_org_id')
      .eq('legacy_org_id', creator_org_id)
      .maybeSingle();
    if (!orgEnt) {
      return { ok: false, error: 'You are not a member of the selected creator organization.' };
    }
    const { data: rel } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('id')
      .eq('source_entity_id', creatorPersonEnt.id)
      .eq('target_entity_id', orgEnt.id)
      .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
      .maybeSingle();
    if (!rel) {
      return { ok: false, error: 'You are not a member of the selected creator organization.' };
    }
    resolvedCreatorOrgEntityId = orgEnt.id;
    resolvedCreatorOrgId = orgEnt.legacy_org_id ?? orgEnt.id;
  } else {
    const { data: rels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id')
      .eq('source_entity_id', creatorPersonEnt.id)
      .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
      .limit(1);
    if (!rels?.length) {
      return { ok: false, error: 'You must belong to an organization to create a ghost profile.' };
    }
    resolvedCreatorOrgEntityId = rels[0].target_entity_id;
    const { data: creatorOrgEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('legacy_org_id')
      .eq('id', resolvedCreatorOrgEntityId)
      .maybeSingle();
    resolvedCreatorOrgId = creatorOrgEnt?.legacy_org_id ?? resolvedCreatorOrgEntityId;
  }

  // 3) Create ghost org in directory.entities
  const baseSlug = slugify(name);
  const slug = baseSlug || `org-${crypto.randomUUID().slice(0, 8)}`;
  const { data: ghostOrg, error: ghostOrgError } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      display_name: name,
      handle: slug,
      type: 'company',
      owner_workspace_id: workspace_id,
      claimed_by_user_id: null,
      attributes: {
        is_ghost: true,
        is_claimed: false,
        created_by_org_id: resolvedCreatorOrgId,
        slug,
      },
    })
    .select('id')
    .single();
  if (ghostOrgError || !ghostOrg) {
    return { ok: false, error: ghostOrgError?.message ?? 'Failed to create organization.' };
  }
  const ghostOrgEntityId = ghostOrg.id;

  // 4) Create ghost contact person in directory.entities
  const { data: ghostContact, error: ghostContactError } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      display_name: contact_email,
      type: 'person',
      claimed_by_user_id: null,
      owner_workspace_id: workspace_id,
      attributes: { is_ghost: true, email: contact_email },
    })
    .select('id')
    .single();
  if (ghostContactError || !ghostContact) {
    await supabase.schema('directory').from('entities').delete().eq('id', ghostOrgEntityId);
    return { ok: false, error: ghostContactError?.message ?? 'Failed to create contact entity.' };
  }

  // 5) Create MEMBER edge: ghost contact → ghost org
  const { error: relError } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: ghostContact.id,
    p_target_entity_id: ghostOrgEntityId,
    p_type: 'MEMBER',
    p_context_data: { role_label: 'Owner', status: 'active', access_level: 'member' },
  });
  if (relError) {
    await supabase.schema('directory').from('entities').delete().eq('id', ghostContact.id);
    await supabase.schema('directory').from('entities').delete().eq('id', ghostOrgEntityId);
    return { ok: false, error: relError.message ?? 'Failed to link contact to organization.' };
  }

  // 6) Create invitation (organization_id stores the directory entity ID — no FK constraint)
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { error: invError } = await supabase.from('invitations').insert({
    organization_id: ghostOrgEntityId,
    email: contact_email,
    token,
    expires_at: expiresAt.toISOString(),
    created_by_org_id: resolvedCreatorOrgId,
    status: 'pending',
  });
  if (invError) {
    // Org and edge are created; invitation can be re-sent later.
    return { ok: true, organizationId: ghostOrgEntityId };
  }

  return { ok: true, organizationId: ghostOrgEntityId };
}

/**
 * Claim an organization using an invitation token.
 * Session 10: directory.entities + cortex.relationships only.
 */
export async function claimOrganization(
  _prev: unknown,
  formData: FormData
): Promise<ClaimOrganizationResult> {
  const raw = { token: formData.get('token') };
  const parsed = claimOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid token.' };
  }
  const { token } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.email) {
    return { ok: false, error: 'You must be signed in to claim an organization.' };
  }

  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .select('id, organization_id, email, status, expires_at')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (invError || !invitation) {
    return { ok: false, error: 'Invalid or expired invitation.' };
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: 'This invitation was sent to a different email address.' };
  }

  // Look up org entity (handles both new directory.id and old legacy_org_id values)
  const orgDirEnt = await findOrgEntity(supabase, invitation.organization_id);
  if (!orgDirEnt) {
    return { ok: false, error: 'Organization not found.' };
  }

  // Find the ghost person entity for this email
  const { data: ghostPersonEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .ilike('attributes->>email', user.email)
    .eq('type', 'person')
    .is('claimed_by_user_id', null)
    .maybeSingle();

  if (!ghostPersonEnt) {
    return { ok: false, error: 'Organization has no linked contact for this email.' };
  }

  // Mark org as claimed in directory.entities
  const attrs = (orgDirEnt.attributes as Record<string, unknown>) ?? {};
  const { error: orgUpdateErr } = await supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: { ...attrs, is_claimed: true } })
    .eq('id', orgDirEnt.id);
  if (orgUpdateErr) {
    return { ok: false, error: orgUpdateErr.message ?? 'Failed to claim organization.' };
  }

  // Link person entity to auth user (claim the ghost)
  const { error: personUpdateErr } = await supabase
    .schema('directory')
    .from('entities')
    .update({ claimed_by_user_id: user.id })
    .eq('id', ghostPersonEnt.id);
  if (personUpdateErr) {
    await supabase.schema('directory').from('entities')
      .update({ attributes: { ...attrs, is_claimed: false } })
      .eq('id', orgDirEnt.id);
    return { ok: false, error: personUpdateErr.message ?? 'Failed to link your account.' };
  }

  // Upsert ROSTER_MEMBER edge with owner role
  await supabase.rpc('upsert_relationship', {
    p_source_entity_id: ghostPersonEnt.id,
    p_target_entity_id: orgDirEnt.id,
    p_type: 'ROSTER_MEMBER',
    p_context_data: { role: 'owner', employment_status: 'internal_employee' },
  });

  // Mark invitation as accepted
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);

  return { ok: true, organizationId: invitation.organization_id };
}

/**
 * Genesis: create the user's primary (HQ) organization when they have none.
 * Session 10: directory.entities + cortex.relationships only. No legacy writes.
 */
export async function createGenesisOrganization(
  _prev: unknown,
  formData: FormData
): Promise<CreateGenesisOrganizationResult> {
  const raw = {
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
    tier: formData.get('tier') || undefined,
    brand_color: (formData.get('brand_color') as string)?.trim() || undefined,
    logo_url: (formData.get('logo_url') as string)?.trim() || undefined,
  };
  const parsed = createGenesisOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { name, tier, brand_color, logo_url } = parsed.data;
  const slugInput = parsed.data.slug?.trim();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to create your organization.' };
  }

  const session = await getSession();
  const workspaceId = session.workspace?.id;
  if (!workspaceId) {
    return { ok: false, error: 'No workspace found. Complete onboarding first.' };
  }

  const tierValue = tier === 'vanguard' || tier === 'command' ? tier : 'scout';
  const slug = slugInput || slugify(name);
  const finalSlug = slug || `org-${crypto.randomUUID().slice(0, 8)}`;

  // 1) Get or create person entity in directory.entities
  const { data: existingPersonEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();

  let personDirId = existingPersonEnt?.id ?? null;
  if (!personDirId) {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const { data: newPerson, error: personErr } = await supabase
      .schema('directory')
      .from('entities')
      .insert({
        display_name: (profileRow as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'Owner',
        type: 'person',
        claimed_by_user_id: user.id,
        owner_workspace_id: workspaceId,
        attributes: { email: user.email ?? '', is_ghost: false },
      })
      .select('id')
      .maybeSingle();
    if (personErr || !newPerson) {
      return { ok: false, error: personErr?.message ?? 'Failed to create your profile.' };
    }
    personDirId = newPerson.id;
  }

  // 2) Create org entity in directory.entities
  const { data: orgEnt, error: orgEntErr } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      display_name: name,
      handle: finalSlug,
      type: 'company',
      owner_workspace_id: workspaceId,
      attributes: {
        is_ghost: false,
        is_claimed: true,
        logo_url: logo_url && logo_url.startsWith('http') ? logo_url : null,
        brand_color: brand_color || null,
        tier: tierValue,
      },
    })
    .select('id')
    .single();
  if (orgEntErr || !orgEnt) {
    return { ok: false, error: orgEntErr?.message ?? 'Failed to create organization.' };
  }

  // 3) Create ROSTER_MEMBER edge (owner)
  const { error: relErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: personDirId,
    p_target_entity_id: orgEnt.id,
    p_type: 'ROSTER_MEMBER',
    p_context_data: { role: 'owner', employment_status: 'internal_employee' },
  });
  if (relErr) {
    await supabase.schema('directory').from('entities').delete().eq('id', orgEnt.id);
    return { ok: false, error: relErr.message ?? 'Failed to add you as owner.' };
  }

  revalidatePath('/network');
  revalidatePath('/onboarding');
  redirect('/network');
}
