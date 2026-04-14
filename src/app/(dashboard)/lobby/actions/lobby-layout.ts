'use server';

/**
 * Per-user Lobby layout server actions — Phase 2.2.
 *
 * Reads and writes `public.user_lobby_layout`, scoped by
 * (user_id, workspace_id, role_slug). The role slug participates in the PK so
 * a user who switches role inside the same workspace (rare, but supported)
 * gets a clean per-role layout rather than a blended one.
 *
 * Default seeding is handled in-action: when no row exists, we resolve the
 * caller's role, map it to a metric persona, and hand back the capability-
 * filtered defaults from `ROLE_DEFAULTS`. The caller (Lobby page) never has
 * to know about fallback logic.
 *
 * Validation is strict on save: unknown metric IDs, metrics the caller lacks
 * capability for, duplicates, and over-cap layouts all raise before writing.
 *
 * @module app/(dashboard)/lobby/actions/layout
 */

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { METRICS } from '@/shared/lib/metrics/registry';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import { getRoleDefaults } from '@/shared/lib/metrics/library';
import { personaForWorkspaceRole } from '@/shared/lib/metrics/personas';
import {
  ROLE_DEFAULTS,
  LOBBY_CARD_CAP,
} from '@/shared/lib/metrics/role-defaults';
import type { WorkspaceRole } from '@/shared/lib/permissions';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LobbyLayout = {
  cardIds: string[];
  /** True when we returned seeded defaults (no row in user_lobby_layout). */
  isDefault: boolean;
  /** Role slug in effect when the layout was resolved. */
  roleSlug: string;
  /** Workspace the layout belongs to. */
  workspaceId: string;
};

// ─── Context resolution ─────────────────────────────────────────────────────

/**
 * Resolves the current user, workspace, and role slug in one shot. Throws on
 * missing auth / missing workspace / missing membership so the server action
 * callers can surface a single consistent error.
 */
async function resolveContext(): Promise<{
  userId: string;
  workspaceId: string;
  roleSlug: WorkspaceRole | string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in');
  }

  const cookieStore = await cookies();
  let workspaceId = cookieStore.get('workspace_id')?.value ?? null;

  // Fallback to first membership when the cookie is unset (e.g. first request
  // after login, before the workspace switcher writes it).
  if (!workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = membership?.workspace_id ?? null;
  }

  if (!workspaceId) {
    throw new Error('No workspace for current user');
  }

  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberErr || !member) {
    throw new Error('Not a member of this workspace');
  }

  return {
    userId: user.id,
    workspaceId,
    roleSlug: (member.role ?? 'member') as WorkspaceRole,
  };
}

// ─── Defaults ───────────────────────────────────────────────────────────────

/**
 * Returns the seeded default card list for the caller, filtered to what they
 * can actually see. Preserves the hand-curated spec order.
 */
async function seededDefaultsFor(
  workspaceId: string,
  roleSlug: string,
): Promise<string[]> {
  const caps = await userCapabilities(workspaceId);
  const persona = personaForWorkspaceRole(roleSlug as WorkspaceRole);
  const visibleIds = new Set(
    getRoleDefaults(caps, persona).map((m) => m.id),
  );
  // Preserve ROLE_DEFAULTS order; drop anything the viewer can't see.
  return ROLE_DEFAULTS[persona].filter((id) => visibleIds.has(id));
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Returns the caller's persisted Lobby layout, or seeded defaults if no row
 * exists for the current (user, workspace, role) triple.
 */
export async function getLobbyLayout(): Promise<LobbyLayout> {
  const { userId, workspaceId, roleSlug } = await resolveContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_lobby_layout')
    .select('card_ids')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('role_slug', roleSlug)
    .maybeSingle();

  if (error) {
    // Failing closed to defaults is safer than blanking the Lobby on a
    // transient DB hiccup.
    const cardIds = await seededDefaultsFor(workspaceId, roleSlug);
    return { cardIds, isDefault: true, roleSlug, workspaceId };
  }

  if (!data) {
    const cardIds = await seededDefaultsFor(workspaceId, roleSlug);
    return { cardIds, isDefault: true, roleSlug, workspaceId };
  }

  return {
    cardIds: data.card_ids ?? [],
    isDefault: false,
    roleSlug,
    workspaceId,
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Persists a new card ordering for the caller. Validates:
 *   1. Every ID exists in METRICS.
 *   2. The caller holds every `requiredCapabilities` entry for each card.
 *   3. Length ≤ LOBBY_CARD_CAP.
 *   4. No duplicate IDs.
 * Throws on any failure. Returns the resolved layout on success.
 */
export async function saveLobbyLayout(
  cardIds: string[],
): Promise<LobbyLayout> {
  if (!Array.isArray(cardIds)) {
    throw new Error('cardIds must be an array');
  }
  if (cardIds.length > LOBBY_CARD_CAP) {
    throw new Error(`At most ${LOBBY_CARD_CAP} cards allowed on the lobby`);
  }

  const seen = new Set<string>();
  for (const id of cardIds) {
    if (seen.has(id)) {
      throw new Error(`Duplicate card: ${id}`);
    }
    seen.add(id);
  }

  const unknown = cardIds.filter((id) => !METRICS[id]);
  if (unknown.length > 0) {
    throw new Error(`Unknown metric ids: ${unknown.join(', ')}`);
  }

  const { userId, workspaceId, roleSlug } = await resolveContext();

  // Capability gate — fast-fail so a user can never save a layout referencing
  // a card they can't see. The underlying widget RLS still guards the data.
  const caps = await userCapabilities(workspaceId);
  const missing: string[] = [];
  for (const id of cardIds) {
    const def = METRICS[id];
    for (const cap of def.requiredCapabilities) {
      if (!caps.has(cap)) {
        missing.push(`${id} (needs ${cap})`);
        break;
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing capability for: ${missing.join(', ')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_lobby_layout')
    .upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        role_slug: roleSlug,
        card_ids: cardIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,workspace_id,role_slug' },
    );

  if (error) {
    throw new Error(`Could not save layout: ${error.message}`);
  }

  return {
    cardIds,
    isDefault: false,
    roleSlug,
    workspaceId,
  };
}

/**
 * Deletes the caller's persisted layout so the Lobby falls back to seeded
 * defaults on the next load. Returns the defaults the caller will now see.
 */
export async function resetLobbyLayout(): Promise<LobbyLayout> {
  const { userId, workspaceId, roleSlug } = await resolveContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from('user_lobby_layout')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('role_slug', roleSlug);

  if (error) {
    throw new Error(`Could not reset layout: ${error.message}`);
  }

  const cardIds = await seededDefaultsFor(workspaceId, roleSlug);
  return { cardIds, isDefault: true, roleSlug, workspaceId };
}
