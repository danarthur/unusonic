/**
 * Greeting chip resolver tests (design doc §3.2).
 *
 * Verifies:
 *   • Page-context dispatch (deal / proposal / event / entity / lobby)
 *   • New-workspace branch
 *   • Chip count always ≤3
 *   • No chip contains urgency language (no counts, no "urgent", no asks)
 */

import { describe, it, expect } from 'vitest';
import type { AionPageContext } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { resolveGreetingChips } from '../greeting-chips';

function makeCtx(type: string | null): AionPageContext {
  return {
    type,
    entityId: type ? 'some-id' : null,
    label: null,
    secondaryId: null,
    secondaryType: null,
  };
}

describe('resolveGreetingChips — page-context dispatch', () => {
  it('deal context → deal-scoped chips', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('deal') });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label)).toEqual(['Brief this deal', 'Draft a follow-up', 'Crew on this show']);
  });

  it('proposal context → same as deal (capability set equivalent)', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('proposal') });
    expect(chips.map((c) => c.label)).toEqual(['Brief this deal', 'Draft a follow-up', 'Crew on this show']);
  });

  it('event context → event-scoped chips', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('event') });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label)).toEqual(['Brief me', 'Timeline', 'Money state']);
  });

  it('entity context → entity-scoped chips', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('entity') });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label).sort()).toEqual(
      ['Contact info', 'Deal history', 'Past shows together'].sort(),
    );
  });

  it('no pageContext + established workspace → lobby starter chips', () => {
    const chips = resolveGreetingChips({ pageContext: null });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label)).toEqual(["What's urgent", 'Draft a follow-up', 'Catch me up']);
  });

  it('no pageContext + isNewWorkspace → new-workspace starter chips', () => {
    const chips = resolveGreetingChips({ pageContext: null, isNewWorkspace: true });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label)).toEqual(['Draft a first message', 'Add a deal', 'What can you do?']);
  });

  it('unknown pageContext type → lobby fallback', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('mystery-surface') });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label)).toEqual(["What's urgent", 'Draft a follow-up', 'Catch me up']);
  });
});

describe('chip content discipline', () => {
  // Sweep every context the resolver handles, assert no urgency assertion.
  it('no chip label or value contains forbidden urgency tokens', () => {
    const contexts: Array<{ ctx: AionPageContext | null; isNewWorkspace?: boolean }> = [
      { ctx: makeCtx('deal') },
      { ctx: makeCtx('proposal') },
      { ctx: makeCtx('event') },
      { ctx: makeCtx('entity') },
      { ctx: null },
      { ctx: null, isNewWorkspace: true },
    ];
    const forbidden = ['overdue', 'unconfirmed!', 'STALE', 'EMERGENCY', '5 deals'];
    for (const { ctx, isNewWorkspace } of contexts) {
      const chips = resolveGreetingChips({ pageContext: ctx, isNewWorkspace });
      for (const chip of chips) {
        for (const token of forbidden) {
          expect(chip.label.toLowerCase()).not.toContain(token.toLowerCase());
          expect(chip.value.toLowerCase()).not.toContain(token.toLowerCase());
        }
      }
    }
  });

  it('chip count is always ≤3', () => {
    const contexts: Array<AionPageContext | null> = [
      makeCtx('deal'), makeCtx('event'), makeCtx('entity'), null, makeCtx('other'),
    ];
    for (const ctx of contexts) {
      const chips = resolveGreetingChips({ pageContext: ctx });
      expect(chips.length).toBeLessThanOrEqual(3);
      expect(chips.length).toBeGreaterThan(0);
    }
  });

  it('chip values are non-empty natural-language queries', () => {
    const chips = resolveGreetingChips({ pageContext: makeCtx('deal') });
    for (const chip of chips) {
      expect(chip.value.length).toBeGreaterThan(5);
      // Not a terse action keyword — should be a sentence.
      expect(chip.value).toMatch(/[a-zA-Z].*[.?]$/);
    }
  });
});
