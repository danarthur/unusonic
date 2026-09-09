/**
 * A spoken venue fact fills a gap, re-dates a match, and never overwrites.
 */
import { describe, it, expect } from 'vitest';
import { decideVenueFact } from '../venue-facts';

describe('decideVenueFact', () => {
  it('skips a fact that was not spoken', () => {
    expect(decideVenueFact(null, 'through the kitchen')).toBe('skip');
    expect(decideVenueFact(undefined, null)).toBe('skip');
    expect(decideVenueFact('   ', null)).toBe('skip');
  });

  it('fills when nothing is on file', () => {
    expect(decideVenueFact('through the kitchen', null)).toBe('fill');
    expect(decideVenueFact('through the kitchen', '')).toBe('fill');
    expect(decideVenueFact(250, undefined)).toBe('fill');
  });

  // The date is the point: a venue fact with no date is one you cannot act on.
  it('re-dates a fact that matches what is already recorded', () => {
    expect(decideVenueFact('through the kitchen', 'through the kitchen')).toBe('confirm');
    expect(decideVenueFact('  through the kitchen  ', 'through the kitchen')).toBe('confirm');
  });

  // Sending someone to the wrong dock on a misheard sentence is worse than
  // missing an update, so a contradiction is left for a deliberate edit.
  it('refuses to overwrite a fact that contradicts the record', () => {
    expect(decideVenueFact('off the alley', 'through the kitchen')).toBe('skip');
    expect(decideVenueFact(300, 250)).toBe('skip');
  });
});
