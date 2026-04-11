/**
 * Tests for `applyActiveEventsFilter` — Pass 3 Phase 4.
 *
 * The helper is a one-liner over a generic query builder. These tests just
 * verify the contract: calls `.is('archived_at', null)` exactly once and
 * returns the builder for chaining.
 */

import { describe, it, expect, vi } from 'vitest';
import { applyActiveEventsFilter } from '../get-active-events-filter';

describe('applyActiveEventsFilter', () => {
  it('calls .is("archived_at", null) on the query builder', () => {
    const builder = { is: vi.fn().mockReturnThis() };
    applyActiveEventsFilter(builder);
    expect(builder.is).toHaveBeenCalledTimes(1);
    expect(builder.is).toHaveBeenCalledWith('archived_at', null);
  });

  it('returns the builder for chaining', () => {
    const builder = { is: vi.fn().mockReturnThis() };
    const result = applyActiveEventsFilter(builder);
    expect(result).toBe(builder);
  });
});
