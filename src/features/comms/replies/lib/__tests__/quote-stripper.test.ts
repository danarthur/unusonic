/**
 * Quote-stripper tests — cover the happy paths the Replies card v2
 * collapse affordance depends on, plus the edge cases that bit every
 * reference implementation (Gmail multi-line headers, Outlook dividers,
 * non-English still-works-because-no-match, quote-only bodies).
 *
 * @module features/comms/replies/lib/__tests__/quote-stripper
 */

import { describe, expect, it } from 'vitest';
import { splitQuotedReply, countQuotedLines } from '../quote-stripper';

describe('splitQuotedReply — common cases', () => {
  it('returns the full body as visible when no quote delimiter found', () => {
    // This is the StrippedTextReply-worked case. 80% of inbound will hit
    // this branch because Postmark already scrubbed the quotes.
    const result = splitQuotedReply('Thanks for the update! Sounds good.');
    expect(result).toEqual({
      visible: 'Thanks for the update! Sounds good.',
      quoted: null,
    });
  });

  it('returns { visible: "", quoted: null } for null/undefined/empty', () => {
    expect(splitQuotedReply(null)).toEqual({ visible: '', quoted: null });
    expect(splitQuotedReply(undefined)).toEqual({ visible: '', quoted: null });
    expect(splitQuotedReply('')).toEqual({ visible: '', quoted: null });
  });

  it('trims visible when no quoted content', () => {
    expect(splitQuotedReply('   hello world   ').visible).toBe('hello world');
  });
});

describe('splitQuotedReply — Gmail canonical quote header', () => {
  it('splits on "On <date>, <name> <email> wrote:"', () => {
    const body = [
      'Yes — I\'m in!',
      '',
      'On Mon, Apr 22, 2026 at 3:14 PM Ally Chen <ally@example.com> wrote:',
      '>',
      '> Are you free for a call Thursday?',
      '> Let me know!',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe("Yes — I'm in!");
    expect(result.quoted).toContain('On Mon, Apr 22, 2026');
    expect(result.quoted).toContain('Are you free for a call Thursday?');
  });

  it('splits on shorter Apple Mail variant', () => {
    const body = [
      'Yes — I\'m in!',
      '',
      'On Apr 22, 2026, at 3:14 PM, Ally Chen <ally@example.com> wrote:',
      '',
      '> Are you free?',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe("Yes — I'm in!");
    expect(result.quoted).toContain('Ally Chen');
  });

  it('splits on generic "On ... wrote:" fallback', () => {
    const body = ['Great!', '', 'On Tue at 4pm, Pramila wrote:', '', '> proposal attached'].join(
      '\n',
    );
    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Great!');
    expect(result.quoted).toContain('Pramila');
  });
});

describe('splitQuotedReply — Outlook', () => {
  it('splits on "-----Original Message-----" divider', () => {
    const body = [
      'Approved — please proceed with the deposit.',
      '',
      '-----Original Message-----',
      'From: Daniel <daniel@unusonic.com>',
      'Sent: Wednesday, April 22, 2026 2:14 PM',
      'To: procurement@corp.example.com',
      'Subject: Corporate event proposal',
      '',
      'Please see attached proposal for the Q2 event.',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Approved — please proceed with the deposit.');
    expect(result.quoted).toContain('-----Original Message-----');
    expect(result.quoted).toContain('Please see attached proposal');
  });

  it('splits on bare "From:" line (Outlook desktop without divider)', () => {
    const body = [
      'Confirmed.',
      '',
      'From: Daniel Arthur <daniel@unusonic.com>',
      'Sent: Wed Apr 22 2026 14:14',
      'Subject: RE: Corporate event',
      '',
      'Original message text here.',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Confirmed.');
    expect(result.quoted).toContain('From: Daniel Arthur');
  });
});

describe('splitQuotedReply — bare "> " prefix runs', () => {
  it('splits when ≥2 consecutive ">"-prefixed lines exist', () => {
    const body = [
      'Locked it in.',
      '',
      '> Previous message line 1',
      '> Previous message line 2',
      '> Previous message line 3',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Locked it in.');
    expect(result.quoted).toMatch(/^> Previous message line 1/);
  });

  it('does NOT split on a single ">" line (emphasis formatting)', () => {
    const body = [
      'My favorite quote:',
      '',
      '> "code without tests is broken by design" — Jacob Kaplan-Moss',
      '',
      'Agreed!',
    ].join('\n');

    const result = splitQuotedReply(body);
    // Single "> ..." line with non-quoted context around it should NOT split.
    // This is the false-positive guard from the lib comment.
    expect(result.visible).toBe(body.trim());
    expect(result.quoted).toBeNull();
  });
});

describe('splitQuotedReply — thick separator lines', () => {
  it('splits on long "===" run', () => {
    const body = [
      'Final version attached.',
      '',
      '============================================',
      'Prior draft follows',
      '',
      'Draft content here',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Final version attached.');
    expect(result.quoted).toContain('Prior draft follows');
  });

  it('splits on long "___" run', () => {
    const body = [
      'OK on timing.',
      '',
      '________________________________',
      'From an earlier chain',
    ].join('\n');

    const result = splitQuotedReply(body);
    expect(result.visible).toBe('OK on timing.');
  });
});

describe('splitQuotedReply — edge cases', () => {
  it('handles a quote-only body gracefully (no split)', () => {
    const body = [
      'On Mon, Apr 22, Ally wrote:',
      '> earlier message',
      '> more earlier message',
    ].join('\n');

    const result = splitQuotedReply(body);
    // When there's no "visible" content before the quote, return the whole
    // body as visible. UI would collapse nothing — matches Apple Mail
    // behavior for forwards.
    expect(result.quoted).toBeNull();
    expect(result.visible).toBe(body.trim());
  });

  it('handles messages with CRLF line endings', () => {
    const body = 'Yes!\r\n\r\nOn Mon, Pramila <p@e.com> wrote:\r\n> earlier';
    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Yes!');
    expect(result.quoted).toBeDefined();
  });

  it('ignores a quote delimiter inside the visible block', () => {
    // A real delimiter must be standalone on its line. "John said he was on call"
    // shouldn't trigger.
    const body = 'John said he was on call — so I told him wrote: yes we need this.';
    const result = splitQuotedReply(body);
    expect(result.quoted).toBeNull();
  });

  it('preserves inline emoji and unicode', () => {
    const body = 'Yes!! 💕✨\n\nOn Mon, Ally <a@b.com> wrote:\n> are you in?';
    const result = splitQuotedReply(body);
    expect(result.visible).toBe('Yes!! 💕✨');
    expect(result.quoted).toContain('are you in?');
  });

  it('non-English quote header falls through (Phase 1.5 will extend)', () => {
    // "Le 22 Apr 2026 à 15:14, Ally a écrit:" is French — we intentionally
    // don't match non-English yet. Body renders as-is including the quote.
    // Acceptable for Phase 1 per the design doc.
    const body = [
      'Oui!',
      '',
      'Le 22 Apr 2026 à 15:14, Ally a écrit:',
      '> question précédente',
    ].join('\n');

    const result = splitQuotedReply(body);
    // No match → visible is the whole body.
    expect(result.quoted).toBeNull();
    expect(result.visible).toContain('Le 22 Apr 2026');
  });
});

describe('countQuotedLines', () => {
  it('returns 0 for null quoted', () => {
    expect(countQuotedLines(null)).toBe(0);
  });

  it('counts content lines, excluding the delimiter header', () => {
    const quoted = [
      'On Mon, Apr 22, Ally <a@b.com> wrote:',
      '',
      '> line one',
      '> line two',
      '> line three',
    ].join('\n');

    // Should count: "> line one", "> line two", "> line three" = 3
    // Should exclude: the "On ... wrote:" header + empty line
    expect(countQuotedLines(quoted)).toBe(3);
  });

  it('counts Outlook-style quoted body lines', () => {
    const quoted = [
      '-----Original Message-----',
      'From: Daniel <daniel@unusonic.com>',
      'Sent: Wed',
      'Subject: Thing',
      '',
      'Body line 1',
      'Body line 2',
    ].join('\n');

    // Excludes the "-----Original Message-----" divider.
    // Counts: From:, Sent:, Subject:, Body line 1, Body line 2 = 5
    expect(countQuotedLines(quoted)).toBe(5);
  });

  it('handles empty quoted string', () => {
    expect(countQuotedLines('')).toBe(0);
  });
});
