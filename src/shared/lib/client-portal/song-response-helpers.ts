/**
 * Client portal Songs — HTTP response mapping helper.
 *
 * Extracted from `src/app/api/client-portal/songs/add/route.ts` because
 * Next.js 16 enforces that route files may only export recognized route
 * fields (HTTP method handlers, `GET` / `POST` / `config` / etc.). Any
 * additional export causes a strict type-check failure at build time.
 *
 * Translates a `SongMutationResult<T>` (returned by `addSongRequest`,
 * `updateSongRequest`, `deleteSongRequest` in `song-request-helpers.ts`)
 * into a typed `NextResponse`. Status code policy:
 *
 * - `ok`               → 200 `{ ok: true, data }`
 * - `step_up_required` → status from `stepUpRequiredResponse(denial)`
 * - `rate_limited`     → 429 with `Retry-After` header
 * - `rpc_rejected`, reason mapping:
 *     `not_my_event` | `not_found`                              → 404
 *     `show_live` | `completed` | `cancelled` | `archived` | `too_many` → 409
 *     everything else (invalid_tier, invalid_title, etc.)       → 400
 *
 * @module shared/lib/client-portal/song-response-helpers
 */
import 'server-only';

import { NextResponse } from 'next/server';

import type { SongMutationResult } from './song-request-helpers';
import { stepUpRequiredResponse } from './step-up';

export function respondFromMutation<T>(
  result: SongMutationResult<T>,
): NextResponse {
  if (result.kind === 'ok') {
    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  if (result.kind === 'step_up_required') {
    const body = stepUpRequiredResponse(result.denial);
    return NextResponse.json(body.body, { status: body.status });
  }

  if (result.kind === 'rate_limited') {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      },
    );
  }

  // rpc_rejected — map the reason to a status code
  const reason = result.reason;
  let status = 400;
  if (reason === 'not_my_event' || reason === 'not_found') {
    status = 404;
  } else if (
    reason === 'show_live' ||
    reason === 'completed' ||
    reason === 'cancelled' ||
    reason === 'archived' ||
    reason === 'too_many'
  ) {
    status = 409;
  }
  return NextResponse.json({ ok: false, reason }, { status });
}
