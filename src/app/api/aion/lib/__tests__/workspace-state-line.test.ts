/**
 * Workspace state-line compose tests (design doc §3.2).
 *
 * Pure-function tests for composeStateLine — the DB-dependent
 * resolveWorkspaceStateLine stays untested at unit level (its RLS path is
 * covered by integration tests when they land). The compose function is
 * where the grammar discipline lives: zero-content facts, singular/plural
 * handling, no exclamation marks.
 */

import { describe, it, expect } from 'vitest';
import { composeStateLine } from '../workspace-state-line';

describe('composeStateLine', () => {
  it('singular deals and shows use singular grammar', () => {
    expect(composeStateLine(1, 1)).toBe('1 deal live, 1 show in the next two weeks.');
  });

  it('plural deals use plural grammar', () => {
    expect(composeStateLine(3, 0)).toBe('3 deals live.');
  });

  it('plural shows use plural grammar', () => {
    expect(composeStateLine(0, 2)).toBe('2 shows in the next two weeks.');
  });

  it('mixed singular + plural', () => {
    expect(composeStateLine(1, 3)).toBe('1 deal live, 3 shows in the next two weeks.');
    expect(composeStateLine(4, 1)).toBe('4 deals live, 1 show in the next two weeks.');
  });

  it('ends with period, never exclamation', () => {
    for (const [d, s] of [[1, 0], [2, 1], [5, 3], [1, 1]] as Array<[number, number]>) {
      const line = composeStateLine(d, s);
      expect(line.endsWith('.')).toBe(true);
      expect(line.includes('!')).toBe(false);
    }
  });

  it('does not editorialize — no gentle framing', () => {
    const forbidden = ['quiet', 'busy', 'fire', 'heavy', 'light', 'slow', 'hot'];
    const samples = [[1, 0], [10, 5], [20, 1]].map(([d, s]) => composeStateLine(d, s));
    for (const line of samples) {
      for (const word of forbidden) {
        expect(line.toLowerCase()).not.toContain(word);
      }
    }
  });
});
