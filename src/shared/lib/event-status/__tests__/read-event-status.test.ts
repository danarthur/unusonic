/**
 * Tests for `readEventStatus` — Pass 3 Phase 2.
 *
 * These cover the canonical mapping for every (status, lifecycle_status)
 * combination defined by Phase 0's `ops.event_status_pair_valid`, plus the
 * degenerate / defensive cases the DB trigger should prevent but the helper
 * should still survive gracefully.
 */

import { describe, it, expect } from 'vitest';
import {
  readEventStatus,
  readEventStatusFromLifecycle,
  isEventActive,
  isEventLive,
  isEventTerminal,
  type EventPhase,
} from '../read-event-status';

function phase(
  status: string | null,
  lifecycle: string | null,
): EventPhase {
  return readEventStatus({ status, lifecycle_status: lifecycle }).phase;
}

describe('readEventStatus', () => {
  describe('planned status', () => {
    it('maps null lifecycle_status to pre', () => {
      expect(phase('planned', null)).toBe('pre');
    });

    it('maps lead/tentative/confirmed to pre', () => {
      expect(phase('planned', 'lead')).toBe('pre');
      expect(phase('planned', 'tentative')).toBe('pre');
      expect(phase('planned', 'confirmed')).toBe('pre');
    });

    it('maps production to active', () => {
      expect(phase('planned', 'production')).toBe('active');
    });
  });

  describe('in_progress status', () => {
    it('maps to live', () => {
      expect(phase('in_progress', 'live')).toBe('live');
    });
  });

  describe('completed status', () => {
    it('maps to post', () => {
      expect(phase('completed', 'post')).toBe('post');
    });
  });

  describe('cancelled status', () => {
    it('maps to cancelled', () => {
      expect(phase('cancelled', 'cancelled')).toBe('cancelled');
    });
  });

  describe('archived status', () => {
    it('maps to archived', () => {
      expect(phase('archived', 'archived')).toBe('archived');
    });
  });

  describe('degenerate inputs', () => {
    it('null status returns unknown', () => {
      expect(phase(null, 'lead')).toBe('unknown');
      expect(phase(null, null)).toBe('unknown');
    });

    it('unknown status value returns unknown', () => {
      expect(phase('wrapped', 'post')).toBe('unknown');
      expect(phase('wrapped-up', null)).toBe('unknown');
    });
  });

  describe('raw + isValid passthrough', () => {
    it('exposes the raw pair on every result', () => {
      const r = readEventStatus({ status: 'in_progress', lifecycle_status: 'live' });
      expect(r.raw).toEqual({ status: 'in_progress', lifecycle_status: 'live' });
      expect(r.isValid).toBe(true);
      expect(r.phase).toBe('live');
    });

    it('isValid is false for drift combinations', () => {
      // This pair cannot exist in the DB post-Phase-0 but the helper
      // should still surface it as invalid if constructed in tests.
      const r = readEventStatus({ status: 'planned', lifecycle_status: 'live' });
      expect(r.isValid).toBe(false);
      // Phase still derives from the status column — 'planned' falls through
      // the default branch in the planned case (non-production) and lands on 'pre'.
      expect(r.phase).toBe('pre');
    });

    it('isValid is true for valid pairs', () => {
      const r = readEventStatus({ status: 'completed', lifecycle_status: 'post' });
      expect(r.isValid).toBe(true);
    });

    it('handles undefined inputs identically to null', () => {
      const r = readEventStatus({});
      expect(r).toEqual({
        phase: 'unknown',
        raw: { status: null, lifecycle_status: null },
        isValid: false,
      });
    });
  });
});

describe('readEventStatusFromLifecycle', () => {
  it('maps null to pre', () => {
    expect(readEventStatusFromLifecycle(null)).toBe('pre');
    expect(readEventStatusFromLifecycle(undefined)).toBe('pre');
  });
  it('maps lead/tentative/confirmed to pre', () => {
    expect(readEventStatusFromLifecycle('lead')).toBe('pre');
    expect(readEventStatusFromLifecycle('tentative')).toBe('pre');
    expect(readEventStatusFromLifecycle('confirmed')).toBe('pre');
  });
  it('maps production to active', () => {
    expect(readEventStatusFromLifecycle('production')).toBe('active');
  });
  it('maps live to live', () => {
    expect(readEventStatusFromLifecycle('live')).toBe('live');
  });
  it('maps post to post', () => {
    expect(readEventStatusFromLifecycle('post')).toBe('post');
  });
  it('maps cancelled and archived through', () => {
    expect(readEventStatusFromLifecycle('cancelled')).toBe('cancelled');
    expect(readEventStatusFromLifecycle('archived')).toBe('archived');
  });
  it('returns unknown for garbage', () => {
    expect(readEventStatusFromLifecycle('wrapped')).toBe('unknown');
  });
});

describe('convenience helpers', () => {
  describe('isEventActive', () => {
    it('is true for planned+production', () => {
      expect(isEventActive({ status: 'planned', lifecycle_status: 'production' })).toBe(true);
    });

    it('is false for pre', () => {
      expect(isEventActive({ status: 'planned', lifecycle_status: 'confirmed' })).toBe(false);
    });

    it('is false for live', () => {
      expect(isEventActive({ status: 'in_progress', lifecycle_status: 'live' })).toBe(false);
    });
  });

  describe('isEventLive', () => {
    it('is true for in_progress+live', () => {
      expect(isEventLive({ status: 'in_progress', lifecycle_status: 'live' })).toBe(true);
    });

    it('is false for active', () => {
      expect(isEventLive({ status: 'planned', lifecycle_status: 'production' })).toBe(false);
    });
  });

  describe('isEventTerminal', () => {
    it('is true for cancelled', () => {
      expect(isEventTerminal({ status: 'cancelled', lifecycle_status: 'cancelled' })).toBe(true);
    });

    it('is true for archived', () => {
      expect(isEventTerminal({ status: 'archived', lifecycle_status: 'archived' })).toBe(true);
    });

    it('is false for live', () => {
      expect(isEventTerminal({ status: 'in_progress', lifecycle_status: 'live' })).toBe(false);
    });

    it('is false for post (show done but not archived)', () => {
      expect(isEventTerminal({ status: 'completed', lifecycle_status: 'post' })).toBe(false);
    });
  });
});
