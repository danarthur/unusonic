/**
 * DJ-side Songs — POST /api/ops/songs/promote
 *
 * DJ staff promotes a couple-added song request from
 * `client_song_requests` into `dj_song_pool`. Authentication is the
 * standard Next.js server auth cookie (workspace_members session),
 * NOT a client portal session. No step-up required — staff are
 * already authenticated via the staff dashboard pipeline.
 *
 * Internal workspace-membership check lives inside the RPC body
 * (`is_workspace_member(workspace_id)` — see slice 6 migration), so
 * a workspace A member can't tamper with workspace B events even
 * though the `authenticated` role has blanket EXECUTE on the
 * function.
 *
 * Audit trail: the mutation lands in `client_portal_access_log` with
 * `resource_type = 'song_request'`, `action = 'song_promote'`,
 * `actor_kind = 'workspace_staff'`. Same table as the couple-side
 * mutations so incident response gets a unified view of everything
 * that touched a particular couple's song list.
 *
 * See Songs design doc §8 + §0 A3 for the race-fix rationale.
 *
 * @module app/api/ops/songs/promote
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/shared/api/supabase/server';
import { logAccess } from '@/shared/lib/client-portal/audit';
import { getRequestIp } from '@/shared/lib/client-portal/context';

const PromoteBodySchema = z.object({
  eventId: z.string().uuid(),
  entryId: z.string().uuid(),
  tier: z.enum(['cued', 'must_play', 'play_if_possible', 'do_not_play', 'special_moment']),
  assignedMomentId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Staff auth check ---
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'not_authenticated' }, { status: 401 });
  }

  // --- Body validation ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  const parsed = PromoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const ip = await getRequestIp();
  const userAgent = req.headers.get('user-agent');
  const requestId = req.headers.get('x-request-id');

  // --- Resolve the event's workspace + client entity for audit scoping ---
  // We read the event as the authenticated user — RLS will block any
  // cross-workspace read, giving us a second line of defense before the
  // RPC's internal is_workspace_member() check.
   
  const crossSchema = supabase;
  const { data: eventRow } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, workspace_id, client_entity_id')
    .eq('id', input.eventId)
    .maybeSingle();

  if (!eventRow) {
    return NextResponse.json({ ok: false, reason: 'event_not_found' }, { status: 404 });
  }

  // --- Call the RPC as authenticated (uses the staff JWT, not service_role) ---
   
  const { data, error } = await supabase.rpc('ops_songs_promote_client_request', {
    p_event_id: input.eventId,
    p_entry_id: input.entryId,
    p_tier: input.tier,
    p_assigned_moment_id: input.assignedMomentId ?? null,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row || row.ok === false) {
    const reason = error?.message ?? row?.reason ?? 'unknown_error';
    await logAccess({
      entityId: eventRow.client_entity_id ?? user.id,
      workspaceId: eventRow.workspace_id,
      resourceType: 'song_request',
      resourceId: input.entryId,
      action: 'song_promote',
      actorKind: 'workspace_staff',
      actorId: user.id,
      authMethod: null,
      outcome: error ? 'error' : 'denied',
      requestId,
      ip,
      userAgent,
      metadata: { reason, tier: input.tier, assigned_moment_id: input.assignedMomentId ?? null },
    });

    const status = reason === 'not_workspace_member'
      ? 403
      : reason === 'not_found' || reason === 'event_not_found'
      ? 404
      : reason === 'invalid_tier'
      ? 400
      : 400;
    return NextResponse.json({ ok: false, reason }, { status });
  }

  await logAccess({
    entityId: eventRow.client_entity_id ?? user.id,
    workspaceId: eventRow.workspace_id,
    resourceType: 'song_request',
    resourceId: input.entryId,
    action: 'song_promote',
    actorKind: 'workspace_staff',
    actorId: user.id,
    authMethod: null,
    outcome: 'success',
    requestId,
    ip,
    userAgent,
    metadata: { tier: input.tier, assigned_moment_id: input.assignedMomentId ?? null },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
