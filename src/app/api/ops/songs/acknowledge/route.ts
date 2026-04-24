/**
 * DJ-side Songs — POST /api/ops/songs/acknowledge
 *
 * DJ staff acknowledges a couple's song request, optionally tagging
 * it with a whitelisted moment label that flows back to the couple
 * as "Priya added this to dinner" etc. This is the lightweight
 * alternative to `/api/ops/songs/promote` — no moment assignment,
 * no storage move, just a `acknowledged_at` / `acknowledged_moment_label`
 * stamp.
 *
 * See Songs design doc §0 A2 (the "no silent ghosting" invariant)
 * and the `ops_songs_acknowledge_client_request` RPC from slice 6.
 *
 * @module app/api/ops/songs/acknowledge
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/shared/api/supabase/server';
import { logAccess } from '@/shared/lib/client-portal/audit';
import { getRequestIp } from '@/shared/lib/client-portal/context';

const MomentLabelSchema = z.enum([
  'first_dance',
  'parent_dance_1',
  'parent_dance_2',
  'processional',
  'recessional',
  'last_dance',
  'entrance',
  'dinner',
  'cake_cut',
  'dance_floor',
  'other',
]);

const AcknowledgeBodySchema = z.object({
  eventId: z.string().uuid(),
  entryId: z.string().uuid(),
  momentLabel: MomentLabelSchema.nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'not_authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  const parsed = AcknowledgeBodySchema.safeParse(body);
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

  // --- Read event (cross-workspace protection via staff RLS) ---
   
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

  // --- Call the RPC as authenticated ---
   
  const { data, error } = await supabase.rpc('ops_songs_acknowledge_client_request', {
    p_event_id: input.eventId,
    p_entry_id: input.entryId,
    p_moment_label: input.momentLabel ?? null,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row || row.ok === false) {
    const reason = error?.message ?? row?.reason ?? 'unknown_error';
    await logAccess({
      entityId: eventRow.client_entity_id ?? user.id,
      workspaceId: eventRow.workspace_id,
      resourceType: 'song_request',
      resourceId: input.entryId,
      action: 'song_acknowledge',
      actorKind: 'workspace_staff',
      actorId: user.id,
      authMethod: null,
      outcome: error ? 'error' : 'denied',
      requestId,
      ip,
      userAgent,
      metadata: { reason, moment_label: input.momentLabel ?? null },
    });

    const status = reason === 'not_workspace_member'
      ? 403
      : reason === 'not_found' || reason === 'event_not_found'
      ? 404
      : reason === 'invalid_moment_label'
      ? 400
      : 400;
    return NextResponse.json({ ok: false, reason }, { status });
  }

  await logAccess({
    entityId: eventRow.client_entity_id ?? user.id,
    workspaceId: eventRow.workspace_id,
    resourceType: 'song_request',
    resourceId: input.entryId,
    action: 'song_acknowledge',
    actorKind: 'workspace_staff',
    actorId: user.id,
    authMethod: null,
    outcome: 'success',
    requestId,
    ip,
    userAgent,
    metadata: { moment_label: input.momentLabel ?? null },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
