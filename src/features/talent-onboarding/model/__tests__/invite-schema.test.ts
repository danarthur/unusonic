/**
 * Unit tests for inviteTalentSchema.
 */
import { describe, it, expect } from 'vitest';
import { inviteTalentSchema } from '../schema';

const base = {
  email: 'test@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  employment_status: 'internal_employee' as const,
};

describe('inviteTalentSchema', () => {
  it('accepts minimal valid input with defaults', () => {
    const r = inviteTalentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.role).toBe('member');
      expect(r.data.skill_tags).toEqual([]);
      expect(r.data.capabilities).toEqual([]);
    }
  });

  describe('email', () => {
    it('rejects invalid email', () => {
      expect(inviteTalentSchema.safeParse({ ...base, email: 'bad' }).success).toBe(false);
    });

    it('rejects empty email', () => {
      expect(inviteTalentSchema.safeParse({ ...base, email: '' }).success).toBe(false);
    });
  });

  describe('name constraints', () => {
    it('rejects empty first_name', () => {
      expect(inviteTalentSchema.safeParse({ ...base, first_name: '' }).success).toBe(false);
    });

    it('rejects first_name over 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, first_name: 'x'.repeat(121) }).success).toBe(false);
    });

    it('accepts first_name at 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, first_name: 'x'.repeat(120) }).success).toBe(true);
    });

    it('rejects empty last_name', () => {
      expect(inviteTalentSchema.safeParse({ ...base, last_name: '' }).success).toBe(false);
    });

    it('rejects last_name over 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, last_name: 'x'.repeat(121) }).success).toBe(false);
    });
  });

  describe('phone', () => {
    it('accepts null', () => {
      expect(inviteTalentSchema.safeParse({ ...base, phone: null }).success).toBe(true);
    });

    it('accepts omitted', () => {
      expect(inviteTalentSchema.safeParse(base).success).toBe(true);
    });

    it('rejects over 30 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, phone: '1'.repeat(31) }).success).toBe(false);
    });
  });

  describe('job_title', () => {
    it('accepts null', () => {
      expect(inviteTalentSchema.safeParse({ ...base, job_title: null }).success).toBe(true);
    });

    it('rejects over 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, job_title: 'x'.repeat(121) }).success).toBe(false);
    });
  });

  describe('employment_status enum', () => {
    it('accepts internal_employee', () => {
      expect(inviteTalentSchema.safeParse({ ...base, employment_status: 'internal_employee' }).success).toBe(true);
    });

    it('accepts external_contractor', () => {
      expect(
        inviteTalentSchema.safeParse({
          ...base,
          employment_status: 'external_contractor',
          skill_tags: ['audio'],
        }).success
      ).toBe(true);
    });

    it('rejects invalid employment status', () => {
      expect(inviteTalentSchema.safeParse({ ...base, employment_status: 'freelance' }).success).toBe(false);
    });
  });

  describe('role enum', () => {
    it.each(['admin', 'member', 'restricted'] as const)('accepts %s', (role) => {
      expect(inviteTalentSchema.safeParse({ ...base, role }).success).toBe(true);
    });

    it('defaults to member', () => {
      const r = inviteTalentSchema.safeParse(base);
      if (r.success) expect(r.data.role).toBe('member');
    });

    it('rejects invalid role', () => {
      expect(inviteTalentSchema.safeParse({ ...base, role: 'owner' }).success).toBe(false);
    });
  });

  describe('skill_tags array', () => {
    it('accepts valid tags', () => {
      expect(inviteTalentSchema.safeParse({ ...base, skill_tags: ['audio', 'lighting'] }).success).toBe(true);
    });

    it('rejects empty string tag', () => {
      expect(inviteTalentSchema.safeParse({ ...base, skill_tags: [''] }).success).toBe(false);
    });

    it('rejects tag over 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, skill_tags: ['x'.repeat(121)] }).success).toBe(false);
    });
  });

  describe('contractor skill_tags refine', () => {
    it('external_contractor with 0 skill_tags fails', () => {
      const r = inviteTalentSchema.safeParse({
        ...base,
        employment_status: 'external_contractor',
        skill_tags: [],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const skillErr = r.error.issues.find((i) => i.path.includes('skill_tags'));
        expect(skillErr).toBeDefined();
      }
    });

    it('external_contractor with 1+ skill_tags passes', () => {
      expect(
        inviteTalentSchema.safeParse({
          ...base,
          employment_status: 'external_contractor',
          skill_tags: ['djing'],
        }).success
      ).toBe(true);
    });

    it('internal_employee with 0 skill_tags passes', () => {
      expect(
        inviteTalentSchema.safeParse({
          ...base,
          employment_status: 'internal_employee',
          skill_tags: [],
        }).success
      ).toBe(true);
    });
  });

  describe('capabilities array', () => {
    it('defaults to empty array', () => {
      const r = inviteTalentSchema.safeParse(base);
      if (r.success) expect(r.data.capabilities).toEqual([]);
    });

    it('rejects empty string capability', () => {
      expect(inviteTalentSchema.safeParse({ ...base, capabilities: [''] }).success).toBe(false);
    });

    it('rejects capability over 120 chars', () => {
      expect(inviteTalentSchema.safeParse({ ...base, capabilities: ['x'.repeat(121)] }).success).toBe(false);
    });
  });
});
