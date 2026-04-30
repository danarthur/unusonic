'use client';

/**
 * Shared types + small helpers for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - parseAndFormatTime — natural-language time parsing for moment time inputs.
 *   - energyLightness — achromatic OKLCH lightness for energy stripes.
 *   - MomentTemplate type + TIMELINE_TEMPLATES + STARTER_TEMPLATES.
 *   - templateToTimeline — convert a built-in archetype template to a
 *     ProgramTimeline with fresh UUIDs.
 */

import type { ProgramTimeline } from '@/features/ops/lib/dj-prep-schema';

/** Parses a natural-language time string into a normalized "h:MM AM/PM" form. */
export function parseAndFormatTime(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  let ampmHint: 'am' | 'pm' | null = null;
  let cleaned = s;
  if (/[ap]m?$/.test(cleaned)) {
    ampmHint = cleaned.includes('p') ? 'pm' : 'am';
    cleaned = cleaned.replace(/[ap]m?$/, '');
  }
  let hours: number;
  let minutes: number;
  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
  } else if (/^\d{4}$/.test(cleaned)) {
    hours = parseInt(cleaned.slice(0, 2), 10);
    minutes = parseInt(cleaned.slice(2), 10);
  } else if (/^\d{3}$/.test(cleaned)) {
    hours = parseInt(cleaned[0], 10);
    minutes = parseInt(cleaned.slice(1), 10);
  } else if (/^\d{1,2}$/.test(cleaned)) {
    hours = parseInt(cleaned, 10);
    minutes = 0;
  } else {
    return '';
  }
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) return '';
  if (hours === 0 && !ampmHint) { hours = 12; ampmHint = 'am'; }
  else if (hours > 12) { hours -= 12; ampmHint = ampmHint ?? 'pm'; }
  else if (hours === 12) { ampmHint = ampmHint ?? 'pm'; }
  else { ampmHint = ampmHint ?? (hours >= 7 && hours <= 11 ? 'am' : 'pm'); }
  if (hours < 1 || hours > 12) return '';
  return `${hours}:${String(minutes).padStart(2, '0')} ${ampmHint.toUpperCase()}`;
}

/** Returns an achromatic OKLCH lightness value for the energy stripe (1=dim, 10=bright) */
export function energyLightness(energy: number | null): string {
  if (energy == null) return 'oklch(0.20 0 0)';
  const l = 0.15 + (energy / 10) * 0.7; // 0.15 → 0.85
  return `oklch(${l.toFixed(2)} 0 0)`;
}

export type MomentTemplate = { label: string; energy: number | null };

export const TIMELINE_TEMPLATES: Record<string, MomentTemplate[]> = {
  wedding: [
    { label: 'Cocktail hour', energy: 4 },
    { label: 'Guest seating', energy: 3 },
    { label: 'Grand entrance', energy: 7 },
    { label: 'First dance', energy: 6 },
    { label: 'Dinner', energy: 3 },
    { label: 'Toasts', energy: 2 },
    { label: 'Open dancing', energy: 8 },
    { label: 'Last dance', energy: 5 },
  ],
  corporate: [
    { label: 'Pre-event / networking', energy: 4 },
    { label: 'Welcome and introductions', energy: 5 },
    { label: 'Keynote / presentations', energy: 3 },
    { label: 'Dinner', energy: 3 },
    { label: 'Awards / recognition', energy: 6 },
    { label: 'Dancing / entertainment', energy: 8 },
    { label: 'Wrap', energy: 4 },
  ],
  concert: [
    { label: 'Doors open', energy: 4 },
    { label: 'Opening act', energy: 6 },
    { label: 'Changeover', energy: 3 },
    { label: 'Headliner', energy: 9 },
    { label: 'Encore', energy: 10 },
    { label: 'House music / exit', energy: 4 },
  ],
  festival: [
    { label: 'Gates open', energy: 5 },
    { label: 'Set 1', energy: 6 },
    { label: 'Set 2', energy: 7 },
    { label: 'Set 3', energy: 8 },
    { label: 'Headliner', energy: 10 },
    { label: 'Closing set', energy: 6 },
  ],
  private: [
    { label: 'Arrival / welcome', energy: 4 },
    { label: 'Dinner', energy: 3 },
    { label: 'Entertainment', energy: 7 },
    { label: 'Dancing', energy: 8 },
    { label: 'Wind down', energy: 4 },
  ],
  conference: [
    { label: 'Registration / coffee', energy: 3 },
    { label: 'Opening remarks', energy: 5 },
    { label: 'Breakout sessions', energy: 4 },
    { label: 'Lunch', energy: 3 },
    { label: 'Afternoon sessions', energy: 4 },
    { label: 'Networking reception', energy: 6 },
    { label: 'Closing', energy: 4 },
  ],
};

/** Convert a built-in archetype template to a ProgramTimeline with fresh UUIDs. */
export function templateToTimeline(name: string, template: MomentTemplate[], sortOrder: number): ProgramTimeline {
  return {
    id: crypto.randomUUID(),
    name,
    sort_order: sortOrder,
    moments: template.map((t, i) => ({
      id: crypto.randomUUID(),
      label: t.label,
      time: '',
      notes: '',
      announcement: '',
      energy: t.energy,
      sort_order: i,
    })),
  };
}

/** Built-in starter templates exposed in the template picker. */
export const STARTER_TEMPLATES: { key: string; label: string }[] = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'concert', label: 'Concert' },
  { key: 'festival', label: 'Festival' },
  { key: 'private', label: 'Private party' },
  { key: 'conference', label: 'Conference' },
];
