import { describe, it, expect } from 'vitest';
import { deriveRoleFromDealActivity } from '../derive-role';

describe('deriveRoleFromDealActivity', () => {
  it('files a planner under vendors', () => {
    // Alexa Infranca's real shape: two deals, planner on both, no direct edge.
    expect(deriveRoleFromDealActivity(['planner'], false)).toBe('VENDOR');
  });

  it('files whoever was billed under clients', () => {
    expect(deriveRoleFromDealActivity(['bill_to'], false)).toBe('CLIENT');
    expect(deriveRoleFromDealActivity(['host'], false)).toBe('CLIENT');
  });

  it('lets paying win when someone both paid and planned', () => {
    expect(deriveRoleFromDealActivity(['planner', 'bill_to'], false)).toBe('CLIENT');
  });

  it('treats being booked onto the work as roster', () => {
    expect(deriveRoleFromDealActivity([], true)).toBe('ROSTER_MEMBER');
  });

  it('prefers an explicit stakeholder role over crew involvement', () => {
    expect(deriveRoleFromDealActivity(['bill_to'], true)).toBe('CLIENT');
  });

  it('returns null for a day-of contact rather than guessing', () => {
    // Being reachable on the day says nothing about what they are to the
    // business. Unsorted is visible; wrongly filed is not.
    expect(deriveRoleFromDealActivity(['day_of_poc'], false)).toBeNull();
    expect(deriveRoleFromDealActivity(['deal_poc'], false)).toBeNull();
  });

  it('returns null when there is no evidence at all', () => {
    expect(deriveRoleFromDealActivity([], false)).toBeNull();
  });
});
