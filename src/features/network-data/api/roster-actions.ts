'use server';

import { BOOKABLE_EDGE_TYPES, orgEndOf } from '@/entities/cortex/model/bookable-edges';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { PERSON_ATTR } from '../model/attribute-keys';
import { getCallerWorkspaceRole } from '@/entities/organization/api/caller-workspace-role';

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Gate roster management on workspace membership.
 *
 * This used to read `context_data.role` off the caller's ROSTER_MEMBER edge,
 * which locked the actual workspace owner out of their own roster. An owner's
 * entity carries a MEMBER edge, not ROSTER_MEMBER, so the lookup found nothing,
 * the role read as empty, and every roster mutation returned "Only owners and
 * admins can manage roster members." On the pilot workspace that meant NOBODY
 * could archive, remove, or edit a roster member: the only record holding
 * role='admin' was an unclaimed ghost that no one can sign in as.
 *
 * The authority for permissions is `public.workspace_members.role`. A
 * relationship edge is a fact about the graph, not an authorization -- it is
 * written by ghost/invite flows that never intended to grant anything, and it
 * silently diverges from the real membership row.
 *
 * The caller's own directory entity is deliberately NOT required. Managing the
 * roster is an administrative act; needing a contact-card of your own to
 * perform it is what made a legitimate workspace member fail with
 * "Account not linked".
 */
async function requireRosterAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceOrgId: string
): Promise<
  | { ok: true; orgDirEntityId: string; callerRole: string }
  | { ok: false; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: orgDirEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  if (!orgDirEnt) return { ok: false, error: 'Organization not found.' };

  const callerRole =
    (await getCallerWorkspaceRole(supabase, { legacyOrgId: sourceOrgId })) ?? '';
  if (!['owner', 'admin'].includes(callerRole)) {
    return { ok: false, error: 'Only owners and admins can manage roster members.' };
  }

  return { ok: true, orgDirEntityId: orgDirEnt.id, callerRole };
}

// ─── Return types ─────────────────────────────────────────────────────────────

export type RemoveRosterMemberResult =
  | { ok: true }
  | { ok: false; error: string; requiresForce?: boolean; assignmentCount?: number };

export type RosterActionResult = { ok: true } | { ok: false; error: string };

// ─── removeRosterMember ───────────────────────────────────────────────────────

/**
 * Removes a ROSTER_MEMBER edge from cortex.relationships.
 *
 * If the member has upcoming confirmed/dispatched crew assignments and `force`
 * is false, returns requiresForce: true with the assignment count so the caller
 * can show an inline confirmation before proceeding.
 *
 * Owner-role members cannot be removed; the RPC itself also enforces this but
 * we add an early guard here for a clean error message.
 */
export async function removeRosterMember(
  relationshipId: string,
  sourceOrgId: string,
  force?: boolean
): Promise<RemoveRosterMemberResult> {
  const supabase = await createClient();

  const auth = await requireRosterAdmin(supabase, sourceOrgId);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Look up the edge
  const { data: edge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, context_data')
    .eq('id', relationshipId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  if (!edge) return { ok: false, error: 'Member not found.' };
  if (edge.target_entity_id !== auth.orgDirEntityId) {
    return { ok: false, error: 'Member not found.' };
  }

  const ctx = (edge.context_data as Record<string, unknown>) ?? {};
  if ((ctx.role as string | null) === 'owner') {
    return { ok: false, error: 'Cannot remove the workspace owner from the roster.' };
  }

  // Check for upcoming confirmed / dispatched assignments
  // Only count upcoming assignments — historical confirmed/dispatched must not trigger the force flow
  const { data: assignments } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id')
    .eq('entity_id', edge.source_entity_id)
    .in('status', ['confirmed', 'dispatched'])
    .gte('starts_at', new Date().toISOString());

  if ((assignments?.length ?? 0) > 0 && !force) {
    return {
      ok: false,
      requiresForce: true,
      assignmentCount: assignments!.length,
      error: `This person has ${assignments!.length} upcoming assignment(s). Confirm removal.`,
    };
  }

  // Execute removal via SECURITY DEFINER RPC
  const { error: rpcErr } = await supabase.rpc('remove_relationship', {
    p_source_entity_id: edge.source_entity_id,
    p_target_entity_id: edge.target_entity_id,
    p_relationship_type: 'ROSTER_MEMBER',
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath('/network');
  return { ok: true };
}

// ─── archiveRosterMember ─────────────────────────────────────────────────────

/**
 * Sets the `archived` flag on a ROSTER_MEMBER edge context_data.
 * Archived members remain on the roster but are visually dimmed and excluded
 * from scheduling suggestions.
 */
export async function archiveRosterMember(
  relationshipId: string,
  sourceOrgId: string,
  archived: boolean
): Promise<RosterActionResult> {
  const supabase = await createClient();

  const auth = await requireRosterAdmin(supabase, sourceOrgId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: edge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id')
    .eq('id', relationshipId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  if (!edge) return { ok: false, error: 'Member not found.' };
  if (edge.target_entity_id !== auth.orgDirEntityId) {
    return { ok: false, error: 'Member not found.' };
  }

  const { error: rpcErr } = await supabase.rpc('patch_relationship_context', {
    p_source_entity_id: edge.source_entity_id,
    p_target_entity_id: edge.target_entity_id,
    p_relationship_type: 'ROSTER_MEMBER',
    p_patch: { archived },
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath('/network');
  return { ok: true };
}

// ─── setDoNotRebook ───────────────────────────────────────────────────────────

/**
 * Sets the `do_not_rebook` flag on a relationship's context_data. Triggers the
 * amber indicator on the contact card and blocks the person from appearing in
 * crew scheduling suggestions.
 *
 * Used to be roster-only, on both writers, while every READER already handled
 * any edge type -- so a freelancer could be flagged by the card and never
 * flagged by a human. The comment on `isFlagged` had already argued the point:
 * outside relationships are "where 'never again' is the more consequential
 * judgement, and the ones most likely to be re-booked by someone who was not
 * there the first time".
 *
 * Still owner/admin only: `patch_relationship_context` requires it, and one
 * person deciding the workspace will never hire someone again should be a
 * decision with a name on it.
 */
export async function setDoNotRebook(
  relationshipId: string,
  sourceOrgId: string,
  value: boolean
): Promise<RosterActionResult> {
  const supabase = await createClient();

  const auth = await requireRosterAdmin(supabase, sourceOrgId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: edge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type')
    .eq('id', relationshipId)
    .in('relationship_type', [...BOOKABLE_EDGE_TYPES])
    .maybeSingle();

  if (!edge) return { ok: false, error: 'Not found.' };
  if (orgEndOf(edge) !== auth.orgDirEntityId) {
    return { ok: false, error: 'Not found.' };
  }

  const { error: rpcErr } = await supabase.rpc('patch_relationship_context', {
    p_source_entity_id: edge.source_entity_id,
    p_target_entity_id: edge.target_entity_id,
    p_relationship_type: edge.relationship_type,
    p_patch: { do_not_rebook: value },
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath('/network');
  return { ok: true };
}

// ─── updateRosterMemberField ──────────────────────────────────────────────────

/**
 * Inline-edits a single field on a roster member.
 *
 * - `job_title`: patched onto the ROSTER_MEMBER edge context_data
 * - `phone`:     read-modify-write on directory.entities.attributes (PERSON_ATTR.phone)
 * - `market`:    read-modify-write on directory.entities.attributes (PERSON_ATTR.market)
 */
export async function updateRosterMemberField(
  relationshipId: string,
  sourceOrgId: string,
  field: 'phone' | 'market' | 'job_title',
  value: string
): Promise<RosterActionResult> {
  const supabase = await createClient();

  const auth = await requireRosterAdmin(supabase, sourceOrgId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: edge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, context_data')
    .eq('id', relationshipId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  if (!edge) return { ok: false, error: 'Member not found.' };
  if (edge.target_entity_id !== auth.orgDirEntityId) {
    return { ok: false, error: 'Member not found.' };
  }

  if (field === 'job_title') {
    const { error: rpcErr } = await supabase.rpc('patch_relationship_context', {
      p_source_entity_id: edge.source_entity_id,
      p_target_entity_id: edge.target_entity_id,
      p_relationship_type: 'ROSTER_MEMBER',
      p_patch: { job_title: value },
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
  } else {
    // phone or market: atomic patch via RPC — no read-modify-write round-trip needed.
    // attrKey is always PERSON_ATTR.phone or PERSON_ATTR.market (typed union in function
    // signature — callers cannot pass arbitrary strings).
    const attrKey = field === 'phone' ? PERSON_ATTR.phone : PERSON_ATTR.market;

    const { error: rpcErr } = await supabase.rpc('patch_entity_attributes', {
      p_entity_id: edge.source_entity_id,
      p_attributes: { [attrKey]: value || null },
    });

    if (rpcErr) return { ok: false, error: rpcErr.message };
  }

  revalidatePath('/network');
  return { ok: true };
}
