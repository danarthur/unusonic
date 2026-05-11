/**
 * Unit tests for normalizeHumanName.
 *
 * The helper is render-only — it never touches the DB. These tests
 * lock in the conservative behaviour: fix obvious mid-word capital
 * slips like "SIncere", leave compound names ("McDonald", "O'Brien",
 * "van der") and ordinary single-leading-cap tokens alone.
 */

import { describe, it, expect } from 'vitest';

import { normalizeHumanName } from '../normalize-human-name';

describe('normalizeHumanName — null-safety', () => {
  it('returns empty string for null', () => {
    expect(normalizeHumanName(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(normalizeHumanName(undefined)).toBe('');
  });
  it('returns empty string for whitespace-only', () => {
    expect(normalizeHumanName('   ')).toBe('');
  });
});

describe('normalizeHumanName — single-token names', () => {
  it('leaves a normal single-leading-cap word alone', () => {
    expect(normalizeHumanName('Mike')).toBe('Mike');
  });
  it('title-cases a mid-word capital slip', () => {
    expect(normalizeHumanName('SIncere')).toBe('Sincere');
  });
  it('title-cases an all-caps token', () => {
    expect(normalizeHumanName('JESSICA')).toBe('Jessica');
  });
  it('title-cases an all-lowercase token', () => {
    expect(normalizeHumanName('jessica')).toBe('Jessica');
  });
});

describe('normalizeHumanName — multi-token names', () => {
  it('handles the audit case (Mike SIncere)', () => {
    expect(normalizeHumanName('Mike SIncere')).toBe('Mike Sincere');
  });
  it('preserves Mc/Mac compounds', () => {
    expect(normalizeHumanName('Ronald McDonald')).toBe('Ronald McDonald');
    expect(normalizeHumanName('Iain MacArthur')).toBe('Iain MacArthur');
  });
  it("preserves O'/D' apostrophe compounds", () => {
    expect(normalizeHumanName("Conor O'Brien")).toBe("Conor O'Brien");
    expect(normalizeHumanName("Sofia D'Angelo")).toBe("Sofia D'Angelo");
  });
  it('preserves lowercase Dutch/Romance particles after the first token', () => {
    expect(normalizeHumanName('Hans van der Berg')).toBe('Hans van der Berg');
    expect(normalizeHumanName('Maria de la Cruz')).toBe('Maria de la Cruz');
  });
  it('does not treat a leading particle as lowercase', () => {
    expect(normalizeHumanName('Della Smith')).toBe('Della Smith');
  });
  it('handles hyphenated last names', () => {
    expect(normalizeHumanName('Anne Smith-Jones')).toBe('Anne Smith-Jones');
    expect(normalizeHumanName('Anne smith-jones')).toBe('Anne Smith-Jones');
  });
  it('collapses repeated whitespace between tokens', () => {
    expect(normalizeHumanName('Mike    Sincere')).toBe('Mike Sincere');
  });
  it('upper-cases initial-only single-letter tokens', () => {
    expect(normalizeHumanName('John F kennedy')).toBe('John F Kennedy');
  });
});

describe('normalizeHumanName — idempotency', () => {
  it('is stable on already-clean input', () => {
    const inputs = [
      'Mike Sincere',
      'Ronald McDonald',
      "Conor O'Brien",
      'Hans van der Berg',
      'Anne Smith-Jones',
    ];
    for (const input of inputs) {
      expect(normalizeHumanName(normalizeHumanName(input))).toBe(input);
    }
  });
});
