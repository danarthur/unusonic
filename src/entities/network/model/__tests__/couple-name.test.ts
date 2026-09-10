/**
 * Naming two people as one client.
 *
 * The rule existed twice — in the create-show modal and in its cast summary —
 * which is how two copies start disagreeing. These lock the behaviour both had,
 * plus the cases neither handled.
 */

import { describe, it, expect } from 'vitest';
import { coupleDisplayName, splitDisplayName } from '../couple-name';

describe('coupleDisplayName', () => {
  it('says a shared surname once', () => {
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: 'Okafor' },
      { firstName: 'Marcus', lastName: 'Okafor' },
    )).toBe('Jane & Marcus Okafor');
  });

  it('says both surnames when they differ', () => {
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: 'Okafor' },
      { firstName: 'Marcus', lastName: 'Bell' },
    )).toBe('Jane Okafor & Marcus Bell');
  });

  it('treats a shared surname as shared whatever its case', () => {
    // "OKAFOR" and "Okafor" are one family, not two.
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: 'OKAFOR' },
      { firstName: 'Marcus', lastName: 'Okafor' },
    )).toBe('Jane & Marcus OKAFOR');
  });

  it('manages when only one of them has a surname', () => {
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: 'Okafor' },
      { firstName: 'Marcus', lastName: '' },
    )).toBe('Jane Okafor & Marcus');
  });

  it('manages when only one of them is named at all', () => {
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: 'Okafor' },
      { firstName: '', lastName: '' },
    )).toBe('Jane Okafor');
  });

  it('gives back nothing rather than a pair of surnames', () => {
    // Two last names with no first names is not a name anyone recognises, and
    // '' lets the caller fall back to whatever it would have shown anyway.
    expect(coupleDisplayName({ lastName: 'Okafor' }, { lastName: 'Bell' })).toBe('');
  });

  it('tolerates nulls from the database', () => {
    expect(coupleDisplayName(
      { firstName: 'Jane', lastName: null },
      { firstName: null, lastName: null },
    )).toBe('Jane');
  });
});

describe('splitDisplayName', () => {
  it('keeps a two-word given name together', () => {
    // Splitting on the FIRST space would make this "Mary" of the "Jane Okafor"
    // family, which is nobody.
    expect(splitDisplayName('Mary Jane Okafor')).toEqual({
      firstName: 'Mary Jane',
      lastName: 'Okafor',
    });
  });

  it('reads a single word as a first name', () => {
    expect(splitDisplayName('Prince')).toEqual({ firstName: 'Prince', lastName: '' });
  });

  it('survives an empty name', () => {
    expect(splitDisplayName(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('round-trips a derived couple name back to its parts', () => {
    const a = splitDisplayName('Jane Okafor');
    const b = splitDisplayName('Marcus Okafor');
    expect(coupleDisplayName(a, b)).toBe('Jane & Marcus Okafor');
  });
});
