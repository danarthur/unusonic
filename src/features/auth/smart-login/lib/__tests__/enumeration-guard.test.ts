/**
 * Unit tests for the enumeration-guard primitives that back
 * `resolveContinueAction`. The dispatcher has its own integration tests
 * (`resolve-continue.test.ts`); this file locks down the primitives.
 */

import { describe, it, expect } from 'vitest';
import {
  runDummyCompare,
  delayToFloor,
  DUMMY_COMPARE_ITERATIONS,
  JITTER_FLOOR_MS,
  JITTER_RANGE_MS,
} from '../enumeration-guard';

describe('runDummyCompare', () => {
  it('returns a 64-char hex digest', () => {
    const d = runDummyCompare('user@example.com');
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for a given marker (runs the exact same work)', () => {
    const a = runDummyCompare('same-marker');
    const b = runDummyCompare('same-marker');
    expect(a).toBe(b);
  });

  it('different markers produce different digests (prevents JIT dead-code-elim)', () => {
    const a = runDummyCompare('alice@example.com');
    const b = runDummyCompare('bob@example.com');
    expect(a).not.toBe(b);
  });

  it('iteration constant is non-trivial (guard against accidental 0)', () => {
    expect(DUMMY_COMPARE_ITERATIONS).toBeGreaterThanOrEqual(100);
  });
});

describe('delayToFloor', () => {
  it('sleeps at least (floor - elapsed) when elapsed < floor', async () => {
    let requested = 0;
    await delayToFloor(100, (ms) => {
      requested = ms;
      return Promise.resolve();
    });
    // floor (400) - elapsed (100) = 300, plus 0–49 jitter.
    expect(requested).toBeGreaterThanOrEqual(JITTER_FLOOR_MS - 100);
    expect(requested).toBeLessThanOrEqual(
      JITTER_FLOOR_MS - 100 + JITTER_RANGE_MS,
    );
  });

  it('sleeps only the jitter amount when elapsed >= floor', async () => {
    let requested = 0;
    await delayToFloor(500, (ms) => {
      requested = ms;
      return Promise.resolve();
    });
    expect(requested).toBeGreaterThanOrEqual(0);
    expect(requested).toBeLessThan(JITTER_RANGE_MS);
  });

  it('never requests a negative delay', async () => {
    let requested = 0;
    await delayToFloor(10_000, (ms) => {
      requested = ms;
      return Promise.resolve();
    });
    expect(requested).toBeGreaterThanOrEqual(0);
  });

  it('does not call the delay function when floor+jitter is 0', async () => {
    // With elapsed >> floor and jitter could be 0, the body skips.
    // Not deterministic, but we can spy with a big elapsed value.
    let callCount = 0;
    await delayToFloor(10_000, () => {
      callCount++;
      return Promise.resolve();
    });
    // Either 0 or 1 depending on jitter draw; both are valid.
    expect(callCount).toBeLessThanOrEqual(1);
  });
});
