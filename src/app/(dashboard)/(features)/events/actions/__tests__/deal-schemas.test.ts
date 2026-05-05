/**
 * Unit tests for createDealSchema — imported from the real source to prevent drift.
 *
 * P0 client-field redesign: schema now takes hostKind + personHosts/companyHost
 * instead of clientType + flat client* fields.
 */
import { describe, it, expect } from 'vitest';
import { createDealSchema } from '../deal-model';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const baseInput = {
  proposedDate: '2026-04-07',
  hostKind: 'individual' as const,
  personHosts: [{ firstName: 'Ada', lastName: 'Lovelace' }],
};

describe('createDealSchema', () => {
  it('accepts a minimal valid individual host', () => {
    const result = createDealSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  describe('proposedDate format', () => {
    it('accepts yyyy-MM-dd', () => {
      expect(createDealSchema.safeParse(baseInput).success).toBe(true);
    });

    it.each([
      ['slash separator', '2026/04/07'],
      ['US format', '04-07-2026'],
      ['no leading zeros', '2026-4-7'],
      ['empty string', ''],
    ])('rejects %s (%s)', (_label, date) => {
      expect(createDealSchema.safeParse({ ...baseInput, proposedDate: date }).success).toBe(false);
    });
  });

  describe('time fields (eventStartTime / eventEndTime)', () => {
    it.each(['14:30', '00:00', '23:59'])('accepts %s', (time) => {
      const r = createDealSchema.safeParse({ ...baseInput, eventStartTime: time });
      expect(r.success).toBe(true);
    });

    it.each([
      ['single-digit hour', '2:30'],
      ['word', 'noon'],
    ])('rejects %s (%s)', (_label, time) => {
      const r = createDealSchema.safeParse({ ...baseInput, eventStartTime: time });
      expect(r.success).toBe(false);
    });

    it('accepts null', () => {
      expect(createDealSchema.safeParse({ ...baseInput, eventStartTime: null }).success).toBe(true);
    });
  });

  describe('hostKind enum', () => {
    it.each(['individual', 'couple', 'company', 'venue_concert'] as const)('accepts %s', (k) => {
      const r = createDealSchema.safeParse({ ...baseInput, hostKind: k });
      expect(r.success).toBe(true);
    });

    it('rejects invalid hostKind', () => {
      const r = createDealSchema.safeParse({ ...baseInput, hostKind: 'llc' });
      expect(r.success).toBe(false);
    });
  });

  describe('pairing enum', () => {
    it('defaults to romantic', () => {
      const r = createDealSchema.safeParse(baseInput);
      if (r.success) expect(r.data.pairing).toBe('romantic');
    });

    it.each(['romantic', 'co_host', 'family'] as const)('accepts %s', (p) => {
      expect(createDealSchema.safeParse({ ...baseInput, pairing: p }).success).toBe(true);
    });

    it('rejects unknown pairing', () => {
      expect(createDealSchema.safeParse({ ...baseInput, pairing: 'business' }).success).toBe(false);
    });
  });

  describe('status enum', () => {
    it('defaults to inquiry', () => {
      const r = createDealSchema.safeParse(baseInput);
      if (r.success) expect(r.data.status).toBe('inquiry');
    });

    it.each(['inquiry', 'proposal', 'contract_sent', 'won', 'lost'] as const)(
      'accepts %s',
      (s) => {
        expect(createDealSchema.safeParse({ ...baseInput, status: s }).success).toBe(true);
      }
    );

    it('rejects invalid status', () => {
      expect(createDealSchema.safeParse({ ...baseInput, status: 'pending' }).success).toBe(false);
    });
  });

  describe('eventArchetype enum', () => {
    it('accepts valid archetype', () => {
      expect(createDealSchema.safeParse({ ...baseInput, eventArchetype: 'wedding' }).success).toBe(true);
    });

    it('accepts null', () => {
      expect(createDealSchema.safeParse({ ...baseInput, eventArchetype: null }).success).toBe(true);
    });

    it('rejects malformed slug (uppercase/spaces)', () => {
      // Archetypes are now DB-backed per-workspace slugs; schema only enforces
      // the slug shape (lowercase alnum + underscore). Unknown-but-well-formed
      // slugs like 'pool_party' are accepted at schema level — workspace-scope
      // validation happens downstream. But malformed slugs still reject.
      expect(createDealSchema.safeParse({ ...baseInput, eventArchetype: 'Pool Party' }).success).toBe(false);
    });
  });

  describe('UUID fields', () => {
    it.each(['venueId', 'leadSourceId', 'referrerEntityId'])('%s accepts valid UUID', (field) => {
      expect(createDealSchema.safeParse({ ...baseInput, [field]: VALID_UUID }).success).toBe(true);
    });

    it.each(['venueId', 'leadSourceId'])('%s rejects non-UUID string', (field) => {
      expect(createDealSchema.safeParse({ ...baseInput, [field]: 'not-a-uuid' }).success).toBe(false);
    });

    it('personHosts[].existingId accepts UUID', () => {
      const r = createDealSchema.safeParse({
        ...baseInput,
        personHosts: [{ existingId: VALID_UUID }],
      });
      expect(r.success).toBe(true);
    });

    it('personHosts[].existingId rejects non-UUID', () => {
      const r = createDealSchema.safeParse({
        ...baseInput,
        personHosts: [{ existingId: 'nope' }],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('email fields', () => {
    it('accepts valid email on a person host', () => {
      const r = createDealSchema.safeParse({
        ...baseInput,
        personHosts: [{ firstName: 'A', lastName: 'B', email: 'a@b.com' }],
      });
      expect(r.success).toBe(true);
    });

    it('rejects invalid email on a person host', () => {
      const r = createDealSchema.safeParse({
        ...baseInput,
        personHosts: [{ firstName: 'A', lastName: 'B', email: 'not-email' }],
      });
      expect(r.success).toBe(false);
    });

    it('accepts null planner email', () => {
      const r = createDealSchema.safeParse({
        ...baseInput,
        planner: { firstName: 'P', lastName: 'L', email: null },
      });
      expect(r.success).toBe(true);
    });
  });

  describe('max length constraints', () => {
    it('rejects title over 500 chars', () => {
      expect(createDealSchema.safeParse({ ...baseInput, title: 'x'.repeat(501) }).success).toBe(false);
    });

    it('accepts title at 500 chars', () => {
      expect(createDealSchema.safeParse({ ...baseInput, title: 'x'.repeat(500) }).success).toBe(true);
    });

    it('rejects coupleDisplayName over 300 chars', () => {
      expect(createDealSchema.safeParse({ ...baseInput, coupleDisplayName: 'x'.repeat(301) }).success).toBe(false);
    });

    it('rejects leadSourceDetail over 500 chars', () => {
      expect(createDealSchema.safeParse({ ...baseInput, leadSourceDetail: 'x'.repeat(501) }).success).toBe(false);
    });
  });

  describe('pocFromHostIndex', () => {
    it('accepts a positive integer', () => {
      expect(createDealSchema.safeParse({ ...baseInput, pocFromHostIndex: 1 }).success).toBe(true);
    });

    it('rejects zero', () => {
      expect(createDealSchema.safeParse({ ...baseInput, pocFromHostIndex: 0 }).success).toBe(false);
    });

    it('accepts null', () => {
      expect(createDealSchema.safeParse({ ...baseInput, pocFromHostIndex: null }).success).toBe(true);
    });
  });
});
