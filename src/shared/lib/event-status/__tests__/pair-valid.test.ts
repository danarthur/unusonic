/**
 * Tests for the TypeScript mirror of `ops.event_status_pair_valid`.
 *
 * These tests ARE the cross-check between the SQL function and the TS mirror:
 * if either one drifts from the Phase 0 mapping table, a test here will fail
 * and surface the discrepancy before it ships. The authoritative SQL function
 * lives in migration `event_status_lifecycle_invariant` and is wired to the
 * trigger `ops.events_status_pair_check` on `ops.events`.
 */

import { describe, it, expect } from 'vitest';
import { eventStatusPairValid } from '../pair-valid';

describe('eventStatusPairValid', () => {
  describe('planned', () => {
    it('allows NULL lifecycle_status', () => {
      expect(eventStatusPairValid('planned', null)).toBe(true);
      expect(eventStatusPairValid('planned', undefined)).toBe(true);
    });

    it('allows lead / tentative / confirmed / production', () => {
      expect(eventStatusPairValid('planned', 'lead')).toBe(true);
      expect(eventStatusPairValid('planned', 'tentative')).toBe(true);
      expect(eventStatusPairValid('planned', 'confirmed')).toBe(true);
      expect(eventStatusPairValid('planned', 'production')).toBe(true);
    });

    it('rejects live / post / archived / cancelled on planned', () => {
      expect(eventStatusPairValid('planned', 'live')).toBe(false);
      expect(eventStatusPairValid('planned', 'post')).toBe(false);
      expect(eventStatusPairValid('planned', 'archived')).toBe(false);
      expect(eventStatusPairValid('planned', 'cancelled')).toBe(false);
    });
  });

  describe('in_progress', () => {
    it('requires lifecycle_status = live', () => {
      expect(eventStatusPairValid('in_progress', 'live')).toBe(true);
    });

    it('rejects any other lifecycle_status', () => {
      expect(eventStatusPairValid('in_progress', null)).toBe(false);
      expect(eventStatusPairValid('in_progress', 'production')).toBe(false);
      expect(eventStatusPairValid('in_progress', 'post')).toBe(false);
      expect(eventStatusPairValid('in_progress', 'archived')).toBe(false);
    });
  });

  describe('completed', () => {
    it('requires lifecycle_status = post', () => {
      expect(eventStatusPairValid('completed', 'post')).toBe(true);
    });

    it('rejects any other lifecycle_status', () => {
      expect(eventStatusPairValid('completed', null)).toBe(false);
      expect(eventStatusPairValid('completed', 'live')).toBe(false);
      expect(eventStatusPairValid('completed', 'archived')).toBe(false);
    });
  });

  describe('cancelled', () => {
    it('requires lifecycle_status = cancelled', () => {
      expect(eventStatusPairValid('cancelled', 'cancelled')).toBe(true);
    });

    it('rejects any other lifecycle_status', () => {
      expect(eventStatusPairValid('cancelled', null)).toBe(false);
      expect(eventStatusPairValid('cancelled', 'live')).toBe(false);
      expect(eventStatusPairValid('cancelled', 'post')).toBe(false);
    });
  });

  describe('archived', () => {
    it('requires lifecycle_status = archived', () => {
      expect(eventStatusPairValid('archived', 'archived')).toBe(true);
    });

    it('rejects any other lifecycle_status', () => {
      expect(eventStatusPairValid('archived', null)).toBe(false);
      expect(eventStatusPairValid('archived', 'post')).toBe(false);
    });
  });

  describe('invalid inputs', () => {
    it('rejects null status', () => {
      expect(eventStatusPairValid(null, 'lead')).toBe(false);
      expect(eventStatusPairValid(null, null)).toBe(false);
    });

    it('rejects unknown status values', () => {
      expect(eventStatusPairValid('wrapped', 'post')).toBe(false);
      expect(eventStatusPairValid('', null)).toBe(false);
    });
  });
});
