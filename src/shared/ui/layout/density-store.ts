/**
 * Display density state — persisted to localStorage.
 * Three tiers: spacious (warm, generous), balanced (default), dense (instrument).
 * Density controls presentation only — never permission or feature access.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DensityTier = 'spacious' | 'balanced' | 'dense';

interface DensityState {
  density: DensityTier;
  setDensity: (d: DensityTier) => void;
}

export const useDensityStore = create<DensityState>()(
  persist(
    (set) => ({
      density: 'balanced',
      setDensity: (density) => set({ density }),
    }),
    { name: 'unusonic_density' }
  )
);
