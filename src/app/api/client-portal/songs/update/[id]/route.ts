/**
 * Client portal Songs — POST /api/client-portal/songs/update/[id]
 *
 * Narrow update on an existing couple-added entry. The `[id]` route
 * segment is the `entryId`. All mutable fields come in the JSON body;
 * any field omitted is left unchanged server-side (the RPC treats
 * nulls as "leave alone").
 *
 * See Songs design doc §8.2 and §5.2.
 *
 * @module app/api/client-portal/songs/update/[id]
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientPortalContext, getRequestIp } from '@/shared/lib/client-portal/context';
import { updateSongRequest } from '@/shared/lib/client-portal/song-request-helpers';
import { respondFromMutation } from '@/shared/lib/client-portal/song-response-helpers';

const ClientSongTierSchema = z.enum([
  'must_play',
  'play_if_possible',
  'do_not_play',
  'special_moment',
]);

const SpecialMomentLabelSchema = z.enum([
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

const UpdateSongBodySchema = z.object({
  eventId: z.string().uuid(),
  tier: ClientSongTierSchema.optional(),
  notes: z.string().max(500).optional(),
  requestedByLabel: z.string().max(80).nullable().optional(),
  specialMomentLabel: SpecialMomentLabelSchema.nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id: entryId } = await params;

  if (!entryId || !/^[0-9a-f-]{36}$/i.test(entryId)) {
    return NextResponse.json({ ok: false, reason: 'invalid_entry_id' }, { status: 400 });
  }

  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) {
    return NextResponse.json({ ok: false, reason: 'not_authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  const parsed = UpdateSongBodySchema.safeParse(body);
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

  const result = await updateSongRequest(
    {
      entityId: context.activeEntity.id,
      workspaceId: context.activeEntity.ownerWorkspaceId,
      eventId: input.eventId,
      requestId,
      ip,
      userAgent,
    },
    {
      entryId,
      tier: input.tier,
      notes: input.notes,
      requestedByLabel: input.requestedByLabel ?? null,
      specialMomentLabel: input.specialMomentLabel ?? null,
    },
  );

  return respondFromMutation(result);
}
