'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { PERSON_ATTR } from '../model/attribute-keys';

// ─── Auth helper (mirrors pattern from actions.ts) ────────────────────────────

async function getCallerAndOrgDirEntity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceOrgId: string
): Promise<
  | { ok: true; callerEntityId: string; orgDirEntityId: string; callerRole: string }
  | { ok: false; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: callerEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!callerEnt) return { ok: false, error: 'Account not linked.' };

  const { data: orgDirEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  if (!orgDirEnt) return { ok: false, error: 'Organization not found.' };

  const { data: callerRel } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('context_data')
    .eq('source_entity_id', callerEnt.id)
    .eq('target_entity_id', orgDirEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  const callerCtx = (callerRel?.context_data as Record<string, unknown>) ?? {};
  const callerRole = (callerCtx.role as string | null) ?? '';

  if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
    return { ok: false, error: 'Only owners and admins can manage roster members.' };
  }

  return {
    ok: true,
    callerEntityId: callerEnt.id,
    orgDirEntityId: orgDirEnt.id,
    callerRole,
  };
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

  const auth = await getCallerAndOrgDirEntity(supabase, sourceOrgId);
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

  const auth = await getCallerAndOrgDirEntity(supabase, sourceOrgId);
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
 * Sets the `do_not_rebook` flag on a ROSTER_MEMBER edge context_data.
 * Triggers an amber indicator on the NetworkCard and blocks the member from
 * appearing in crew scheduling suggestions.
 */
export async function setDoNotRebook(
  relationshipId: string,
  sourceOrgId: string,
  value: boolean
): Promise<RosterActionResult> {
  const supabase = await createClient();

  const auth = await getCallerAndOrgDirEntity(supabase, sourceOrgId);
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

  const auth = await getCallerAndOrgDirEntity(supabase, sourceOrgId);
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
