/**
 * Unit tests for getCalendarEventsInputSchema.
 */
import { describe, it, expect } from 'vitest';
import { getCalendarEventsInputSchema } from '../schema';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('getCalendarEventsInputSchema', () => {
  const valid = {
    start: '2026-04-07',
    end: '2026-04-14',
    workspaceId: VALID_UUID,
  };

  it('accepts valid ISO date strings', () => {
    expect(getCalendarEventsInputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts full ISO datetime with Z', () => {
    expect(
      getCalendarEventsInputSchema.safeParse({
        ...valid,
        start: '2026-04-07T14:30:00Z',
        end: '2026-04-07T14:30:00.000Z',
      }).success
    ).toBe(true);
  });

  describe('invalid dates', () => {
    it('rejects empty start', () => {
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, start: '' }).success).toBe(false);
    });

    it('rejects non-date string', () => {
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, start: 'not-a-date' }).success).toBe(false);
    });

    it('rejects string "null"', () => {
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, end: 'null' }).success).toBe(false);
    });

    it('rejects impossible date (month 13)', () => {
      // Date.parse('2026-13-01') returns NaN in most engines
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, start: '2026-13-01' }).success).toBe(false);
    });
  });

  describe('workspaceId', () => {
    it('rejects non-UUID', () => {
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, workspaceId: 'abc' }).success).toBe(false);
    });

    it('rejects empty', () => {
      expect(getCalendarEventsInputSchema.safeParse({ ...valid, workspaceId: '' }).success).toBe(false);
    });
  });

  it('requires both start and end', () => {
    expect(getCalendarEventsInputSchema.safeParse({ start: '2026-04-07', workspaceId: VALID_UUID }).success).toBe(false);
    expect(getCalendarEventsInputSchema.safeParse({ end: '2026-04-07', workspaceId: VALID_UUID }).success).toBe(false);
  });
});
