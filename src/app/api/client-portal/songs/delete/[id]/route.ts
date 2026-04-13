/**
 * Client portal Songs — POST /api/client-portal/songs/delete/[id]
 *
 * Removes a couple-added entry from client_song_requests. Uses POST
 * (not DELETE) to match the rest of the `/api/client-portal/songs/*`
 * shape and keep the step-up pipeline identical across all three
 * mutation endpoints. DELETE with a body is messy in fetch and some
 * proxies strip bodies on DELETE — POST-with-path-param is the
 * friendlier pattern for this codebase.
 *
 * See Songs design doc §8.3 and §5.3.
 *
 * @module app/api/client-portal/songs/delete/[id]
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientPortalContext, getRequestIp } from '@/shared/lib/client-portal/context';
import { deleteSongRequest } from '@/shared/lib/client-portal/song-request-helpers';
import { respondFromMutation } from '@/shared/lib/client-portal/song-response-helpers';

const DeleteSongBodySchema = z.object({
  eventId: z.string().uuid(),
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

  const parsed = DeleteSongBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ip = await getRequestIp();
  const userAgent = req.headers.get('user-agent');
  const requestId = req.headers.get('x-request-id');

  const result = await deleteSongRequest(
    {
      entityId: context.activeEntity.id,
      workspaceId: context.activeEntity.ownerWorkspaceId,
      eventId: parsed.data.eventId,
      requestId,
      ip,
      userAgent,
    },
    { entryId },
  );

  return respondFromMutation(result);
}
