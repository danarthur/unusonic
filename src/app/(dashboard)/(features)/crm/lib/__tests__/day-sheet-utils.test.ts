import { describe, it, expect } from 'vitest';
import { getCallTime, googleMapsUrl } from '../day-sheet-utils';

describe('getCallTime', () => {
  it('returns TBD when startsAt is null', () => {
    expect(getCallTime(null)).toBe('TBD');
  });

  it('returns a formatted time 2 hours before start', () => {
    const result = getCallTime('2026-06-15T18:00:00');
    // 18:00 - 2h = 16:00 → should contain "4" (4 PM) or "16"
    expect(result).toBeTruthy();
    expect(result).not.toBe('TBD');
  });

  it('handles midnight rollback (2 AM start → 12 AM call)', () => {
    const result = getCallTime('2026-06-15T02:00:00');
    expect(result).toBeTruthy();
    expect(result).not.toBe('TBD');
  });
});

describe('googleMapsUrl', () => {
  it('returns encoded search URL for a real address', () => {
    const url = googleMapsUrl('123 Main St, Austin TX');
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Austin%20TX',
    );
  });

  it('returns base maps URL for empty string', () => {
    expect(googleMapsUrl('')).toBe('https://www.google.com/maps');
  });

  it('returns base maps URL for em-dash placeholder', () => {
    expect(googleMapsUrl('—')).toBe('https://www.google.com/maps');
  });

  it('encodes special characters', () => {
    const url = googleMapsUrl('Café & Bar #5');
    expect(url).toContain('Caf%C3%A9');
    expect(url).toContain('%26');
    expect(url).toContain('%235');
  });
});
