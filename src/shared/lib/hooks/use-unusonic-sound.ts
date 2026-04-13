import { useCallback } from 'react';
import { SoundEngine } from '@/shared/lib/sound/sound-engine';
import { useSoundStore } from '@/shared/lib/sound/sound-store';
import { SOUND_CATEGORY, type SoundName } from '@/shared/lib/sound/sounds';

/**
 * Play a sound from the Unusonic palette.
 *
 * Returns a stable callback that respects the user's sound preferences
 * (master toggle, Studio Mode, per-category toggles).
 *
 * Usage:
 *   const playConfirm = useUnusonicSound('confirm');
 *   // later, on interaction:
 *   playConfirm();
 */
export function useUnusonicSound(name: SoundName) {
  const enabled = useSoundStore((s) => s.enabled);
  const studioMode = useSoundStore((s) => s.studioMode);
  const categoryEnabled = useSoundStore((s) => s.categories[SOUND_CATEGORY[name]]);

  return useCallback(() => {
    if (!enabled) return;
    if (studioMode && name !== 'alert') return;
    if (!categoryEnabled) return;
    SoundEngine.play(name);
  }, [enabled, studioMode, categoryEnabled, name]);
}
