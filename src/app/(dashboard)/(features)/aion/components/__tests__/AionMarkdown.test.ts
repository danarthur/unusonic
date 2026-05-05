/**
 * Unit tests for the citation pre-processor in AionMarkdown.
 *
 * The pre-processor runs on every assistant text render. It must:
 *   1. Replace well-formed `<citation>` tags with custom-scheme markdown links.
 *   2. Leave partial/malformed tags untouched so streaming chunks still render.
 *   3. Escape markdown link metacharacters in labels.
 *   4. Refuse to match non-uuid ids or unknown kinds.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.3.
 */

import { describe, it, expect } from 'vitest';
import { replaceCitationTags, parseCitationHref } from '../AionMarkdown';

const UUID = '238cabce-1111-4aaa-8bbb-ccccdddddddd';

describe('replaceCitationTags', () => {
  it('replaces a well-formed deal citation with a custom-scheme markdown link', () => {
    const out = replaceCitationTags(
      `Closest match is <citation kind="deal" id="${UUID}">Henderson Holiday</citation>.`,
    );
    expect(out).toBe(
      `Closest match is [Henderson Holiday](citation:deal:${UUID}).`,
    );
  });

  it('handles entity and catalog kinds', () => {
    expect(replaceCitationTags(
      `<citation kind="entity" id="${UUID}">Acme Events</citation>`,
    )).toBe(`[Acme Events](citation:entity:${UUID})`);

    expect(replaceCitationTags(
      `<citation kind="catalog" id="${UUID}">Rooftop Package</citation>`,
    )).toBe(`[Rooftop Package](citation:catalog:${UUID})`);
  });

  it('leaves unclosed partial tags untouched (streaming safety)', () => {
    const partial = `We looked at <citation kind="deal" id="${UUID}">Hend`;
    expect(replaceCitationTags(partial)).toBe(partial);
  });

  it('rejects unknown kinds', () => {
    const badKind = `<citation kind="invoice" id="${UUID}">Bad</citation>`;
    expect(replaceCitationTags(badKind)).toBe(badKind);
  });

  it('rejects non-uuid ids', () => {
    const badId = `<citation kind="deal" id="not-a-uuid">Bad</citation>`;
    expect(replaceCitationTags(badId)).toBe(badId);
  });

  it('escapes bracket characters in labels so the markdown link is unambiguous', () => {
    const out = replaceCitationTags(
      `<citation kind="deal" id="${UUID}">Event [VIP]</citation>`,
    );
    expect(out).toBe(`[Event \\[VIP\\]](citation:deal:${UUID})`);
  });

  it('handles multiple citations in one message', () => {
    const id2 = '99999999-1111-4aaa-8bbb-ccccdddddddd';
    const out = replaceCitationTags(
      `A: <citation kind="deal" id="${UUID}">One</citation>, B: <citation kind="entity" id="${id2}">Two</citation>`,
    );
    expect(out).toBe(`A: [One](citation:deal:${UUID}), B: [Two](citation:entity:${id2})`);
  });

  it('caps labels at 80 characters (prevents giant pills)', () => {
    const longLabel = 'x'.repeat(200);
    const input = `<citation kind="deal" id="${UUID}">${longLabel}</citation>`;
    // Label longer than 80 chars fails the capture group — so the tag passes
    // through untouched. This is deliberate: Sonnet should respect the 60-char
    // limit, but any run-away is quarantined visually, not turned into a huge
    // pill.
    expect(replaceCitationTags(input)).toBe(input);
  });
});

describe('parseCitationHref', () => {
  it('parses a well-formed citation href', () => {
    const result = parseCitationHref(`citation:deal:${UUID}`);
    expect(result).toEqual({ kind: 'deal', id: UUID });
  });

  it('returns null for normal URLs', () => {
    expect(parseCitationHref('https://example.com')).toBeNull();
    expect(parseCitationHref('/productions')).toBeNull();
    expect(parseCitationHref('mailto:a@b.c')).toBeNull();
  });

  it('returns null for undefined/empty input', () => {
    expect(parseCitationHref(undefined)).toBeNull();
    expect(parseCitationHref('')).toBeNull();
  });

  it('rejects unknown kinds', () => {
    expect(parseCitationHref(`citation:invoice:${UUID}`)).toBeNull();
  });

  it('rejects non-uuid ids', () => {
    expect(parseCitationHref(`citation:deal:not-a-uuid`)).toBeNull();
  });
});
