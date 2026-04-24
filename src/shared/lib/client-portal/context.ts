/**
 * Client portal context resolution.
 *
 * Reads the session cookie (and/or the Supabase auth cookie for claimed
 * clients) and returns the current portal context. Called from the
 * (client-portal) layout and any route handler that needs to know who's
 * on the other end of the request.
 *
 * Three possible states:
 *   - 'claimed'    — auth.users session, multi-entity-capable
 *   - 'anonymous'  — cookie-only session, single-entity ghost
 *   - 'none'       — no session; caller should redirect to /sign-in or 401
 *
 * See client-portal-design.md §15.3.
 *
 * @module shared/lib/client-portal/context
 */
import 'server-only';

import { headers as nextHeaders } from 'next/headers';
import { createHash } from 'node:crypto';

import { cookies } from 'next/headers';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/shared/lib/constants';

import { readSessionCookie, readStepUpCookie } from './cookies';

export type ClientPortalContextKind = 'claimed' | 'anonymous' | 'none';

export type ClientPortalEntitySummary = {
  id: string;
  displayName: string;
  ownerWorkspaceId: string;
  type: string;
};

export type ClientPortalContext = {
  kind: ClientPortalContextKind;
  /** The auth.users id if this is a claimed session, else null. */
  userId: string | null;
  /** All entities this user (or anonymous session) can access. */
  entities: ClientPortalEntitySummary[];
  /** The current "working" entity — first in the list for anonymous, or last selected for claimed. */
  activeEntity: ClientPortalEntitySummary | null;
  /** If present and > now(), the client has completed step-up within the cached window. */
  stepUpVerifiedUntil: Date | null;
  /** Which mechanism was used for the step-up (for future passkey-required gates). */
  stepUpMethod: 'otp' | 'passkey' | null;
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Resolve the current client portal context from cookies.
 *
 * Priority:
 *   1. If Supabase auth cookie is present AND user has claimed entities → 'claimed'
 *   2. Else if session cookie is present AND maps to a live, unrevoked token → 'anonymous'
 *   3. Else → 'none'
 *
 * Does NOT rotate the session token — that's done by readers/mutators on
 * demand via rotateClientPortalSession (separate helper).
 */
export async function getClientPortalContext(): Promise<ClientPortalContext> {
  const stepUp = await readStepUpCookie();

  // --- Path 1: claimed client via Supabase auth cookie ---
  const authedClient = await createClient();
  const { data: authData } = await authedClient.auth.getUser();
  const user = authData?.user ?? null;

  if (user) {
    const system = getSystemClient();
    // Cross-schema query — directory schema isn't in the generated Database
    // type's public surface, so cast to any (matches pattern in get-public-event.ts).
     
    const crossSchema = system;
    const { data: entities, error } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('id, display_name, owner_workspace_id, type')
      .eq('claimed_by_user_id', user.id);

    type EntityRow = {
      id: string;
      display_name: string;
      owner_workspace_id: string;
      type: string;
    };

    if (!error && Array.isArray(entities) && entities.length > 0) {
      const mapped: ClientPortalEntitySummary[] = (entities as EntityRow[]).map((e) => ({
        id: e.id,
        displayName: e.display_name,
        ownerWorkspaceId: e.owner_workspace_id,
        type: e.type,
      }));

      // Workspace-aware: if the active workspace cookie is set, scope to
      // entities belonging to that workspace. Falls back to all entities
      // (backwards compatible for users without the cookie).
      const cookieStore = await cookies();
      const activeWsId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;
      const scoped = activeWsId
        ? mapped.filter((e) => e.ownerWorkspaceId === activeWsId)
        : mapped;
      // If the active workspace has no matching entities, fall back to all
      const resolved = scoped.length > 0 ? scoped : mapped;

      return {
        kind: 'claimed',
        userId: user.id,
        entities: mapped,
        activeEntity: resolved[0] ?? null,
        stepUpVerifiedUntil: stepUp?.stepUpUntil ?? null,
        stepUpMethod: stepUp?.stepUpMethod ?? null,
      };
    }
  }

  // --- Path 2: anonymous cookie session ---
  const rawToken = await readSessionCookie();
  if (rawToken) {
    const system = getSystemClient();
    const tokenHash = hashToken(rawToken);

    const { data: tokenRow, error: tokenErr } = await system
      .from('client_portal_tokens')
      .select('id, entity_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle();

    if (!tokenErr && tokenRow && new Date(tokenRow.expires_at).getTime() > Date.now()) {
       
      const crossSchema = system;
      const { data: entity } = await crossSchema
        .schema('directory')
        .from('entities')
        .select('id, display_name, owner_workspace_id, type')
        .eq('id', tokenRow.entity_id)
        .maybeSingle();

      type EntityRow = {
        id: string;
        display_name: string;
        owner_workspace_id: string;
        type: string;
      };

      if (entity) {
        const e = entity as EntityRow;
        const summary: ClientPortalEntitySummary = {
          id: e.id,
          displayName: e.display_name,
          ownerWorkspaceId: e.owner_workspace_id,
          type: e.type,
        };
        return {
          kind: 'anonymous',
          userId: null,
          entities: [summary],
          activeEntity: summary,
          stepUpVerifiedUntil: stepUp?.stepUpUntil ?? null,
          stepUpMethod: stepUp?.stepUpMethod ?? null,
        };
      }
    }
  }

  // --- Path 3: no session ---
  return {
    kind: 'none',
    userId: null,
    entities: [],
    activeEntity: null,
    stepUpVerifiedUntil: null,
    stepUpMethod: null,
  };
}

/**
 * Extracts the client IP from request headers.
 * Prefers x-forwarded-for (first entry), falls back to x-real-ip.
 * Returns null if neither is present (dev SSR without a proxy).
 */
export async function getRequestIp(): Promise<string | null> {
  const h = await nextHeaders();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return h.get('x-real-ip');
}
