/**
 * Client portal song request mutation wrappers.
 *
 * Thin server-only helpers that wrap the three `client_songs_*` SECURITY
 * DEFINER RPCs with the full client-portal mutation pipeline:
 *
 *   1. `requireStepUp()` — gates every mutation behind a fresh OTP/passkey
 *      step-up. Also slides the 30-minute window forward on success
 *      (slice 4), so a couple building a 20-song list in one sitting sees
 *      at most one OTP prompt.
 *   2. `checkRateLimit('song_request_entity', entityId)` — caps per-entity
 *      mutations at 150/day (§0 A7). Failure-closed on DB errors.
 *   3. RPC call via `getSystemClient()` as service_role.
 *   4. `logAccess()` — every mutation, success OR denial, gets an audit
 *      row tagged with the dedicated `song_*` action enum (slice 8).
 *
 * Route handlers (slice 10) import these helpers and translate the
 * structured result into an HTTP response. The helpers never throw for
 * business-logic failures — callers branch on `result.kind`.
 *
 * See Songs design doc §7.2 (the pipeline spec) and §14 (step-up
 * enforcement test contract).
 *
 * @module shared/lib/client-portal/song-request-helpers
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

import { logAccess, type ClientPortalAction } from './audit';
import { checkRateLimit } from './rate-limit';
import { requireStepUp, type StepUpDenial } from './step-up';
import type {
  SpecialMomentLabel,
  ClientSongTier,
} from '@/shared/types/song-tiers';

/* ── Result shape ────────────────────────────────────────────────── */

/**
 * Normalized result type returned by every helper in this module.
 *
 * Route handlers switch on `kind` to produce the right HTTP status:
 *
 *   - `ok` → 200 with `data`
 *   - `step_up_required` → 401 with `stepUpRequiredResponse(denial)` body
 *   - `rate_limited` → 429 with `Retry-After: retryAfterSeconds`
 *   - `rpc_rejected` → 400/409 depending on reason (mapped in the route)
 *
 * This type is exported so route handlers in slice 10 can import the
 * same discriminated union and get exhaustive switch coverage.
 */
export type SongMutationResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'step_up_required'; denial: StepUpDenial }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'rpc_rejected'; reason: string };

/* ── Common context ──────────────────────────────────────────────── */

/**
 * Caller-supplied context. The helpers do NOT call `getClientPortalContext()`
 * themselves — that lookup is the route handler's job (because a route
 * handler also needs to reject with 401 if the context is `'none'` before
 * any mutation-path work). The helpers take the resolved entity + workspace
 * as explicit arguments so they stay pure-ish.
 */
export type SongRequestContext = {
  entityId: string;
  workspaceId: string;
  eventId: string;
  /** Optional opaque request id for audit correlation (from x-request-id header). */
  requestId?: string | null;
  /** Optional client IP (from x-forwarded-for). */
  ip?: string | null;
  /** Optional user agent. */
  userAgent?: string | null;
};

/* ── Input shapes ───────────────────────────────────────────────── */

export type AddSongRequestInput = {
  title: string;
  artist: string;
  tier: ClientSongTier;
  notes?: string;
  specialMomentLabel?: SpecialMomentLabel | null;
  requestedByLabel?: string | null;
  spotifyId?: string | null;
  appleMusicId?: string | null;
  isrc?: string | null;
  artworkUrl?: string | null;
  durationMs?: number | null;
  previewUrl?: string | null;
};

export type AddSongRequestData = {
  entryId: string;
  requestedAt: string;
};

export type UpdateSongRequestInput = {
  entryId: string;
  tier?: ClientSongTier;
  notes?: string;
  requestedByLabel?: string | null;
  specialMomentLabel?: SpecialMomentLabel | null;
};

export type DeleteSongRequestInput = {
  entryId: string;
};

/* ── Shared pipeline ─────────────────────────────────────────────── */

/**
 * Run the step-up + rate-limit prelude shared by all three mutation
 * helpers. On any rejection, writes a denial audit row and returns the
 * structured result. On approval, returns `null` so the caller can
 * continue to the RPC call.
 */
async function runPrelude(
  ctx: SongRequestContext,
  action: ClientPortalAction,
): Promise<Exclude<SongMutationResult<never>, { kind: 'ok' }> | null> {
  // Step 1: step-up gate. This also slides the 30-minute window forward
  // on success (slice 4), so rapid successive mutations don't re-prompt.
  const stepUp = await requireStepUp();
  if (!stepUp.ok) {
    await logAccess({
      entityId: ctx.entityId,
      workspaceId: ctx.workspaceId,
      resourceType: 'song_request',
      action,
      actorKind: 'magic_link_session',
      authMethod: 'session_cookie',
      outcome: 'denied',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'step_up_required', step_up_reason: stepUp.reason },
    });
    return { kind: 'step_up_required', denial: stepUp };
  }

  // Step 2: rate limit per entity. 150/day cap (§0 A7).
  const rate = await checkRateLimit('song_request_entity', ctx.entityId);
  if (!rate.allowed) {
    await logAccess({
      entityId: ctx.entityId,
      workspaceId: ctx.workspaceId,
      resourceType: 'song_request',
      action,
      actorKind: 'magic_link_session',
      authMethod: 'session_cookie',
      outcome: 'throttled',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'rate_limited', retry_after_seconds: rate.retryAfterSeconds },
    });
    return { kind: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds };
  }

  return null;
}

/* ── addSongRequest ─────────────────────────────────────────────── */

/**
 * Append a new song request. See client_songs_add_request RPC for the
 * full validation contract. Returns the server-stamped `entryId` and
 * `requestedAt` on success.
 */
export async function addSongRequest(
  ctx: SongRequestContext,
  input: AddSongRequestInput,
): Promise<SongMutationResult<AddSongRequestData>> {
  const prelude = await runPrelude(ctx, 'song_add');
  if (prelude) return prelude;

  // RPC name cast: the generated Database type was last regenerated
  // before slice 5 landed the client_songs_* RPCs. Re-running db:types
  // after every slice is impractical; casting to any for these RPC
  // calls is the documented pattern (see context.ts, resolve-deal-contact.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSystemClient() as any;
  const { data, error } = await supabase.rpc('client_songs_add_request', {
    p_entity_id: ctx.entityId,
    p_event_id: ctx.eventId,
    p_title: input.title,
    p_artist: input.artist,
    p_tier: input.tier,
    p_notes: input.notes ?? '',
    p_special_moment_label: input.specialMomentLabel ?? null,
    p_spotify_id: input.spotifyId ?? null,
    p_apple_music_id: input.appleMusicId ?? null,
    p_isrc: input.isrc ?? null,
    p_artwork_url: input.artworkUrl ?? null,
    p_duration_ms: input.durationMs ?? null,
    p_preview_url: input.previewUrl ?? null,
    p_requested_by_label: input.requestedByLabel ?? null,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row || row.ok === false) {
    const reason = error?.message ?? row?.reason ?? 'unknown_error';
    await logAccess({
      entityId: ctx.entityId,
      workspaceId: ctx.workspaceId,
      resourceType: 'song_request',
      action: 'song_add',
      actorKind: 'magic_link_session',
      authMethod: 'session_cookie',
      outcome: error ? 'error' : 'denied',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason, tier: input.tier },
    });
    return { kind: 'rpc_rejected', reason };
  }

  await logAccess({
    entityId: ctx.entityId,
    workspaceId: ctx.workspaceId,
    resourceType: 'song_request',
    resourceId: row.entry_id ?? null,
    action: 'song_add',
    actorKind: 'magic_link_session',
    authMethod: 'session_cookie',
    outcome: 'success',
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { tier: input.tier },
  });

  return {
    kind: 'ok',
    data: {
      entryId: row.entry_id as string,
      requestedAt: row.requested_at as string,
    },
  };
}

/* ── updateSongRequest ──────────────────────────────────────────── */

/**
 * Narrow update on an existing couple entry. See client_songs_update_request
 * for the immutable-field contract — only tier, notes, requested_by_label,
 * and special_moment_label are mutable. Attempts to touch other fields
 * via this helper are impossible because the RPC signature doesn't accept
 * them.
 */
export async function updateSongRequest(
  ctx: SongRequestContext,
  input: UpdateSongRequestInput,
): Promise<SongMutationResult<{ entryId: string }>> {
  const prelude = await runPrelude(ctx, 'song_update');
  if (prelude) return prelude;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSystemClient() as any;
  const { data, error } = await supabase.rpc('client_songs_update_request', {
    p_entity_id: ctx.entityId,
    p_event_id: ctx.eventId,
    p_entry_id: input.entryId,
    p_tier: input.tier ?? null,
    p_notes: input.notes ?? null,
    p_requested_by_label: input.requestedByLabel ?? null,
    p_special_moment_label: input.specialMomentLabel ?? null,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row || row.ok === false) {
    const reason = error?.message ?? row?.reason ?? 'unknown_error';
    await logAccess({
      entityId: ctx.entityId,
      workspaceId: ctx.workspaceId,
      resourceType: 'song_request',
      resourceId: input.entryId,
      action: 'song_update',
      actorKind: 'magic_link_session',
      authMethod: 'session_cookie',
      outcome: error ? 'error' : 'denied',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason, tier: input.tier ?? null },
    });
    return { kind: 'rpc_rejected', reason };
  }

  await logAccess({
    entityId: ctx.entityId,
    workspaceId: ctx.workspaceId,
    resourceType: 'song_request',
    resourceId: input.entryId,
    action: 'song_update',
    actorKind: 'magic_link_session',
    authMethod: 'session_cookie',
    outcome: 'success',
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { tier: input.tier ?? null },
  });

  return { kind: 'ok', data: { entryId: input.entryId } };
}

/* ── deleteSongRequest ──────────────────────────────────────────── */

export async function deleteSongRequest(
  ctx: SongRequestContext,
  input: DeleteSongRequestInput,
): Promise<SongMutationResult<{ entryId: string }>> {
  const prelude = await runPrelude(ctx, 'song_delete');
  if (prelude) return prelude;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSystemClient() as any;
  const { data, error } = await supabase.rpc('client_songs_delete_request', {
    p_entity_id: ctx.entityId,
    p_event_id: ctx.eventId,
    p_entry_id: input.entryId,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row || row.ok === false) {
    const reason = error?.message ?? row?.reason ?? 'unknown_error';
    await logAccess({
      entityId: ctx.entityId,
      workspaceId: ctx.workspaceId,
      resourceType: 'song_request',
      resourceId: input.entryId,
      action: 'song_delete',
      actorKind: 'magic_link_session',
      authMethod: 'session_cookie',
      outcome: error ? 'error' : 'denied',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason },
    });
    return { kind: 'rpc_rejected', reason };
  }

  await logAccess({
    entityId: ctx.entityId,
    workspaceId: ctx.workspaceId,
    resourceType: 'song_request',
    resourceId: input.entryId,
    action: 'song_delete',
    actorKind: 'magic_link_session',
    authMethod: 'session_cookie',
    outcome: 'success',
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { kind: 'ok', data: { entryId: input.entryId } };
}
