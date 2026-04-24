/**
 * Thread-key extraction tests — RFC 2822 header cascade.
 *
 * Regression coverage for the 2026-04-24 pre-hardening bug where the
 * handler took `[0]` from `References` (oldest ancestor), which fails
 * once a thread grows beyond one round-trip.
 *
 * @module app/api/webhooks/postmark/__tests__/thread-key
 */

import { describe, expect, it } from 'vitest';
import { extractThreadKey } from '../__lib__/thread-key';

const makeHeaders = (pairs: Record<string, string>) => {
  const map = new Map(Object.entries(pairs).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => map.get(name.toLowerCase()) ?? null;
};

describe('extractThreadKey — In-Reply-To (primary)', () => {
  it('returns the single Message-ID from In-Reply-To', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<unusonic-proposal-abc123@mail.unusonic.com>',
    }));
    expect(result).toBe('unusonic-proposal-abc123@mail.unusonic.com');
  });

  it('strips angle brackets', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<CAABC123+xyz@gmail.com>',
    }));
    expect(result).toBe('CAABC123+xyz@gmail.com');
  });

  it('handles whitespace around the bracketed id', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '   <id-with-space@example.com>   ',
    }));
    expect(result).toBe('id-with-space@example.com');
  });
});

describe('extractThreadKey — References (secondary, LAST id)', () => {
  it('returns the LAST Message-ID when References has multiple (the immediate parent)', () => {
    // This is the key regression — pre-fix code returned the FIRST id,
    // which is the root/oldest ancestor. The latest entry is the message
    // the reply was composed against.
    const result = extractThreadKey(makeHeaders({
      References:
        '<unusonic-proposal-abc@mail.unusonic.com> ' +
        '<client-reply-1@gmail.com> ' +
        '<unusonic-reply-2@mail.unusonic.com> ' +
        '<client-reply-3@gmail.com>',
    }));
    expect(result).toBe('client-reply-3@gmail.com');
  });

  it('handles the Outlook desktop case where References has prepended ancestors', () => {
    const result = extractThreadKey(makeHeaders({
      References:
        '<prepended-outlook-ancestor@outlook.com> <unusonic-proposal-abc@mail.unusonic.com> <real-parent@corp.com>',
    }));
    expect(result).toBe('real-parent@corp.com');
  });

  it('falls back to In-Reply-To before References when both exist', () => {
    // RFC precedence: In-Reply-To is the authoritative pointer.
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<direct-parent@example.com>',
      References:
        '<ancestor-a@example.com> <ancestor-b@example.com> <direct-parent@example.com>',
    }));
    expect(result).toBe('direct-parent@example.com');
  });

  it('handles References split across newlines (common in headers)', () => {
    const result = extractThreadKey(makeHeaders({
      References:
        '<a@example.com>\r\n <b@example.com>\r\n <c@example.com>',
    }));
    expect(result).toBe('c@example.com');
  });

  it('handles single-id References', () => {
    const result = extractThreadKey(makeHeaders({
      References: '<only-ancestor@example.com>',
    }));
    expect(result).toBe('only-ancestor@example.com');
  });
});

describe('extractThreadKey — Message-ID (last-resort)', () => {
  it('falls back to Message-ID when no In-Reply-To or References', () => {
    const result = extractThreadKey(makeHeaders({
      'Message-ID': '<new-thread-root@gmail.com>',
    }));
    expect(result).toBe('new-thread-root@gmail.com');
  });

  it('does not use Message-ID when In-Reply-To is present', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<parent@example.com>',
      'Message-ID': '<this-message@example.com>',
    }));
    expect(result).toBe('parent@example.com');
  });

  it('returns null when no thread-identifying header exists', () => {
    const result = extractThreadKey(makeHeaders({
      Subject: 'Hello',
      From: 'sender@example.com',
    }));
    expect(result).toBeNull();
  });
});

describe('extractThreadKey — edge cases', () => {
  it('returns null when In-Reply-To is empty', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '',
    }));
    expect(result).toBeNull();
  });

  it('handles header values without angle brackets (malformed but real)', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': 'bare-id-no-brackets@example.com',
    }));
    expect(result).toBe('bare-id-no-brackets@example.com');
  });

  it('returns null for a single whitespace-only value', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '   ',
      References: '',
      'Message-ID': '  ',
    }));
    expect(result).toBeNull();
  });

  it('ignores malformed brackets like <<<id>>>', () => {
    // Best-effort: strip <> greedily, return the inner value.
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<<<weird@example.com>>>',
    }));
    // Our regex matches <...> where ... has no < or >. So <<<weird@..>>> fails
    // the bracketed match and falls through to "strip <>" — which yields the
    // cleaned id. Either path is acceptable; assert a non-null result.
    expect(result).not.toBeNull();
    expect(result).toContain('weird@example.com');
  });

  it('handles Gmail-style long ids with + and /', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<CAH+EtK3xR/j5pPy_aBcD_1234@mail.gmail.com>',
    }));
    expect(result).toBe('CAH+EtK3xR/j5pPy_aBcD_1234@mail.gmail.com');
  });
});

describe('extractThreadKey — real-world payload shapes', () => {
  it('Gmail fresh-compose-to-alias (the 2026-04-24 pilot test case)', () => {
    // User sent a brand-new email to thread-<uuid>@replies.unusonic.com
    // from Gmail's default composer. No reply context, just a fresh
    // Message-ID. Pre-fix, the handler used this Message-ID as the
    // provider_thread_key and the RPC created a new thread. Post-fix,
    // the handler resolves thread via alias and this extractor is only
    // used to backfill provider_thread_key if present.
    const result = extractThreadKey(makeHeaders({
      'Message-ID': '<CAMv5Kzc-abc123@mail.gmail.com>',
    }));
    expect(result).toBe('CAMv5Kzc-abc123@mail.gmail.com');
  });

  it('Apple Mail reply — uses In-Reply-To cleanly', () => {
    const result = extractThreadKey(makeHeaders({
      'In-Reply-To': '<AE47E3C9-7F1A-4C89-B9F1-A1B2C3D4E5F6@icloud.com>',
      References:
        '<original@mail.unusonic.com> <AE47E3C9-7F1A-4C89-B9F1-A1B2C3D4E5F6@icloud.com>',
    }));
    expect(result).toBe('AE47E3C9-7F1A-4C89-B9F1-A1B2C3D4E5F6@icloud.com');
  });

  it('Outlook desktop reply-all — References has legit ordering', () => {
    const result = extractThreadKey(makeHeaders({
      References:
        '<root@mail.unusonic.com> <planner-reply@beaumontevents.com> <venue-reply@fairmont.com>',
    }));
    expect(result).toBe('venue-reply@fairmont.com');
  });
});
