import 'server-only';

/**
 * Server fetcher for the Lobby "Your pins" widget. Wraps the pin-actions
 * `listPins` server action so the Lobby page can `await` it directly in a
 * Server Component without re-implementing context resolution.
 *
 * Feature-flag gating is delegated: `listPins` throws if the
 * `reports.aion_pin` flag is off. Callers swallow the error and render zero
 * pins, keeping the Lobby always renderable.
 *
 * @module widgets/pinned-answers/api/get-pinned-answers
 */

import {
  listPins,
  listPinHealth,
  type LobbyPin,
} from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

export async function getPinnedAnswers(): Promise<LobbyPin[]> {
  try {
    const [pins, healthMap] = await Promise.all([
      listPins(),
      // Phase 5.3: health is best-effort — a failure here must not blank the
      // pins section. Swallow + return empty map so cards still render.
      listPinHealth().catch(() => ({} as Record<string, LobbyPin['health']>)),
    ]);
    return pins.map((p) => ({ ...p, health: healthMap[p.pinId] ?? undefined }));
  } catch {
    // Flag-off / auth-miss / workspace-miss — all collapse to zero pins.
    return [];
  }
}
