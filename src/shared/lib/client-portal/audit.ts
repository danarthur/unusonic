/**
 * Client portal audit log writer.
 *
 * Thin wrapper around the client_log_access RPC. Keeps the insert path
 * centralized so route handlers never construct audit rows directly.
 *
 * See client-portal-design.md §14.1, §14.6 (retention invariant).
 *
 * @module shared/lib/client-portal/audit
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { Json } from '@/types/supabase';

export type ClientPortalResource =
  | 'proposal'
  | 'invoice'
  | 'event'
  | 'portal_home'
  | 'document'
  | 'aion_query'
  | 'sign_in'
  | 'session'
  // Songs resource type (added 2026-04-10, client portal Songs slice).
  // Covers both the couple-side add/update/delete path and the DJ-side
  // acknowledge/promote path. Same resource — two sides of the workflow.
  | 'song_request';

export type ClientPortalAction =
  | 'view'
  | 'sign'
  | 'pay'
  | 'download'
  | 'message'
  | 'aion_response'
  | 'claim_entity'
  | 'session_revoke'
  | 'otp_issue'
  | 'otp_verify'
  | 'magic_link_issue'
  | 'passkey_register'
  | 'passkey_auth'
  // Songs actions (added 2026-04-10, client portal Songs slice).
  //
  // The original design doc §7.2 first-pass suggested using 'message' as
  // the action string for all song mutations, but that loses fidelity
  // for audit queries ("show me every add/delete/promote in the last
  // 30 days for this entity" becomes a JSONB metadata grep). Dedicated
  // actions are cheap and give us clean Resend alerting + dashboard
  // filters out of the box.
  //
  // Couple side (called from client_songs_* route handlers):
  | 'song_add'         // couple added a new request
  | 'song_update'      // couple edited tier / notes / author label
  | 'song_delete'      // couple removed a request
  // DJ / staff side (called from ops_songs_* route handlers):
  | 'song_acknowledge' // DJ stamped acknowledged_at + optional label
  | 'song_promote';    // DJ moved from client_song_requests to dj_song_pool

export type ClientPortalActorKind =
  | 'anonymous_token'
  | 'magic_link_session'
  | 'claimed_user'
  | 'service_role'
  // Staff side (added 2026-04-10, Songs slice). A workspace_members user
  // authenticated via the staff dashboard invoking an ops_songs_* RPC on
  // behalf of a client's song_request resource. The audit row still
  // targets the CLIENT's entity_id (the resource subject) — `actor_id`
  // carries the staff user's auth.uid().
  | 'workspace_staff';

export type ClientPortalAuthMethod =
  | 'magic_link'
  | 'otp'
  | 'passkey'
  | 'session_cookie'
  | 'service_role';

export type ClientPortalOutcome =
  | 'success'
  | 'denied'
  | 'throttled'
  | 'error'
  | 'session_device_drift';

export type LogAccessInput = {
  sessionId?: string | null;
  requestId?: string | null;
  entityId: string;
  workspaceId: string;
  resourceType: ClientPortalResource;
  resourceId?: string | null;
  action: ClientPortalAction;
  actorKind: ClientPortalActorKind;
  actorId?: string | null;
  authMethod?: ClientPortalAuthMethod | null;
  outcome: ClientPortalOutcome;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Write one row to client_portal_access_log. Never throws — audit writes must
 * not break the user-facing request path. Errors are logged to the server
 * console and swallowed.
 */
export async function logAccess(input: LogAccessInput): Promise<void> {
  const supabase = getSystemClient();

  const { error } = await supabase.rpc('client_log_access', {
    p_entity_id: input.entityId,
    p_workspace_id: input.workspaceId,
    p_resource_type: input.resourceType,
    p_action: input.action,
    p_actor_kind: input.actorKind,
    p_outcome: input.outcome,
    p_session_id: input.sessionId ?? undefined,
    p_request_id: input.requestId ?? undefined,
    p_resource_id: input.resourceId ?? undefined,
    p_actor_id: input.actorId ?? undefined,
    p_auth_method: input.authMethod ?? undefined,
    p_ip: input.ip ?? undefined,
    p_user_agent: input.userAgent ?? undefined,
    p_metadata: (input.metadata ?? {}) as Json,
  });

  if (error) {
    // Never throw from audit writes — don't break the user's request on a log failure.
    // eslint-disable-next-line no-console
    console.error('[client-portal/audit] logAccess failed', {
      code: error.code,
      message: error.message,
      entity: input.entityId,
      action: input.action,
    });
  }
}
