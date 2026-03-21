/**
 * Summoning Protocol – Invite ghosts, cure relationships, claim account with Magnet.
 * @module features/summoning/api/actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { sendSummonEmail } from '@/shared/api/email/send';
import { randomBytes } from 'crypto';

const INVITE_EXPIRY_DAYS = 14;

type SummonResult =
  | { ok: true; token: string; cured?: false }
  | { ok: true; cured: true; message: string }
  | { ok: false; error: string };

async function getCurrentOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  // Session 9: use directory.entities (claimed_by_user_id) + cortex.relationships
  const { data: personEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!personEnt) return null;

  const { data: rels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', personEnt.id)
    .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
    .limit(5);

  if (!rels?.length) return null;

  // Pick highest-priority role
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2, restricted: 3 };
  const sorted = [...rels].sort((a, b) => {
    const ra = (a.context_data as Record<string, unknown>)?.role as string ?? '';
    const rb = (b.context_data as Record<string, unknown>)?.role as string ?? '';
    return (roleOrder[ra] ?? 99) - (roleOrder[rb] ?? 99);
  });
  const best = sorted[0];

  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('legacy_org_id')
    .eq('id', best.target_entity_id)
    .maybeSingle();

  return orgEnt?.legacy_org_id ?? null;
}

/**
 * Generate a secure token for invitations (cannot be guessed).
 */
function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Summon a partner (ghost org) by email. If they already have a real account, "Cure" the relationship.
 * Idempotent: repeated call with same args returns existing pending token.
 */
export async function createPartnerSummon(
  originOrgId: string,
  ghostOrgId: string,
  email: string,
  payload?: { redirectTo?: string }
): Promise<SummonResult> {
  const supabase = await createClient();
  const currentOrgId = await getCurrentOrgId(supabase);
  if (!currentOrgId || currentOrgId !== originOrgId) {
    return { ok: false, error: 'Not authorized.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: 'Email is required.' };

  // Cure: already a real user with this email? Check via directory.entities
  const { data: claimedEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, claimed_by_user_id, attributes')
    .ilike('attributes->>email', normalizedEmail)
    .maybeSingle();

  if (claimedEntity?.claimed_by_user_id) {
    // Find the sovereign org via cortex MEMBER/ROSTER_MEMBER edge (owner role)
    const { data: rels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id, context_data')
      .eq('source_entity_id', claimedEntity.id)
      .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
      .limit(5);
    const ownerRel = (rels ?? []).find((r) => {
      const ctx = (r.context_data as Record<string, unknown>) ?? {};
      return ctx.role === 'owner' || ctx.role === 'admin';
    });
    if (ownerRel) {
      const { data: sovereignOrgEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, legacy_org_id, attributes')
        .eq('id', ownerRel.target_entity_id)
        .maybeSingle();
      const orgAttrs = (sovereignOrgEnt?.attributes as Record<string, unknown>) ?? {};
      if (sovereignOrgEnt && orgAttrs.is_claimed === true) {
        // Update cortex: change ghost edge to sovereign edge
        const { data: originDirEnt } = await supabase
          .schema('directory').from('entities')
          .select('id').eq('legacy_org_id', originOrgId).maybeSingle();
        const { data: ghostDirEnt } = await supabase
          .schema('directory').from('entities')
          .select('id').eq('legacy_org_id', ghostOrgId).maybeSingle();
        if (originDirEnt && ghostDirEnt) {
          // Upsert new edge pointing to sovereign org (old ghost edge remains; sovereign takes precedence)
          await supabase.rpc('upsert_relationship', {
            p_source_entity_id: originDirEnt.id,
            p_target_entity_id: sovereignOrgEnt.id,
            p_type: 'PARTNER',
            p_context_data: { tier: 'preferred', lifecycle_status: 'active' },
          });
        }
        revalidatePath('/network');
        return { ok: true, cured: true, message: 'Partner already on Signal. Relationship updated.' };
      }
    }
  }

  // Idempotent: existing pending invitation for this email + ghost + origin?
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
  const { data: existing } = await supabase
    .from('invitations')
    .select('id, token')
    .eq('email', normalizedEmail)
    .eq('target_org_id', ghostOrgId)
    .eq('created_by_org_id', originOrgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return { ok: true, token: existing.token };
  }

  const token = generateSecureToken();
  const { error } = await supabase.from('invitations').insert({
    token,
    email: normalizedEmail,
    created_by_org_id: originOrgId,
    organization_id: ghostOrgId,
    target_org_id: ghostOrgId,
    type: 'partner_summon',
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    payload: payload ?? null,
  } as Record<string, unknown>);

  if (error) return { ok: false, error: error.message };

  const { data: originEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name')
    .eq('legacy_org_id', originOrgId)
    .maybeSingle();
  const originName = originEntity?.display_name ?? 'A partner';
  const sendResult = await sendSummonEmail(normalizedEmail, token, originName);
  if (!sendResult.ok) {
    // Invite is created; link can be shared manually. Do not fail the action.
    console.warn('[Summoning] Courier failed:', sendResult.error);
  }
  return { ok: true, token };
}

/**
 * Create auth user for claim flow (Step 3). Call this before finishPartnerClaim so session exists.
 */
export async function signUpForClaim(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: undefined },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Validate a summon/claim token; returns email and payload for the claim wizard.
 */
export async function validateSummonToken(
  token: string
): Promise<
  | { ok: true; email: string; payload: { redirectTo?: string } | null; type: string }
  | { ok: false; error: string }
> {
  if (!token?.trim()) return { ok: false, error: 'Missing token.' };
  const supabase = await createClient();
  const { data: inv, error } = await supabase
    .from('invitations')
    .select('id, email, status, expires_at, type, payload')
    .eq('token', token.trim())
    .maybeSingle();
  if (error || !inv) return { ok: false, error: 'Invalid or expired link.' };
  if (inv.status !== 'pending') return { ok: false, error: 'This link has already been used.' };
  if (new Date(inv.expires_at) <= new Date()) return { ok: false, error: 'This link has expired.' };
  const payload = (inv.payload as { redirectTo?: string } | null) ?? null;
  return {
    ok: true,
    email: inv.email,
    payload,
    type: (inv as { type?: string }).type ?? 'employee_invite',
  };
}

export type ClaimInvitation = {
  token: string;
  email: string;
  type: string;
  payload: { redirectTo?: string } | null;
  originName: string;
  targetName: string;
  targetLogoUrl: string | null;
};

/**
 * Fetch full invitation by token for the Airlock (claim page). Returns origin + target org names.
 * Use for Server Component; invalid/expired/used -> ok: false.
 */
export async function getInvitationForClaim(
  token: string
): Promise<{ ok: true; invitation: ClaimInvitation } | { ok: false; error: string }> {
  if (!token?.trim()) return { ok: false, error: 'Missing token.' };
  const supabase = await createClient();
  const { data: inv, error: invError } = await supabase
    .from('invitations')
    .select('id, email, status, expires_at, type, payload, created_by_org_id, target_org_id, organization_id')
    .eq('token', token.trim())
    .maybeSingle();

  if (invError || !inv) return { ok: false, error: 'Invalid or expired link.' };
  const invRow = inv as { created_by_org_id: string; target_org_id: string | null; organization_id: string; type?: string; payload: unknown };
  if (inv.status !== 'pending') return { ok: false, error: 'This link has already been used.' };
  if (new Date((inv as { expires_at: string }).expires_at) <= new Date()) return { ok: false, error: 'This link has expired.' };

  const targetOrgId = invRow.target_org_id ?? invRow.organization_id;
  // Support both old (legacy_org_id) and new (directory entity id) org identifiers
  const [originRes, targetRes] = await Promise.all([
    supabase.schema('directory').from('entities').select('display_name').or(`legacy_org_id.eq.${invRow.created_by_org_id},id.eq.${invRow.created_by_org_id}`).eq('type', 'company').maybeSingle(),
    supabase.schema('directory').from('entities').select('display_name, avatar_url').or(`legacy_org_id.eq.${targetOrgId},id.eq.${targetOrgId}`).eq('type', 'company').maybeSingle(),
  ]);
  const originName = originRes.data?.display_name ?? 'A partner';
  const targetName = targetRes.data?.display_name ?? (inv as { email: string }).email.split('@')[0] ?? 'Your organization';
  const targetLogoUrl = targetRes.data?.avatar_url ?? null;
  const payload = (invRow.payload as { redirectTo?: string } | null) ?? null;

  return {
    ok: true,
    invitation: {
      token: token.trim(),
      email: (inv as { email: string }).email,
      type: invRow.type ?? 'employee_invite',
      payload,
      originName,
      targetName,
      targetLogoUrl,
    },
  };
}

/**
 * After the user has signed up (auth exists), complete the claim: create sovereign org and run the Magnet.
 * Session 10: directory.entities + cortex.relationships only. No legacy writes.
 * Call this from the claim page after client-side signUp succeeds.
 */
export async function finishPartnerClaim(
  token: string,
  name: string,
  slug?: string
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.email) return { ok: false, error: 'You must be signed in.' };

  const { data: inv, error: invError } = await supabase
    .from('invitations')
    .select('id, email, organization_id, target_org_id, created_by_org_id, payload')
    .eq('token', token.trim())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .eq('type', 'partner_summon')
    .maybeSingle();

  if (invError || !inv) return { ok: false, error: 'Invalid or expired invitation.' };
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: 'This invitation was sent to a different email address.' };
  }

  const payload = (inv.payload as { redirectTo?: string } | null) ?? null;
  const redirectTo = payload?.redirectTo ?? '/network';

  const ghostOrgId = (inv as { target_org_id?: string | null; organization_id: string }).target_org_id ?? inv.organization_id;
  const invRow = inv as { created_by_org_id: string };

  // Resolve ghost org entity in directory (id or legacy_org_id)
  const { data: ghostOrgEnt } = await supabase
    .schema('directory').from('entities')
    .select('id, owner_workspace_id, attributes')
    .or(`id.eq.${ghostOrgId},legacy_org_id.eq.${ghostOrgId}`)
    .eq('type', 'company')
    .maybeSingle();

  const workspaceId: string | undefined = ghostOrgEnt?.owner_workspace_id ?? undefined;
  if (!workspaceId) return { ok: false, error: 'Workspace not found.' };

  // Get or create person entity in directory.entities
  const { data: existingPersonEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();

  let personDirId: string;
  if (existingPersonEnt) {
    personDirId = existingPersonEnt.id;
    // Ensure workspace ownership
    await supabase.schema('directory').from('entities')
      .update({ owner_workspace_id: workspaceId })
      .eq('id', personDirId);
  } else {
    // Check for ghost entity by email
    const { data: ghostPersonEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').ilike('attributes->>email', user.email).eq('type', 'person').is('claimed_by_user_id', null).maybeSingle();
    if (ghostPersonEnt) {
      await supabase.schema('directory').from('entities')
        .update({ claimed_by_user_id: user.id, owner_workspace_id: workspaceId })
        .eq('id', ghostPersonEnt.id);
      personDirId = ghostPersonEnt.id;
    } else {
      const { data: newPersonEnt, error: personErr } = await supabase
        .schema('directory').from('entities')
        .insert({
          display_name: user.email,
          type: 'person',
          claimed_by_user_id: user.id,
          owner_workspace_id: workspaceId,
          attributes: { email: user.email, is_ghost: false },
        }).select('id').single();
      if (personErr || !newPersonEnt) return { ok: false, error: 'Failed to create profile.' };
      personDirId = newPersonEnt.id;
    }
  }

  const orgName = name?.trim() || inv.email.split('@')[0] || 'My Organization';
  const orgSlug = (slug?.trim() || orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).slice(0, 64) || 'org';

  // Create sovereign org in directory.entities
  const { data: sovereignOrgEnt, error: orgError } = await supabase
    .schema('directory').from('entities')
    .insert({
      display_name: orgName,
      handle: orgSlug,
      type: 'company',
      owner_workspace_id: workspaceId,
      attributes: { is_claimed: true, is_ghost: false },
    }).select('id').single();

  if (orgError || !sovereignOrgEnt) return { ok: false, error: 'Failed to create organization.' };

  // Create ROSTER_MEMBER edge: person → sovereign org
  const { error: relErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: personDirId,
    p_target_entity_id: sovereignOrgEnt.id,
    p_type: 'ROSTER_MEMBER',
    p_context_data: { role: 'owner', employment_status: 'internal_employee' },
  });
  if (relErr) {
    await supabase.schema('directory').from('entities').delete().eq('id', sovereignOrgEnt.id);
    return { ok: false, error: 'Failed to create owner relationship.' };
  }

  // Magnet: find all ghost orgs this person entity is MEMBER of via cortex
  const { data: personMemberRels } = await supabase
    .schema('cortex').from('relationships')
    .select('target_entity_id')
    .eq('source_entity_id', personDirId)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']);

  const ghostOrgEntityIds = [...new Set([
    ...(ghostOrgEnt ? [ghostOrgEnt.id] : []),
    ...(personMemberRels ?? []).map((r) => r.target_entity_id),
  ])];

  if (ghostOrgEntityIds.length > 0) {
    const { data: ghostOrgEntities } = await supabase
      .schema('directory').from('entities')
      .select('id, legacy_org_id, attributes')
      .in('id', ghostOrgEntityIds)
      .eq('type', 'company');

    const unclaimed = (ghostOrgEntities ?? []).filter((e) => {
      const attrs = (e.attributes as Record<string, unknown>) ?? {};
      return attrs.is_claimed !== true;
    });

    for (const ghost of unclaimed) {
      const ghostAttrs = (ghost.attributes as Record<string, unknown>) ?? {};
      const plannerOrgId = ghostAttrs.created_by_org_id as string | null;
      if (!plannerOrgId) continue;

      // Find planner entity in directory
      const { data: plannerEnt } = await supabase
        .schema('directory').from('entities')
        .select('id, legacy_org_id')
        .or(`legacy_org_id.eq.${plannerOrgId},id.eq.${plannerOrgId}`)
        .eq('type', 'company')
        .maybeSingle();

      if (!plannerEnt?.id) continue;

      // Find existing PARTNER edge from planner to ghost (for notes)
      const { data: existingEdge } = await supabase
        .schema('cortex').from('relationships')
        .select('context_data')
        .eq('source_entity_id', plannerEnt.id)
        .eq('target_entity_id', ghost.id)
        .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT', 'VENUE_PARTNER'])
        .maybeSingle();

      const existingCtx = (existingEdge?.context_data as Record<string, unknown>) ?? {};

      // Upsert PARTNER edge from planner to sovereign org
      await supabase.rpc('upsert_relationship', {
        p_source_entity_id: plannerEnt.id,
        p_target_entity_id: sovereignOrgEnt.id,
        p_type: 'PARTNER',
        p_context_data: { tier: 'preferred', lifecycle_status: 'active', notes: existingCtx.notes ?? null },
      });

      // Migrate private data (keyed by legacy_org_id for backward compat)
      const plannerLegacyId = plannerEnt.legacy_org_id ?? plannerEnt.id;
      const ghostLegacyId = ghost.legacy_org_id ?? ghost.id;
      const sovereignLegacyId = ghostLegacyId; // preserve subject key for now

      const { data: privateRow } = await supabase
        .from('org_private_data')
        .select('private_notes, internal_rating')
        .eq('owner_org_id', plannerLegacyId)
        .eq('subject_org_id', ghostLegacyId)
        .maybeSingle();

      if (privateRow) {
        await supabase.from('org_private_data').upsert({
          owner_org_id: plannerLegacyId,
          subject_org_id: sovereignLegacyId,
          private_notes: privateRow.private_notes,
          internal_rating: privateRow.internal_rating,
        }, { onConflict: 'subject_org_id,owner_org_id' });
      }
    }
  }

  await supabase.from('invitations').update({ status: 'accepted' }).eq('id', inv.id);
  revalidatePath('/network');
  return { ok: true, redirectTo };
}
