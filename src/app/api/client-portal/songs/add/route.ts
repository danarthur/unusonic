/**
 * Client portal Songs — POST /api/client-portal/songs/add
 *
 * The couple's "add a song" mutation endpoint. Wraps the full pipeline:
 *
 *   1. Resolve client portal session context (cookie → entity)
 *   2. Zod-validate the request body
 *   3. Delegate to addSongRequest() which itself runs
 *      requireStepUp → checkRateLimit → RPC → logAccess
 *   4. Map SongMutationResult to an HTTP response
 *
 * Step-up is enforced inside addSongRequest (not here) because the
 * helper is the single source of truth for the prelude ordering. The
 * route handler's job is purely:
 *   (a) reject unauthenticated sessions with 401
 *   (b) parse + validate input
 *   (c) translate helper result → HTTP status code
 *
 * See Songs design doc §8.1.
 *
 * @module app/api/client-portal/songs/add
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientPortalContext, getRequestIp } from '@/shared/lib/client-portal/context';
import { addSongRequest } from '@/shared/lib/client-portal/song-request-helpers';
import { respondFromMutation } from '@/shared/lib/client-portal/song-response-helpers';

/* ── Zod body schema ────────────────────────────────────────────── */

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

const AddSongBodySchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(''),
  tier: ClientSongTierSchema,
  notes: z.string().max(500).optional(),
  specialMomentLabel: SpecialMomentLabelSchema.nullable().optional(),
  requestedByLabel: z.string().max(80).nullable().optional(),
  // Streaming metadata from the SongSearch result (all optional)
  spotifyId: z.string().nullable().optional(),
  appleMusicId: z.string().nullable().optional(),
  isrc: z.string().nullable().optional(),
  artworkUrl: z.string().url().nullable().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
});

/* ── Handler ─────────────────────────────────────────────────────── */
// Note: `respondFromMutation` previously lived here and was re-exported across
// the delete/update route handlers. Moved to `song-response-helpers.ts` because
// Next.js 16 rejects non-route-field exports from route files at build time.

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const parsed = AddSongBodySchema.safeParse(body);
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

  const result = await addSongRequest(
    {
      entityId: context.activeEntity.id,
      workspaceId: context.activeEntity.ownerWorkspaceId,
      eventId: input.eventId,
      requestId,
      ip,
      userAgent,
    },
    {
      title: input.title,
      artist: input.artist,
      tier: input.tier,
      notes: input.notes,
      specialMomentLabel: input.specialMomentLabel ?? null,
      requestedByLabel: input.requestedByLabel ?? null,
      spotifyId: input.spotifyId ?? null,
      appleMusicId: input.appleMusicId ?? null,
      isrc: input.isrc ?? null,
      artworkUrl: input.artworkUrl ?? null,
      durationMs: input.durationMs ?? null,
      previewUrl: input.previewUrl ?? null,
    },
  );

  return respondFromMutation(result);
}
