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
  type LobbyPin,
} from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

export async function getPinnedAnswers(): Promise<LobbyPin[]> {
  try {
    return await listPins();
  } catch {
    // Flag-off / auth-miss / workspace-miss — all collapse to zero pins.
    return [];
  }
}
