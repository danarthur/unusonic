import { describe, it, expect } from 'vitest';
import {
  toClientSongRequest,
  toClientSongRequests,
  groupByClientTier,
} from '../client-songs';

function coupleEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: 'Umbrella',
    artist: 'Rihanna',
    tier: 'must_play',
    assigned_moment_id: null,
    sort_order: 0,
    notes: 'first dance??',
    added_by: 'couple',
    requested_by_label: 'Maya',
    requested_at: '2026-04-01T12:00:00Z',
    is_late_add: false,
    acknowledged_at: null,
    acknowledged_moment_label: null,
    ...overrides,
  };
}

describe('toClientSongRequest', () => {
  it('projects a valid couple-added entry', () => {
    const out = toClientSongRequest(coupleEntry(), { editable: true });
    expect(out).not.toBeNull();
    expect(out?.id).toBe('e1');
    expect(out?.title).toBe('Umbrella');
    expect(out?.tier).toBe('must_play');
    expect(out?.editable).toBe(true);
    expect(out?.requestedByLabel).toBe('Maya');
    expect(out?.isLateAdd).toBe(false);
  });

  it('does NOT include `added_by` in the projection (§6 allow-list)', () => {
    const out = toClientSongRequest(coupleEntry(), { editable: true });
    expect(out).not.toBeNull();
    // The projection must never leak the attribution field — it's
    // tautologically 'couple' on this surface and including it creates
    // a "lie waiting to happen" if a future filter breaks.
    expect(out as unknown as { added_by?: string }).not.toHaveProperty('added_by');
  });

  it('does NOT include `assigned_moment_id` or `sort_order` (staff-only fields)', () => {
    const out = toClientSongRequest(coupleEntry({ assigned_moment_id: 'm1', sort_order: 42 }), {
      editable: true,
    });
    const asRecord = out as unknown as Record<string, unknown>;
    expect(asRecord.assigned_moment_id).toBeUndefined();
    expect(asRecord.sort_order).toBeUndefined();
  });

  it('rejects DJ-added entries (added_by=dj → null)', () => {
    expect(toClientSongRequest(coupleEntry({ added_by: 'dj' }), { editable: true })).toBeNull();
  });

  it('rejects planner-added entries (reserved, not surfaced yet)', () => {
    expect(toClientSongRequest(coupleEntry({ added_by: 'planner' }), { editable: true })).toBeNull();
  });

  it('rejects cued-tier entries (DJ-only staging)', () => {
    expect(toClientSongRequest(coupleEntry({ tier: 'cued' }), { editable: true })).toBeNull();
  });

  it('rejects entries with unknown tiers', () => {
    expect(toClientSongRequest(coupleEntry({ tier: 'garbage' }), { editable: true })).toBeNull();
  });

  it('accepts special_moment tier', () => {
    const out = toClientSongRequest(
      coupleEntry({ tier: 'special_moment', special_moment_label: 'first_dance' }),
      { editable: true },
    );
    expect(out?.tier).toBe('special_moment');
    expect(out?.specialMomentLabel).toBe('first_dance');
  });

  it('surfaces acknowledgement fields from the DJ', () => {
    const out = toClientSongRequest(
      coupleEntry({
        acknowledged_at: '2026-04-10T18:00:00Z',
        acknowledged_moment_label: 'first_dance',
      }),
      { editable: true },
    );
    expect(out?.acknowledgedAt).toBe('2026-04-10T18:00:00Z');
    expect(out?.acknowledgedMomentLabel).toBe('first_dance');
  });

  it('rejects missing id or title', () => {
    expect(toClientSongRequest(coupleEntry({ id: '' }), { editable: true })).toBeNull();
    expect(toClientSongRequest(coupleEntry({ title: '' }), { editable: true })).toBeNull();
  });

  it('rejects non-object / null / undefined raw input', () => {
    expect(toClientSongRequest(null, { editable: true })).toBeNull();
    expect(toClientSongRequest(undefined, { editable: true })).toBeNull();
  });

  it('threads the editable flag through', () => {
    expect(toClientSongRequest(coupleEntry(), { editable: false })?.editable).toBe(false);
    expect(toClientSongRequest(coupleEntry(), { editable: true })?.editable).toBe(true);
  });
});

describe('toClientSongRequests', () => {
  it('filters out non-couple entries and invalid rows', () => {
    const out = toClientSongRequests(
      [
        coupleEntry({ id: 'a', title: 'Song A' }),
        coupleEntry({ id: 'b', added_by: 'dj', title: 'Song B' }),     // dropped
        coupleEntry({ id: 'c', tier: 'cued', title: 'Song C' }),       // dropped
        coupleEntry({ id: 'd', title: 'Song D' }),
        'garbage',                                                      // dropped
      ],
      { editable: true },
    );
    expect(out.map(r => r.id)).toEqual(['a', 'd']);
  });

  it('returns empty for non-array input', () => {
    expect(toClientSongRequests(null, { editable: true })).toEqual([]);
    expect(toClientSongRequests({}, { editable: true })).toEqual([]);
  });
});

describe('groupByClientTier', () => {
  it('buckets requests by tier and preserves input order within buckets', () => {
    const reqs = toClientSongRequests(
      [
        coupleEntry({ id: 'a', tier: 'must_play' }),
        coupleEntry({ id: 'b', tier: 'do_not_play' }),
        coupleEntry({ id: 'c', tier: 'must_play' }),
        coupleEntry({ id: 'd', tier: 'special_moment', special_moment_label: 'first_dance' }),
        coupleEntry({ id: 'e', tier: 'play_if_possible' }),
      ],
      { editable: true },
    );

    const grouped = groupByClientTier(reqs);
    expect(grouped.special_moment.map(r => r.id)).toEqual(['d']);
    expect(grouped.must_play.map(r => r.id)).toEqual(['a', 'c']);
    expect(grouped.play_if_possible.map(r => r.id)).toEqual(['e']);
    expect(grouped.do_not_play.map(r => r.id)).toEqual(['b']);
  });

  it('returns all four empty buckets for an empty input', () => {
    const grouped = groupByClientTier([]);
    expect(grouped.special_moment).toEqual([]);
    expect(grouped.must_play).toEqual([]);
    expect(grouped.play_if_possible).toEqual([]);
    expect(grouped.do_not_play).toEqual([]);
  });
});
