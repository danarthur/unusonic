import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP,
  defaultDaysToFirstFollowup,
  normalizeCadenceArchetype,
} from '../cadence-defaults';

describe('cadence-defaults — normalization', () => {
  it('recognizes the three canonical archetypes (case-insensitive)', () => {
    expect(normalizeCadenceArchetype('wedding')).toBe('wedding');
    expect(normalizeCadenceArchetype('WEDDING')).toBe('wedding');
    expect(normalizeCadenceArchetype('Corporate')).toBe('corporate');
    expect(normalizeCadenceArchetype('tour')).toBe('tour');
  });

  it('falls back to "other" for NULL, empty, and unknown', () => {
    expect(normalizeCadenceArchetype(null)).toBe('other');
    expect(normalizeCadenceArchetype(undefined)).toBe('other');
    expect(normalizeCadenceArchetype('')).toBe('other');
    expect(normalizeCadenceArchetype('festival')).toBe('other');
    expect(normalizeCadenceArchetype('private_party')).toBe('other');
  });
});

describe('cadence-defaults — cold-start defaults', () => {
  it('wedding = 5d, corporate = 2d, tour = 7d, other = 4d (per design doc §20.10)', () => {
    expect(DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP.wedding).toBe(5);
    expect(DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP.corporate).toBe(2);
    expect(DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP.tour).toBe(7);
    expect(DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP.other).toBe(4);
  });

  it('defaultDaysToFirstFollowup normalizes then looks up', () => {
    expect(defaultDaysToFirstFollowup('wedding')).toBe(5);
    expect(defaultDaysToFirstFollowup('WEDDING')).toBe(5);
    expect(defaultDaysToFirstFollowup(null)).toBe(4);
    expect(defaultDaysToFirstFollowup('private_party')).toBe(4);
  });
});
