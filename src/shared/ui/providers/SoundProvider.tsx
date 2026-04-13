'use client';

import { useEffect, type ReactNode } from 'react';
import { SoundEngine } from '@/shared/lib/sound/sound-engine';
import { useSoundStore } from '@/shared/lib/sound/sound-store';

/**
 * Syncs sound store preferences to the SoundEngine.
 * Place once in the dashboard layout alongside DensitySync.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const enabled = useSoundStore((s) => s.enabled);
  const volume = useSoundStore((s) => s.volume);

  useEffect(() => {
    SoundEngine.setVolume(enabled ? volume : 0);
  }, [enabled, volume]);

  return <>{children}</>;
}
