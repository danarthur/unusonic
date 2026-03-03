/**
 * Signal Onboarding – Server Actions for Ghost org creation and claiming.
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
 * Check if a slug is available for a new organization (Genesis) or for an existing org (exclude its id).
 * Uses commercial_organizations (name → slugified) since public.organizations may not exist in this project.
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

  if (error) return { available: true }; // Don't block on missing table or RLS
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
 * Uses commercial_organizations (name → slugified) since public.organizations may not exist in this project.
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

  if (error) return { type: 'VOID' }; // Don't block on missing table or RLS
  const match = (rows ?? []).find((row) => slugify(row.name ?? '') === normalized);
  if (!match) return { type: 'VOID' };
  // commercial_organizations are treated as claimed (no GHOST in this schema)
  return { type: 'TAKEN' };
}

/**
 * Claim an unclaimed (ghost) organization by slug.
 * User must be authenticated. Org must exist and be unclaimed.
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

  // Prefer directory.entities; fallback to public.organizations
  const { data: orgDirEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('legacy_org_id, owner_workspace_id, attributes')
    .eq('handle', slug)
    .eq('type', 'company')
    .maybeSingle();

  let orgId: string;
  let orgWorkspaceId: string;
  let orgAttrs: Record<string, unknown> = {};

  if (orgDirEntity?.legacy_org_id) {
    const attrs = (orgDirEntity.attributes as Record<string, unknown>) ?? {};
    if (attrs.is_claimed === true) {
      return { ok: false, error: 'Organization not found or already claimed.' };
    }
    orgId = orgDirEntity.legacy_org_id;
    orgWorkspaceId = orgDirEntity.owner_workspace_id ?? '';
    orgAttrs = attrs;
    if (!orgWorkspaceId) return { ok: false, error: 'Organization not found or already claimed.' };
  } else {
    // Fallback: org not yet in directory
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, workspace_id')
      .eq('slug', slug)
      .eq('is_claimed', false)
      .maybeSingle();
    if (orgError || !org) {
      return { ok: false, error: 'Organization not found or already claimed.' };
    }
    orgId = org.id;
    orgWorkspaceId = org.workspace_id;
  }

  let entityId: string;
  const { data: existingEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (existingEntity) {
    entityId = existingEntity.id;
  } else {
    const { data: newEntity, error: insertError } = await supabase
      .from('entities')
      .insert({ email: user.email ?? '', is_ghost: false, auth_id: user.id })
      .select('id')
      .single();
    if (insertError || !newEntity) {
      return { ok: false, error: insertError?.message ?? 'Failed to create profile.' };
    }
    entityId = newEntity.id;
  }

  const { error: orgUpdateError } = await supabase
    .from('organizations')
    .update({
      is_claimed: true,
      claimed_at: new Date().toISOString(),
      owner_id: entityId,
    })
    .eq('id', orgId);
  if (orgUpdateError) {
    return { ok: false, error: orgUpdateError.message ?? 'Failed to claim organization.' };
  }

  const { error: affError } = await supabase.from('affiliations').insert({
    organization_id: orgId,
    entity_id: entityId,
    role_label: 'Owner',
    status: 'active',
    access_level: 'admin',
  });
  if (affError) {
    await supabase.from('organizations').update({ is_claimed: false, claimed_at: null, owner_id: null }).eq('id', orgId);
    return { ok: false, error: affError.message ?? 'Failed to link you to the organization.' };
  }

  const { error: memberError } = await supabase.from('org_members').insert({
    org_id: orgId,
    entity_id: entityId,
    workspace_id: orgWorkspaceId,
    profile_id: null,
    first_name: null,
    last_name: null,
    job_title: null,
    employment_status: 'internal_employee',
    role: 'owner',
    default_hourly_rate: 0,
  });
  if (memberError) {
    await supabase.from('affiliations').delete().eq('entity_id', entityId).eq('organization_id', orgId);
    await supabase.from('organizations').update({ is_claimed: false, claimed_at: null, owner_id: null }).eq('id', orgId);
    return { ok: false, error: memberError.message ?? 'Failed to add you as owner.' };
  }

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

  // Non-fatal: sync claim status to directory.entities (only if org was found in directory)
  if (orgDirEntity?.legacy_org_id) {
    await supabase.schema('directory').from('entities')
      .update({ attributes: { ...orgAttrs, is_claimed: true } })
      .eq('legacy_org_id', orgId);
  }

  // Non-fatal: ensure person entity is in directory.entities + create ROSTER_MEMBER edge
  {
    const { data: personDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
    let personDirId = personDirEnt?.id ?? null;
    if (!personDirId) {
      const { data: profileRow } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const { data: newPersonDir } = await supabase
        .schema('directory').from('entities').insert({
          display_name: (profileRow as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'Owner',
          type: 'person',
          claimed_by_user_id: user.id,
          owner_workspace_id: orgWorkspaceId,
          legacy_entity_id: entityId,
          attributes: { email: user.email ?? '', is_ghost: false },
        }).select('id').maybeSingle();
      personDirId = newPersonDir?.id ?? null;
    }
    if (personDirId) {
      const { data: orgDirEnt } = await supabase
        .schema('directory').from('entities').select('id').eq('legacy_org_id', orgId).maybeSingle();
      if (orgDirEnt?.id) {
        await supabase.rpc('upsert_relationship', {
          p_source_entity_id: personDirId,
          p_target_entity_id: orgDirEnt.id,
          p_type: 'ROSTER_MEMBER',
          p_context_data: { role: 'owner', employment_status: 'internal_employee' },
        });
      }
    }
  }

  // Mark onboarding complete so user isn't redirected back to /onboarding
  await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);

  revalidatePath('/network');
  revalidatePath('/onboarding');
  redirect('/network');
}

/**
 * Create a Ghost organization and link a contact (entity) to it.
 * Creator must be admin/member of an org; that org becomes created_by_org_id.
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

  // 1) Ensure current user has an entity (for RLS / creator identity)
  const { data: myEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  let creatorEntityId: string;
  if (myEntity) {
    creatorEntityId = myEntity.id;
  } else {
    const { data: newEntity, error: insertEntityError } = await supabase
      .from('entities')
      .insert({
        email: user.email ?? '',
        is_ghost: false,
        auth_id: user.id,
      })
      .select('id')
      .single();
    if (insertEntityError || !newEntity) {
      return { ok: false, error: insertEntityError?.message ?? 'Failed to create creator entity.' };
    }
    creatorEntityId = newEntity.id;
  }

  // 2) Resolve creator_org_id (org on whose behalf we're creating)
  let resolvedCreatorOrgId: string;
  if (creator_org_id) {
    const { data: aff } = await supabase
      .from('affiliations')
      .select('organization_id')
      .eq('entity_id', creatorEntityId)
      .eq('organization_id', creator_org_id)
      .in('access_level', ['admin', 'member'])
      .maybeSingle();
    if (!aff) {
      return { ok: false, error: 'You are not a member of the selected creator organization.' };
    }
    resolvedCreatorOrgId = creator_org_id;
  } else {
    const { data: firstAff } = await supabase
      .from('affiliations')
      .select('organization_id')
      .eq('entity_id', creatorEntityId)
      .in('access_level', ['admin', 'member'])
      .limit(1)
      .maybeSingle();
    if (!firstAff) {
      return { ok: false, error: 'You must belong to an organization to create a ghost profile.' };
    }
    resolvedCreatorOrgId = firstAff.organization_id;
  }

  // 3) Create organization with unique slug
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;
  let orgId: string;

  while (true) {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug: slug || `org-${crypto.randomUUID().slice(0, 8)}`,
        is_claimed: false,
        workspace_id,
        created_by_org_id: resolvedCreatorOrgId,
      })
      .select('id')
      .single();
    if (!orgError) {
      orgId = org.id;
      break;
    }
    if (orgError.code === '23505' && attempts < maxAttempts) {
      attempts++;
      slug = `${baseSlug}-${attempts}`;
      continue;
    }
    return { ok: false, error: orgError.message ?? 'Failed to create organization.' };
  }

  // Non-fatal: mirror ghost org to directory.entities
  await supabase.schema('directory').from('entities').insert({
    legacy_org_id: orgId,
    display_name: name,
    handle: slug || null,
    type: 'company',
    owner_workspace_id: workspace_id,
    claimed_by_user_id: null,
    attributes: {
      is_ghost: true,
      is_claimed: false,
      created_by_org_id: resolvedCreatorOrgId,
      slug: slug || null,
    },
  });

  // 4) Create ghost entity for the contact
  const { data: ghostEntity, error: ghostError } = await supabase
    .from('entities')
    .insert({
      email: contact_email,
      is_ghost: true,
    })
    .select('id')
    .single();
  if (ghostError || !ghostEntity) {
    await supabase.from('organizations').delete().eq('id', orgId);
    return { ok: false, error: ghostError?.message ?? 'Failed to create contact entity.' };
  }

  // Non-fatal: mirror ghost contact entity to directory.entities
  await supabase.schema('directory').from('entities').insert({
    legacy_entity_id: ghostEntity.id,
    display_name: contact_email,
    type: 'person',
    claimed_by_user_id: null,
    owner_workspace_id: workspace_id,
    attributes: { is_ghost: true },
  });

  // 5) Link contact to org via affiliation
  const { error: affError } = await supabase.from('affiliations').insert({
    organization_id: orgId,
    entity_id: ghostEntity.id,
    role_label: 'Owner',
    status: 'active',
    access_level: 'member',
  });
  if (affError) {
    await supabase.from('entities').delete().eq('id', ghostEntity.id);
    await supabase.from('organizations').delete().eq('id', orgId);
    return { ok: false, error: affError.message ?? 'Failed to link contact to organization.' };
  }

  // 6) Create invitation for claiming (secure token)
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { error: invError } = await supabase.from('invitations').insert({
    organization_id: orgId,
    email: contact_email,
    token,
    expires_at: expiresAt.toISOString(),
    created_by_org_id: resolvedCreatorOrgId,
    status: 'pending',
  });
  if (invError) {
    // Org and affiliation are created; invitation can be re-sent later.
    return { ok: true, organizationId: orgId };
  }

  return { ok: true, organizationId: orgId };
}

/**
 * Claim an organization using an invitation token.
 * Caller must be authenticated; their email must match the invitation.
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

  // Resolve the ghost entity for this org (the one we created for this email)
  const { data: affiliation } = await supabase
    .from('affiliations')
    .select('entity_id')
    .eq('organization_id', invitation.organization_id)
    .limit(1)
    .maybeSingle();
  if (!affiliation) {
    return { ok: false, error: 'Organization has no linked contact.' };
  }
  const entityId = affiliation.entity_id;

  // Update organization: claimed, owner, claimed_at
  const { error: orgUpdateError } = await supabase
    .from('organizations')
    .update({
      is_claimed: true,
      claimed_at: new Date().toISOString(),
      owner_id: entityId,
    })
    .eq('id', invitation.organization_id);
  if (orgUpdateError) {
    return { ok: false, error: orgUpdateError.message ?? 'Failed to claim organization.' };
  }

  // Non-fatal: sync claim status to directory.entities org
  {
    const { data: orgDir } = await supabase.schema('directory').from('entities')
      .select('attributes').eq('legacy_org_id', invitation.organization_id).maybeSingle();
    if (orgDir) {
      const existingAttrs = (orgDir.attributes as Record<string, unknown>) ?? {};
      await supabase.schema('directory').from('entities')
        .update({ attributes: { ...existingAttrs, is_claimed: true } })
        .eq('legacy_org_id', invitation.organization_id);
    }
  }

  // Update entity: no longer ghost, link to auth user
  const { error: entityUpdateError } = await supabase
    .from('entities')
    .update({ is_ghost: false, auth_id: user.id })
    .eq('id', entityId);
  if (entityUpdateError) {
    return { ok: false, error: entityUpdateError.message ?? 'Failed to link your account.' };
  }

  // Non-fatal: set claimed_by_user_id on directory.entities person entity
  await supabase.schema('directory').from('entities')
    .update({ claimed_by_user_id: user.id })
    .eq('legacy_entity_id', entityId);

  // Grant admin access to the claimer
  const { error: affUpdateError } = await supabase
    .from('affiliations')
    .update({ access_level: 'admin' })
    .eq('organization_id', invitation.organization_id)
    .eq('entity_id', entityId);
  if (affUpdateError) {
    return { ok: false, error: affUpdateError.message ?? 'Failed to grant admin access.' };
  }

  // Mark invitation as accepted
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);

  // Non-fatal: create ROSTER_MEMBER edge in cortex for the claimer
  {
    const { data: personDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('legacy_entity_id', entityId).maybeSingle();
    const { data: orgDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('legacy_org_id', invitation.organization_id).maybeSingle();
    if (personDirEnt?.id && orgDirEnt?.id) {
      await supabase.rpc('upsert_relationship', {
        p_source_entity_id: personDirEnt.id,
        p_target_entity_id: orgDirEnt.id,
        p_type: 'ROSTER_MEMBER',
        p_context_data: { role: 'owner', employment_status: 'internal_employee' },
      });
    }
  }

  return { ok: true, organizationId: invitation.organization_id };
}

/**
 * Genesis: create the user's primary (HQ) organization when they have none.
 * Creates Organization (is_claimed: true), Entity if needed, and Affiliation (Owner, active).
 * Revalidates /network so the grid loads immediately.
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

  let entityId: string;
  const { data: existingEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (existingEntity) {
    entityId = existingEntity.id;
  } else {
    const { data: newEntity, error: insertEntityError } = await supabase
      .from('entities')
      .insert({
        email: user.email ?? '',
        is_ghost: false,
        auth_id: user.id,
      })
      .select('id')
      .single();
    if (insertEntityError || !newEntity) {
      return { ok: false, error: insertEntityError?.message ?? 'Failed to create your profile.' };
    }
    entityId = newEntity.id;
  }

  const slug = slugInput || slugify(name);
  let finalSlug = slug || `org-${crypto.randomUUID().slice(0, 8)}`;
  let attempts = 0;
  const maxAttempts = 10;
  let orgId: string;

  const tierValue = tier === 'vanguard' || tier === 'command' ? tier : 'scout';

  while (true) {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug: finalSlug,
        is_claimed: true,
        workspace_id: workspaceId,
        owner_id: entityId,
        tier: tierValue,
        brand_color: brand_color || null,
        logo_url: logo_url && logo_url.startsWith('http') ? logo_url : null,
      })
      .select('id')
      .single();
    if (!orgError) {
      orgId = org.id;
      break;
    }
    if (orgError.code === '23505' && attempts < maxAttempts) {
      attempts++;
      finalSlug = `${slug}-${attempts}`;
      continue;
    }
    return { ok: false, error: orgError.message ?? 'Failed to create organization.' };
  }

  // Non-fatal: mirror genesis org to directory.entities
  await supabase.schema('directory').from('entities').insert({
    legacy_org_id: orgId,
    display_name: name,
    handle: finalSlug || null,
    type: 'company',
    owner_workspace_id: workspaceId,
    attributes: {
      is_ghost: false,
      is_claimed: true,
      logo_url: logo_url && logo_url.startsWith('http') ? logo_url : null,
      brand_color: brand_color || null,
      tier: tierValue,
    },
  });

  const { error: affError } = await supabase.from('affiliations').insert({
    organization_id: orgId,
    entity_id: entityId,
    role_label: 'Owner',
    status: 'active',
    access_level: 'admin',
  });
  if (affError) {
    await supabase.from('organizations').delete().eq('id', orgId);
    return { ok: false, error: affError.message ?? 'Failed to link you to the organization.' };
  }

  const { error: memberError } = await supabase.from('org_members').insert({
    org_id: orgId,
    entity_id: entityId,
    workspace_id: workspaceId,
    profile_id: null,
    first_name: null,
    last_name: null,
    job_title: null,
    employment_status: 'internal_employee',
    role: 'owner',
    default_hourly_rate: 0,
  });
  if (memberError) {
    await supabase.from('affiliations').delete().eq('entity_id', entityId).eq('organization_id', orgId);
    await supabase.from('organizations').delete().eq('id', orgId);
    return { ok: false, error: memberError.message ?? 'Failed to add you as owner.' };
  }

  // Non-fatal: ensure person entity is in directory.entities + create ROSTER_MEMBER edge
  // Required so getCurrentEntityAndOrg() resolves correctly on /network after genesis.
  {
    const { data: personDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
    let personDirId = personDirEnt?.id ?? null;
    if (!personDirId) {
      const { data: profileRow } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const { data: newPersonDir } = await supabase
        .schema('directory').from('entities').insert({
          display_name: (profileRow as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'Owner',
          type: 'person',
          claimed_by_user_id: user.id,
          owner_workspace_id: workspaceId,
          legacy_entity_id: entityId,
          attributes: { email: user.email ?? '', is_ghost: false },
        }).select('id').maybeSingle();
      personDirId = newPersonDir?.id ?? null;
    }
    if (personDirId) {
      const { data: orgDirEnt } = await supabase
        .schema('directory').from('entities').select('id').eq('legacy_org_id', orgId).maybeSingle();
      if (orgDirEnt?.id) {
        await supabase.rpc('upsert_relationship', {
          p_source_entity_id: personDirId,
          p_target_entity_id: orgDirEnt.id,
          p_type: 'ROSTER_MEMBER',
          p_context_data: { role: 'owner', employment_status: 'internal_employee' },
        });
      }
    }
  }

  revalidatePath('/network');
  revalidatePath('/onboarding');
  redirect('/network');
}
