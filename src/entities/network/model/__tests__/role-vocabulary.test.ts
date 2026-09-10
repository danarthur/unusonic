/**
 * Role vocabulary — controlled, multi-value, pack-aware.
 *
 * Regression risk this guards: `roleGroup: jobTitle` was free text, so grouping
 * over it would split one role into "DJ" / "dj" / "DJ/MC" / "Disc Jockey".
 */

import { describe, it, expect } from 'vitest';
import {
  roleSeedsFor,
  normalizeRoleLabel,
  ROLE_SEEDS,
} from '../role-vocabulary';

describe('role seeds', () => {
  it('gives an agency and a production company different starting roles', () => {
    const agency = roleSeedsFor('talent').map((r) => r.slug);
    const production = roleSeedsFor('crew').map((r) => r.slug);
    expect(agency).toContain('dj');
    expect(agency).toContain('mc');
    expect(production).toContain('audio');
    expect(production).toContain('rigging');
    expect(production).not.toContain('dj');
  });

  it('falls back to the neutral set for an unknown pack', () => {
    // @ts-expect-error — deliberately passing a pack that does not exist.
    expect(roleSeedsFor('squad').length).toBeGreaterThan(0);
  });

  it('has unique slugs and non-empty labels in every seed set', () => {
    for (const seeds of Object.values(ROLE_SEEDS)) {
      const slugs = seeds.map((s) => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const s of seeds) expect(s.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeRoleLabel', () => {
  it('collapses the variants that would otherwise become separate groups', () => {
    // The exact fragmentation free-text job titles produce.
    expect(normalizeRoleLabel('DJ')).toBe('dj');
    expect(normalizeRoleLabel('dj')).toBe('dj');
    expect(normalizeRoleLabel('  Dj  ')).toBe('dj');
    expect(normalizeRoleLabel('DJ/MC')).toBe('dj_mc');
    expect(normalizeRoleLabel('Photo Booth')).toBe('photo_booth');
    expect(normalizeRoleLabel('photo-booth')).toBe('photo_booth');
  });

  it('strips punctuation and emoji rather than encoding them in a slug', () => {
    expect(normalizeRoleLabel('🎧 DJ!')).toBe('dj');
    expect(normalizeRoleLabel('A1 (audio)')).toBe('a1_audio');
  });

  it('returns empty for input with nothing usable', () => {
    expect(normalizeRoleLabel('   ')).toBe('');
    expect(normalizeRoleLabel('!!!')).toBe('');
  });
});
