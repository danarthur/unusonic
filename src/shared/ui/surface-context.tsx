'use client';

import { createContext, useContext } from 'react';

/**
 * Surface levels — ordered from deepest (nested) to highest (raised).
 * Numeric values enable relative math: "parent - 2" for input wells, "parent + 1" for cards.
 */
export const SURFACE_LEVEL = {
  nested: 0,
  void: 1,
  surface: 2,
  elevated: 3,
  raised: 4,
} as const;

export type SurfaceLevelName = keyof typeof SURFACE_LEVEL;
export type SurfaceLevelValue = (typeof SURFACE_LEVEL)[SurfaceLevelName];

/** Reverse lookup: numeric value → name string (for data-surface attribute). */
const LEVEL_NAME: Record<SurfaceLevelValue, SurfaceLevelName> = {
  0: 'nested',
  1: 'void',
  2: 'surface',
  3: 'elevated',
  4: 'raised',
};

// ── Context ──────────────────────────────────────────────────────────────────

const SurfaceContext = createContext<SurfaceLevelValue>(SURFACE_LEVEL.void);

export function SurfaceProvider({
  level,
  children,
}: {
  level: SurfaceLevelValue;
  children: React.ReactNode;
}) {
  return (
    <SurfaceContext.Provider value={level}>{children}</SurfaceContext.Provider>
  );
}

/** Returns the current surface level set by the nearest SurfaceProvider. */
export function useSurface(): SurfaceLevelValue {
  return useContext(SurfaceContext);
}

// ── Relative resolution helpers ──────────────────────────────────────────────

/**
 * Resolve a child role to the correct surface level name, relative to `parent`.
 *
 * Rules (from design-philosophy-and-styling.md):
 *  - well:     parent - 2  (min: nested/0)  — form input receptacles
 *  - card:     parent + 1  (max: raised/4)   — child cards inside panels
 *  - dropdown: always raised/4               — floating above everything
 */
export function resolveChild(
  parent: SurfaceLevelValue,
  role: 'well' | 'card' | 'dropdown',
): SurfaceLevelName {
  switch (role) {
    case 'well':
      return LEVEL_NAME[Math.max(0, parent - 2) as SurfaceLevelValue];
    case 'card':
      return LEVEL_NAME[Math.min(4, parent + 1) as SurfaceLevelValue];
    case 'dropdown':
      return 'raised';
  }
}

/** Get the data-surface attribute name for a numeric level. */
export function surfaceName(level: SurfaceLevelValue): SurfaceLevelName {
  return LEVEL_NAME[level];
}
