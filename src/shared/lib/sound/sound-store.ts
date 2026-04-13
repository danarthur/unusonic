import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SoundCategory } from './sounds';

interface SoundState {
  /** Master toggle — sounds are OFF by default */
  enabled: boolean;
  /** Master volume (0-1) */
  volume: number;
  /** Studio Mode: suppress all sounds except 'alert' */
  studioMode: boolean;
  /** Per-category toggles */
  categories: Record<SoundCategory, boolean>;

  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setStudioMode: (studioMode: boolean) => void;
  setCategoryEnabled: (category: SoundCategory, enabled: boolean) => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: false,
      volume: 0.5,
      studioMode: false,
      categories: {
        interaction: true,
        notification: true,
        ambient: true,
        aion: true,
      },

      setEnabled: (enabled) => set({ enabled }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setStudioMode: (studioMode) => set({ studioMode }),
      setCategoryEnabled: (category, enabled) =>
        set((state) => ({
          categories: { ...state.categories, [category]: enabled },
        })),
    }),
    { name: 'unusonic_sound' }
  )
);
