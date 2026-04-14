/**
 * Portal Theme catalog — UI-facing labels and ordering for the theme picker.
 *
 * @module shared/lib/portal-theme/catalog
 */

import type { PortalThemePreset } from './types';

/** All available preset names (excludes 'custom'). */
export const PORTAL_THEME_PRESETS: PortalThemePreset[] = [
  'paper',
  'clean',
  'blackout',
  'editorial',
  'civic',
  'linen',
  'poster',
  'terminal',
  'marquee',
  'broadcast',
  'gallery',
  'custom',
];

/** Human-readable labels for the theme picker UI. */
export const PORTAL_THEME_LABELS: Record<PortalThemePreset, string> = {
  paper: 'Paper',
  clean: 'Clean',
  blackout: 'Blackout',
  editorial: 'Editorial',
  civic: 'Civic',
  linen: 'Linen',
  poster: 'Poster',
  terminal: 'Terminal',
  marquee: 'Marquee',
  broadcast: 'Broadcast',
  gallery: 'Gallery',
  custom: 'Custom',
};

/** One-line descriptions for the theme picker. */
export const PORTAL_THEME_DESCRIPTIONS: Record<PortalThemePreset, string> = {
  paper: 'Warm white paper, near-black ink. Works for everyone.',
  clean: 'Pure white, zero radius, zero shadow. Typography does the work.',
  blackout: 'Deep cool dark. Technical precision for production companies.',
  editorial: 'Bold type, thick dividers. Magazine spread confidence.',
  civic: 'Blue-gray tint, teal accent. Trustworthy and institutional.',
  linen: 'Serif headings, cream tones. Luxury stationery feel.',
  poster: 'Black borders, offset shadows. Bold and graphic.',
  terminal: 'Monospace headings, green-gray. Compact and data-dense.',
  marquee: 'Dark warm charcoal, gold accent. Theatrical grandeur.',
  broadcast: 'Ultra-bold, ultra-compact. High energy, no-nonsense.',
  gallery: 'Ultra-light type, vast spacing. Maximum restraint.',
  custom: 'Start from Paper, customize everything.',
};
