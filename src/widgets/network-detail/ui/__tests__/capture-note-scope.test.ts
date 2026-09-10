import { describe, it, expect } from 'vitest';
import { partitionByScope } from '../capture-note-scope';
import type { EntityCapture } from '../../api/get-entity-captures';

function capture(over: Partial<EntityCapture> = {}): EntityCapture {
  return {
    id: 'c1',
    createdAt: '2026-09-01T00:00:00.000Z',
    userId: 'u1',
    capturedByName: null,
    isOwnCapture: true,
    transcript: null,
    parsedNote: null,
    parsedFollowUp: null,
    visibility: 'user',
    resolvedEntityId: 'e1',
    aboutEntity: null,
    linkedProduction: null,
    uncertain: false,
    noteScope: null,
    noteScopePinned: false,
    ...over,
  } as EntityCapture;
}

describe('partitionByScope', () => {
  it('keeps unclassified notes on the profile', () => {
    const { about, show } = partitionByScope([capture({ noteScope: null })]);
    expect(about).toHaveLength(1);
    expect(show).toHaveLength(0);
  });

  it('keeps notes marked about on the profile', () => {
    const { about } = partitionByScope([capture({ noteScope: 'about' })]);
    expect(about).toHaveLength(1);
  });

  it('demotes only what is marked show', () => {
    const { about, show } = partitionByScope([
      capture({ id: 'a', noteScope: 'about' }),
      capture({ id: 'b', noteScope: 'show' }),
      capture({ id: 'c', noteScope: null }),
    ]);
    expect(about.map((c) => c.id)).toEqual(['a', 'c']);
    expect(show.map((c) => c.id)).toEqual(['b']);
  });

  // The whole point: a note attached to one show can still be a standing fact
  // about the person. Scope alone must not decide this.
  it('does not demote a note merely because it names a show', () => {
    const { about, show } = partitionByScope([
      capture({
        id: 'late',
        noteScope: 'about',
        linkedProduction: { kind: 'deal', id: 'd1', title: 'Hale wedding' },
      }),
    ]);
    expect(about.map((c) => c.id)).toEqual(['late']);
    expect(show).toHaveLength(0);
  });

  it('preserves order within each side', () => {
    const { about } = partitionByScope([
      capture({ id: 'first' }),
      capture({ id: 'second', noteScope: 'show' }),
      capture({ id: 'third' }),
    ]);
    expect(about.map((c) => c.id)).toEqual(['first', 'third']);
  });
});
