/**
 * Auto-reply classification tests — RFC 3834 + heuristic coverage.
 *
 * Each test stubs a minimal header map and checks classification + reason.
 * The reason strings are stable DB values (written to ops.messages.auto_reply_reason)
 * and get surfaced in the Unmatched Replies page, so they're asserted
 * exactly, not loosely.
 *
 * @module app/api/webhooks/postmark/__tests__/auto-reply
 */

import { describe, expect, it } from 'vitest';
import { classifyAutoReply } from '../__lib__/auto-reply';

const makeHeaders = (pairs: Record<string, string>) => {
  const map = new Map(Object.entries(pairs).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => map.get(name.toLowerCase()) ?? null;
};

describe('classifyAutoReply — RFC 3834 Auto-Submitted (primary)', () => {
  it('flags Auto-Submitted: auto-replied (Gmail vacation responder)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Auto-Submitted': 'auto-replied' }),
      'ally@example.com',
      'Re: Chen/Patel wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'auto-submitted:auto-replied' });
  });

  it('flags Auto-Submitted: auto-generated (system-generated digest)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Auto-Submitted': 'auto-generated' }),
      'digest@example.com',
      'Daily summary',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'auto-submitted:auto-generated' });
  });

  it('does NOT flag Auto-Submitted: no (explicit human message)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Auto-Submitted': 'no' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: false, reason: null });
  });

  it('is case-insensitive on value', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Auto-Submitted': 'AUTO-REPLIED' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result.isAutoReply).toBe(true);
  });
});

describe('classifyAutoReply — vendor-specific automation markers', () => {
  it('flags X-Autoreply: yes (cPanel vacation)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'X-Autoreply': 'yes' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'x-autoreply' });
  });

  it('flags X-Autorespond presence (older autoresponders)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'X-Autorespond': 'out-of-office' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'x-autorespond' });
  });

  it('flags X-Auto-Response-Suppress: All (Exchange/O365)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'X-Auto-Response-Suppress': 'All' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'x-auto-response-suppress' });
  });

  it('flags X-Auto-Response-Suppress: OOF (Outlook)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'X-Auto-Response-Suppress': 'OOF' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result.isAutoReply).toBe(true);
  });
});

describe('classifyAutoReply — Precedence (legacy)', () => {
  it('flags Precedence: bulk', () => {
    const result = classifyAutoReply(
      makeHeaders({ Precedence: 'bulk' }),
      'newsletter@example.com',
      'Weekly digest',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'precedence:bulk' });
  });

  it('flags Precedence: list (mailing list)', () => {
    const result = classifyAutoReply(
      makeHeaders({ Precedence: 'list' }),
      'list@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'precedence:list' });
  });

  it('flags Precedence: auto_reply', () => {
    const result = classifyAutoReply(
      makeHeaders({ Precedence: 'auto_reply' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'precedence:auto_reply' });
  });

  it('ignores unknown Precedence values', () => {
    const result = classifyAutoReply(
      makeHeaders({ Precedence: 'normal' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result.isAutoReply).toBe(false);
  });
});

describe('classifyAutoReply — List-* headers (bulk mail)', () => {
  it('flags List-Unsubscribe presence (any value)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'List-Unsubscribe': '<mailto:unsub@example.com>' }),
      'marketing@example.com',
      'Special offer',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'list-header' });
  });

  it('flags List-Id presence', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'List-Id': '<announce.example.com>' }),
      'announce@example.com',
      'Announcement',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'list-header' });
  });
});

describe('classifyAutoReply — Return-Path / bounce patterns', () => {
  it('flags null Return-Path (<>)', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Return-Path': '<>' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'return-path:null' });
  });

  it('flags Return-Path with mailer-daemon', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Return-Path': '<mailer-daemon@example.com>' }),
      'mailer-daemon@example.com',
      'Delivery Status Notification',
    );
    // From local-part matches first; assert either mechanism flags.
    expect(result.isAutoReply).toBe(true);
  });

  it('flags Return-Path with bounce prefix', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Return-Path': '<bounces+abc123@example.com>' }),
      'sender@example.com',
      'Subject',
    );
    expect(result.isAutoReply).toBe(true);
    expect(result.reason).toBe('return-path:bounce');
  });
});

describe('classifyAutoReply — From local-part heuristics', () => {
  it('flags mailer-daemon sender', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'mailer-daemon@gmail.com',
      'Undeliverable',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'from-local:mailer-daemon' });
  });

  it('flags noreply sender', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'noreply@example.com',
      'Confirmation',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'from-local:noreply' });
  });

  it('flags no-reply sender', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'no-reply@example.com',
      'Confirmation',
    );
    expect(result).toEqual({ isAutoReply: true, reason: 'from-local:no-reply' });
  });

  it('flags donotreply variants', () => {
    const variants = ['donotreply', 'do-not-reply'];
    for (const local of variants) {
      const result = classifyAutoReply(makeHeaders({}), `${local}@example.com`, 'Subject');
      expect(result.isAutoReply, `expected ${local} to flag`).toBe(true);
    }
  });

  it('flags postmaster sender', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'postmaster@example.com',
      'Subject',
    );
    expect(result.isAutoReply).toBe(true);
  });

  it('flags prefixed automation locals (bounces-abc@...)', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'bounces-abc123@mail.example.com',
      'Subject',
    );
    expect(result.isAutoReply).toBe(true);
  });

  it('does NOT flag a legitimate sender whose local-part contains "no"', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'noah.taylor@example.com',
      'Re: wedding',
    );
    expect(result.isAutoReply).toBe(false);
  });
});

describe('classifyAutoReply — Subject prefix heuristics', () => {
  it.each([
    ['Out of Office: until Monday', 'subject:oof-en'],
    ['Out of the Office: away 3/15–3/22', 'subject:oof-en'],
    ['Automatic reply: Re: wedding', 'subject:oof-en'],
    ['Auto-reply: vacation', 'subject:oof-en'],
    ['Auto reply: thanks for your message', 'subject:oof-en'],
    ['Autoresponder: out of office', 'subject:oof-en'],
    ['Vacation reply: until Friday', 'subject:oof-en'],
    ['Away from office: until 3/15', 'subject:oof-en'],
    ['Away from my desk: back tomorrow', 'subject:oof-en'],
  ])('flags English OOF subject: %s', (subject, expectedReason) => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'ally@example.com',
      subject,
    );
    expect(result).toEqual({ isAutoReply: true, reason: expectedReason });
  });

  it.each([
    ['Abwesenheitsnotiz: bis Montag', 'subject:oof-de'],
    ['Réponse automatique: absent', 'subject:oof-fr'],
    ['Respuesta automática: de vacaciones', 'subject:oof-es'],
  ])('flags non-English OOF subject: %s', (subject, expectedReason) => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'sender@example.com',
      subject,
    );
    expect(result).toEqual({ isAutoReply: true, reason: expectedReason });
  });

  it.each([
    'Delivery Status Notification (Failure)',
    'Delivery failure report',
    'Undelivered Mail Returned to Sender',
    'Undeliverable: subject',
    'Mail Delivery Failed',
  ])('flags DSN subject: %s', (subject) => {
    const result = classifyAutoReply(makeHeaders({}), 'mailer@example.com', subject);
    expect(result.isAutoReply).toBe(true);
    expect(result.reason).toBe('subject:dsn');
  });

  it('does NOT flag real replies that mention OOF in the middle', () => {
    const result = classifyAutoReply(
      makeHeaders({}),
      'ally@example.com',
      'Re: wedding — btw I will be out of office next week',
    );
    expect(result.isAutoReply).toBe(false);
  });
});

describe('classifyAutoReply — authentic human replies stay clean', () => {
  it.each([
    ['Re: Chen/Patel wedding', 'ally@gmail.com'],
    ['Quick question about uplights', 'bride@example.com'],
    ['Fwd: BEO sheet from Fairmont', 'planner@beaumontevents.com'],
    ['yes!! 💕', 'bride@example.com'],
  ])('passes real reply through untouched: %s from %s', (subject, from) => {
    const result = classifyAutoReply(makeHeaders({}), from, subject);
    expect(result).toEqual({ isAutoReply: false, reason: null });
  });

  it('passes through even when every header is missing', () => {
    const result = classifyAutoReply(makeHeaders({}), null, null);
    expect(result).toEqual({ isAutoReply: false, reason: null });
  });
});

describe('classifyAutoReply — priority ordering (first match wins)', () => {
  it('RFC 3834 Auto-Submitted beats from-local heuristic', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'Auto-Submitted': 'auto-replied' }),
      'noreply@example.com',
      'Re: wedding',
    );
    expect(result.reason).toBe('auto-submitted:auto-replied');
  });

  it('X-Autoreply beats Precedence', () => {
    const result = classifyAutoReply(
      makeHeaders({ 'X-Autoreply': 'yes', Precedence: 'bulk' }),
      'ally@example.com',
      'Re: wedding',
    );
    expect(result.reason).toBe('x-autoreply');
  });
});
