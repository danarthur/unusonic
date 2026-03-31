'use client';

import { useEffect } from 'react';
import { useDensityStore } from './density-store';

/**
 * Syncs the density tier to the document root as a data attribute.
 * All Stage Engineering CSS custom properties resolve via [data-density="..."].
 * Render once in the dashboard layout.
 */
export function DensitySync() {
  const density = useDensityStore((s) => s.density);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    return () => {
      document.documentElement.removeAttribute('data-density');
    };
  }, [density]);

  return null;
}
