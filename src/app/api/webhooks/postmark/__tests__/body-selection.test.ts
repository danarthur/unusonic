/**
 * Regression tests for inbound body selection.
 *
 * Root-cause case: Gmail's default compose sends multipart email with an
 * HTML part and a whitespace-only plain-text part. Postmark faithfully
 * passes through that empty-looking TextBody and an empty StrippedTextReply.
 * The original handler used `StrippedTextReply ?? TextBody ?? null`, which
 * doesn't fall through empty strings — so body_text landed as "" in the DB
 * and the Replies card's `{message.bodyText && ...}` check rendered
 * nothing. Discovered 2026-04-24 during the first real-thread round-trip
 * test on ops.message_threads id 1b0d97d7-5ffe-4658-8dff-c21d62f88700.
 *
 * These tests pin the cascade behaviour so empty-string passes never
 * silently kill the Replies card again.
 *
 * @module app/api/webhooks/postmark/__tests__/body-selection
 */

import { describe, expect, it } from 'vitest';
import { selectInboundBodyText, type PostmarkInboundPayload } from '../__lib__/body-selection';

const stub = (overrides: Partial<PostmarkInboundPayload>): PostmarkInboundPayload => ({
  ...overrides,
});

describe('selectInboundBodyText', () => {
  it('prefers StrippedTextReply when present and non-empty', () => {
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: 'Just the reply.',
        TextBody: 'Just the reply.\n\nOn Fri, Apr 24 Daniel wrote:\n> previous',
        HtmlBody: '<p>Just the reply.</p>',
      }),
    );
    expect(result).toBe('Just the reply.');
  });

  it('falls through to TextBody when StrippedTextReply is empty string', () => {
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '',
        TextBody: 'Full body here.',
        HtmlBody: '<p>Full body here.</p>',
      }),
    );
    expect(result).toBe('Full body here.');
  });

  it('falls through to TextBody when StrippedTextReply is whitespace-only', () => {
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '   \n\r\t  ',
        TextBody: 'Actual content.',
      }),
    );
    expect(result).toBe('Actual content.');
  });

  it('falls through to HTML-derived text when both text fields are empty (Gmail HTML-only)', () => {
    // The real-world Test C payload shape — Gmail composer default.
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '',
        TextBody: '',
        HtmlBody: '<html><body><p>hello from gmail</p><br/><p>second line</p></body></html>',
      }),
    );
    expect(result).not.toBe('');
    expect(result).not.toBeNull();
    expect(result).toContain('hello from gmail');
    expect(result).toContain('second line');
  });

  it('falls through to HTML-derived text when text fields are whitespace-only', () => {
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '\n\r',
        TextBody: '   ',
        HtmlBody: '<p>meaningful content</p>',
      }),
    );
    expect(result).toBe('meaningful content');
  });

  it('returns null when every body field is missing', () => {
    expect(selectInboundBodyText(stub({}))).toBeNull();
  });

  it('returns null when every body field is empty or whitespace', () => {
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '',
        TextBody: '  ',
        HtmlBody: '',
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when HtmlBody contains only markup (no visible text)', () => {
    // A purely structural HTML payload with no text nodes should not emit
    // a stray empty string — the Replies card conditional would then still
    // render nothing, but body_text === null is the documented contract
    // the UI expects for "nothing to show."
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: '',
        TextBody: '',
        HtmlBody: '<div><br/></div>',
      }),
    );
    expect(result).toBeNull();
  });

  it('never returns an empty string when any body field has content', () => {
    // Stress test — for each field individually, verify the selector
    // produces a non-empty string result.
    const cases: Array<Partial<PostmarkInboundPayload>> = [
      { StrippedTextReply: 'a' },
      { TextBody: 'b' },
      { HtmlBody: '<p>c</p>' },
    ];
    for (const payload of cases) {
      const result = selectInboundBodyText(stub(payload));
      expect(result).not.toBe('');
      expect(result?.length).toBeGreaterThan(0);
    }
  });

  it('prefers plain-text stages even when HtmlBody is much richer', () => {
    // If the sender provided a deliberate plain-text part, keep it —
    // don't second-guess by deriving from HTML. Keeps Aion classification
    // stable across senders.
    const result = selectInboundBodyText(
      stub({
        StrippedTextReply: 'confirmed',
        TextBody: 'confirmed with history\n> quoted',
        HtmlBody: '<html>...lots of markup... <p>confirmed with history</p>',
      }),
    );
    expect(result).toBe('confirmed');
  });
});
