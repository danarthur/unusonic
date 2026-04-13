/**
 * Archetype gate unit tests for getClientSongsPageData.
 *
 * This file covers the pure archetype-gate logic (assertion 24 from the
 * Songs design doc §13.3). The full loader flow requires a mocked
 * system client and isn't exercised here — that lives in an integration
 * test against the live DB (slice 7 pgTAP + slice 5/6 smoke tests
 * already cover the RPC side). What matters is that the TypeScript gate
 * correctly classifies every event_archetype value in the design
 * vocabulary, because a regression here would either silently hide the
 * feature from a wedding (trust-broken) or surface "Start the playlist"
 * to a corporate CFO (the WTF moment Critic flagged in §0 A9).
 */
import { describe, it, expect } from 'vitest';
import { isSongsEnabledForArchetype } from '../get-client-songs-page-data';

describe('isSongsEnabledForArchetype — §0 A9 regression guard', () => {
  it('enables the feature for wedding (the primary use case)', () => {
    expect(isSongsEnabledForArchetype('wedding')).toBe(true);
  });

  it('enables the feature for social event archetypes', () => {
    expect(isSongsEnabledForArchetype('birthday')).toBe(true);
    expect(isSongsEnabledForArchetype('private_dinner')).toBe(true);
    expect(isSongsEnabledForArchetype('charity_gala')).toBe(true);
  });

  it('DISABLES the feature for corporate archetypes (no "Priya" for a CFO)', () => {
    expect(isSongsEnabledForArchetype('corporate_gala')).toBe(false);
    expect(isSongsEnabledForArchetype('product_launch')).toBe(false);
    expect(isSongsEnabledForArchetype('conference')).toBe(false);
    expect(isSongsEnabledForArchetype('awards_show')).toBe(false);
  });

  it('DISABLES the feature for performance archetypes (concerts/festivals)', () => {
    // Concert DJs don't take couple requests — the workflow isn't a couple
    // at all. If this ever returns true, the home dock will show a Songs
    // card to a promoter and we'll hear about it at SXSW.
    expect(isSongsEnabledForArchetype('concert')).toBe(false);
    expect(isSongsEnabledForArchetype('festival')).toBe(false);
  });

  it('enables the feature for null/unknown archetype (graceful fallback)', () => {
    // Rationale: better to show the feature and rely on the `editable`
    // flag + lock banner than silently hide it. An unknown archetype
    // almost always represents "we haven't classified this yet" rather
    // than "this is a conference" — the fallback matches the vibe of a
    // private event, which is the most common Unusonic data shape.
    expect(isSongsEnabledForArchetype(null)).toBe(true);
    expect(isSongsEnabledForArchetype(undefined)).toBe(true);
    expect(isSongsEnabledForArchetype('some_new_value_we_havent_seen')).toBe(true);
  });

  it('returns a stable boolean (no undefined leaks)', () => {
    // Defensive — if the function ever grows a branch that forgets a
    // return, TypeScript will catch it BUT this test catches a more
    // insidious case where a call site checks `!result` and misbehaves.
    const result = isSongsEnabledForArchetype('wedding');
    expect(typeof result).toBe('boolean');
  });
});
