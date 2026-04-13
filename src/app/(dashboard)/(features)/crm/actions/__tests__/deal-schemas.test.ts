/**
 * Unit tests for createDealSchema — imported from the real source to prevent drift.
 */
import { describe, it, expect } from 'vitest';
import { createDealSchema } from '../deal-model';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('createDealSchema', () => {
  it('accepts minimal valid input (proposedDate only)', () => {
    const result = createDealSchema.safeParse({ proposedDate: '2026-04-07' });
    expect(result.success).toBe(true);
  });

  describe('proposedDate format', () => {
    it('accepts yyyy-MM-dd', () => {
      expect(createDealSchema.safeParse({ proposedDate: '2026-04-07' }).success).toBe(true);
    });

    it.each([
      ['slash separator', '2026/04/07'],
      ['US format', '04-07-2026'],
      ['no leading zeros', '2026-4-7'],
      ['empty string', ''],
    ])('rejects %s (%s)', (_label, date) => {
      expect(createDealSchema.safeParse({ proposedDate: date }).success).toBe(false);
    });
  });

  describe('time fields (eventStartTime / eventEndTime)', () => {
    it.each(['14:30', '00:00', '23:59'])('accepts %s', (time) => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01', eventStartTime: time });
      expect(r.success).toBe(true);
    });

    // Note: the regex only validates format (two digits : two digits), not semantic ranges.
    // '25:00' and '14:60' pass the regex — that's by design (no range check in schema).
    it.each([
      ['single-digit hour', '2:30'],
      ['word', 'noon'],
    ])('rejects %s (%s)', (_label, time) => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01', eventStartTime: time });
      expect(r.success).toBe(false);
    });

    it('accepts null', () => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01', eventStartTime: null });
      expect(r.success).toBe(true);
    });
  });

  describe('clientType enum', () => {
    it('defaults to company', () => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.clientType).toBe('company');
    });

    it.each(['individual', 'couple'] as const)('accepts %s', (ct) => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01', clientType: ct });
      expect(r.success).toBe(true);
    });

    it('rejects invalid value', () => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01', clientType: 'llc' });
      expect(r.success).toBe(false);
    });
  });

  describe('status enum', () => {
    it('defaults to inquiry', () => {
      const r = createDealSchema.safeParse({ proposedDate: '2026-01-01' });
      if (r.success) expect(r.data.status).toBe('inquiry');
    });

    it.each(['inquiry', 'proposal', 'contract_sent', 'won', 'lost'] as const)(
      'accepts %s',
      (s) => {
        expect(
          createDealSchema.safeParse({ proposedDate: '2026-01-01', status: s }).success
        ).toBe(true);
      }
    );

    it('rejects invalid status', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', status: 'pending' }).success
      ).toBe(false);
    });
  });

  describe('eventArchetype enum', () => {
    it('accepts valid archetype', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', eventArchetype: 'wedding' }).success
      ).toBe(true);
    });

    it('accepts null', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', eventArchetype: null }).success
      ).toBe(true);
    });

    it('rejects invalid archetype', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', eventArchetype: 'pool_party' }).success
      ).toBe(false);
    });
  });

  describe('UUID fields', () => {
    it.each(['organizationId', 'mainContactId', 'venueId', 'leadSourceId', 'referrerEntityId', 'plannerEntityId'])(
      '%s accepts valid UUID',
      (field) => {
        expect(
          createDealSchema.safeParse({ proposedDate: '2026-01-01', [field]: VALID_UUID }).success
        ).toBe(true);
      }
    );

    it.each(['organizationId', 'mainContactId', 'venueId'])(
      '%s rejects non-UUID string',
      (field) => {
        expect(
          createDealSchema.safeParse({ proposedDate: '2026-01-01', [field]: 'not-a-uuid' }).success
        ).toBe(false);
      }
    );
  });

  describe('email fields', () => {
    it('accepts valid clientEmail', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', clientEmail: 'a@b.com' }).success
      ).toBe(true);
    });

    it('rejects invalid clientEmail', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', clientEmail: 'not-email' }).success
      ).toBe(false);
    });

    it('accepts null clientEmail', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', clientEmail: null }).success
      ).toBe(true);
    });

    it('accepts null partnerBEmail', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', partnerBEmail: null }).success
      ).toBe(true);
    });
  });

  describe('max length constraints', () => {
    it('rejects title over 500 chars', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', title: 'x'.repeat(501) }).success
      ).toBe(false);
    });

    it('accepts title at 500 chars', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', title: 'x'.repeat(500) }).success
      ).toBe(true);
    });

    it('rejects clientName over 300 chars', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', clientName: 'x'.repeat(301) }).success
      ).toBe(false);
    });

    it('rejects leadSourceDetail over 500 chars', () => {
      expect(
        createDealSchema.safeParse({ proposedDate: '2026-01-01', leadSourceDetail: 'x'.repeat(501) }).success
      ).toBe(false);
    });
  });
});
