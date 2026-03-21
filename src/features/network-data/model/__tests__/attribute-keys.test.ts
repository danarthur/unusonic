/**
 * Unit tests for entity attribute key contract and accessor behaviour.
 *
 * Tests cover:
 *   - No duplicate values within a namespace
 *   - All values are non-empty strings
 *   - readEntityAttrs returns correct shape for known input
 *   - Boolean flags default to false when absent
 *   - String fields are undefined when absent
 *   - toIONContext strips sentinel keys
 *   - toIONContext strips wifi_credentials from venue_ops sub-object
 */

import { describe, it, expect } from 'vitest';
import {
  PERSON_ATTR,
  COMPANY_ATTR,
  VENUE_ATTR,
  VENUE_OPS,
  INDIVIDUAL_ATTR,
  COUPLE_ATTR,
} from '@/features/network-data/model/attribute-keys';
import { readEntityAttrs, toIONContext } from '@/shared/lib/entity-attrs';

// ─── 1. No duplicate values within a namespace ────────────────────────────────

describe('No duplicate values within a namespace', () => {
  it('PERSON_ATTR has no duplicate values', () => {
    const values = Object.values(PERSON_ATTR);
    expect(values.length).toBe(new Set(values).size);
  });

  it('COMPANY_ATTR has no duplicate values', () => {
    const values = Object.values(COMPANY_ATTR);
    expect(values.length).toBe(new Set(values).size);
  });

  it('VENUE_ATTR has no duplicate values', () => {
    const values = Object.values(VENUE_ATTR);
    expect(values.length).toBe(new Set(values).size);
  });

  it('VENUE_OPS has no duplicate values', () => {
    const values = Object.values(VENUE_OPS);
    expect(values.length).toBe(new Set(values).size);
  });

  it('INDIVIDUAL_ATTR has no duplicate values', () => {
    const values = Object.values(INDIVIDUAL_ATTR);
    expect(values.length).toBe(new Set(values).size);
  });

  it('COUPLE_ATTR has no duplicate values', () => {
    const values = Object.values(COUPLE_ATTR);
    expect(values.length).toBe(new Set(values).size);
  });
});

// ─── 2. All values are non-empty strings ─────────────────────────────────────

describe('All attribute key values are non-empty strings', () => {
  const namespaces = [
    ['PERSON_ATTR', PERSON_ATTR],
    ['COMPANY_ATTR', COMPANY_ATTR],
    ['VENUE_ATTR', VENUE_ATTR],
    ['VENUE_OPS', VENUE_OPS],
    ['INDIVIDUAL_ATTR', INDIVIDUAL_ATTR],
    ['COUPLE_ATTR', COUPLE_ATTR],
  ] as const;

  for (const [name, ns] of namespaces) {
    it(`${name} — every value is a non-empty string`, () => {
      const values = Object.values(ns) as unknown[];
      expect(values.every((v) => typeof v === 'string' && (v as string).length > 0)).toBe(true);
    });
  }
});

// ─── 3. readEntityAttrs returns correct shape for known input ─────────────────

describe('readEntityAttrs — correct shape for known input', () => {
  it('person: known keys are present, unknown keys are dropped', () => {
    const result = readEntityAttrs(
      { email: 'test@test.com', cdl: true, unknown_key: 'ignored' },
      'person'
    );
    expect(result.email).toBe('test@test.com');
    expect(result.cdl).toBe(true);
    expect('unknown_key' in result).toBe(false);
  });

  it('company: boolean flags and string fields', () => {
    const result = readEntityAttrs({ is_ghost: true, category: 'vendor' }, 'company');
    expect(result.is_ghost).toBe(true);
    expect(result.category).toBe('vendor');
  });

  it('venue: venue_type and capacity', () => {
    const result = readEntityAttrs({ venue_type: 'theater', capacity: 500 }, 'venue');
    expect(result.venue_type).toBe('theater');
    expect(result.capacity).toBe(500);
  });

  it('individual: first_name and last_name', () => {
    const result = readEntityAttrs({ first_name: 'Jane', last_name: 'Smith' }, 'individual');
    expect(result.first_name).toBe('Jane');
  });

  it('couple: partner_a_first_name and partner_b_first_name', () => {
    const result = readEntityAttrs(
      { partner_a_first_name: 'Jane', partner_b_first_name: 'Bob' },
      'couple'
    );
    // COUPLE_ATTR.partner_a_first = 'partner_a_first_name' — schema key is the value
    expect(result.partner_a_first_name).toBe('Jane');
  });
});

// ─── 4. Boolean flags default to false when absent ───────────────────────────

describe('readEntityAttrs — boolean flags default to false when absent', () => {
  it('person: cdl defaults to false', () => {
    const result = readEntityAttrs({}, 'person');
    expect(result.cdl).toBe(false);
  });

  it('person: w9_status defaults to false', () => {
    const result = readEntityAttrs({}, 'person');
    expect(result.w9_status).toBe(false);
  });
});

// ─── 5. String fields are undefined when absent ───────────────────────────────

describe('readEntityAttrs — string fields are undefined when absent', () => {
  it('person: email is undefined when absent', () => {
    const result = readEntityAttrs({}, 'person');
    expect(result.email).toBeUndefined();
  });

  it('person: phone is undefined when absent', () => {
    const result = readEntityAttrs({}, 'person');
    expect(result.phone).toBeUndefined();
  });
});

// ─── 6. toIONContext strips sentinel keys ─────────────────────────────────────

describe('toIONContext — sentinel keys are stripped', () => {
  it('strips is_ghost (truthy) and retains non-sentinel fields', () => {
    // is_ghost: true would be emitted as "true" if the sentinel check were absent.
    // This test proves the sentinel path fires on truthy values.
    const result = toIONContext({ email: 'a@b.com', is_ghost: true }, 'person');
    expect('email' in result).toBe(true);
    expect('is_ghost' in result).toBe(false);
  });

  it('strips is_claimed (falsy boolean) — sentinel fires before falsy skip', () => {
    const result = toIONContext({ email: 'a@b.com', is_claimed: false }, 'person');
    expect('email' in result).toBe(true);
    expect('is_claimed' in result).toBe(false);
  });

  it('strips created_by_org_id from raw unknown keys (Step 2 path)', () => {
    // created_by_org_id is not in PersonAttrsSchema — it reaches Step 2 (Object.entries(raw))
    const result = toIONContext({ email: 'a@b.com', created_by_org_id: 'some-uuid' }, 'person');
    expect('created_by_org_id' in result).toBe(false);
  });
});

// ─── 7. toIONContext strips wifi_credentials from venue_ops sub-object ────────

describe('toIONContext — wifi_credentials stripped from venue_ops sub-object', () => {
  it('does not include wifi password in stringified venue_ops value', () => {
    const result = toIONContext(
      { venue_ops: { parking_notes: 'rear lot', wifi_credentials: 'password123' } },
      'venue'
    );
    const venueOpsValue = result['venue_ops'];
    // venue_ops should be present (parking_notes is there)
    expect(venueOpsValue).toBeDefined();
    // but the password must not appear anywhere in the serialised value
    expect(venueOpsValue).not.toContain('password123');
  });
});
