/**
 * Realistic Postmark payload fixtures — full normalization smoke test.
 *
 * Each fixture represents a real-world inbound pattern that caused or could
 * cause a bug. Runs all three pure-function normalizers (body, auto-reply,
 * thread-key) against the fixture and asserts the composite result.
 *
 * Does NOT exercise the webhook POST handler or the RPC — those are
 * covered by manual Postmark dashboard smoke tests post-deploy. This file
 * is the fast-feedback loop during development.
 *
 * @module app/api/webhooks/postmark/__tests__/payload-fixtures
 */

import { describe, expect, it } from 'vitest';
import { selectInboundBodyText, type PostmarkInboundPayload } from '../route';
import { classifyAutoReply } from '../__lib__/auto-reply';
import { extractThreadKey } from '../__lib__/thread-key';

function headerLookup(payload: PostmarkInboundPayload) {
  const map = new Map<string, string>();
  for (const h of payload.Headers ?? []) {
    if (h.Name && h.Value) map.set(h.Name.toLowerCase(), h.Value);
  }
  return (name: string) => map.get(name.toLowerCase()) ?? null;
}

// =============================================================================
// Fixture 1 — Gmail default compose, fresh thread-alias (the 2026-04-24 bug case)
// =============================================================================

const gmailFreshCompose: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-01',
  From: 'dja.daniel.arthur@gmail.com',
  FromFull: { Email: 'dja.daniel.arthur@gmail.com', Name: 'Daniel Arthur' },
  To: 'thread-1b0d97d7-5ffe-4658-8dff-c21d62f88700@replies.unusonic.com',
  ToFull: [{ Email: 'thread-1b0d97d7-5ffe-4658-8dff-c21d62f88700@replies.unusonic.com' }],
  OriginalRecipient: 'thread-1b0d97d7-5ffe-4658-8dff-c21d62f88700@replies.unusonic.com',
  Subject: 'Test C — real thread round-trip',
  Date: 'Fri, 24 Apr 2026 02:15:00 +0000',
  // Gmail ships multipart with HTML + empty text part — the root cause of
  // the body-rendering bug fixed in PR #19.
  TextBody: '',
  StrippedTextReply: '',
  HtmlBody:
    '<html><body><div dir="ltr">Testing replies subdomain round-trip.</div>' +
    '<div dir="ltr">Second paragraph.</div></body></html>',
  Headers: [
    { Name: 'Message-ID', Value: '<CAMv5Kzc-abc123@mail.gmail.com>' },
    { Name: 'From', Value: 'Daniel Arthur <dja.daniel.arthur@gmail.com>' },
    { Name: 'Subject', Value: 'Test C — real thread round-trip' },
  ],
};

describe('Fixture 1 — Gmail fresh compose to thread alias', () => {
  it('extracts body from HtmlBody when Text fields are empty', () => {
    const body = selectInboundBodyText(gmailFreshCompose);
    expect(body).not.toBe('');
    expect(body).not.toBeNull();
    expect(body).toContain('Testing replies subdomain');
    expect(body).toContain('Second paragraph');
  });

  it('is not classified as auto-reply', () => {
    const result = classifyAutoReply(
      headerLookup(gmailFreshCompose),
      gmailFreshCompose.From?.toLowerCase() ?? null,
      gmailFreshCompose.Subject ?? null,
    );
    expect(result.isAutoReply).toBe(false);
  });

  it('thread-key extraction falls back to Message-ID (last resort)', () => {
    // No In-Reply-To or References — this IS a fresh compose. Message-ID
    // is the sender\u2019s id for this message, NOT a thread root, so it is
    // returned but the handler should ignore it in favor of the alias.
    const key = extractThreadKey(headerLookup(gmailFreshCompose));
    expect(key).toBe('CAMv5Kzc-abc123@mail.gmail.com');
  });
});

// =============================================================================
// Fixture 2 — Apple Mail threaded reply
// =============================================================================

const appleMailReply: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-02',
  From: 'ally@example.com',
  FromFull: { Email: 'ally@example.com', Name: 'Ally Chen' },
  To: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com',
  ToFull: [{ Email: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com' }],
  Subject: 'Re: Chen/Patel wedding — uplight colors',
  TextBody: "Yes to the third uplight. Let's talk tomorrow!",
  StrippedTextReply: "Yes to the third uplight. Let's talk tomorrow!",
  HtmlBody: '<p>Yes to the third uplight. Let\u2019s talk tomorrow!</p>',
  Headers: [
    { Name: 'Message-ID', Value: '<AE47E3C9-7F1A-4C89@icloud.com>' },
    { Name: 'In-Reply-To', Value: '<unusonic-reply-002@mail.unusonic.com>' },
    {
      Name: 'References',
      Value:
        '<unusonic-proposal-001@mail.unusonic.com> <ally-first-reply@icloud.com> <unusonic-reply-002@mail.unusonic.com>',
    },
  ],
};

describe('Fixture 2 — Apple Mail threaded reply', () => {
  it('uses StrippedTextReply as the body', () => {
    expect(selectInboundBodyText(appleMailReply)).toBe(
      "Yes to the third uplight. Let's talk tomorrow!",
    );
  });

  it('is not classified as auto-reply', () => {
    const result = classifyAutoReply(
      headerLookup(appleMailReply),
      appleMailReply.From ?? null,
      appleMailReply.Subject ?? null,
    );
    expect(result.isAutoReply).toBe(false);
  });

  it('extracts thread-key from In-Reply-To (not the oldest ancestor in References)', () => {
    // Pre-hardening bug: handler took References[0]. That would return
    // the proposal message id (oldest), which doesn't point to the direct
    // parent and breaks reconciliation on threads more than 1 round-trip
    // deep.
    expect(extractThreadKey(headerLookup(appleMailReply))).toBe(
      'unusonic-reply-002@mail.unusonic.com',
    );
  });
});

// =============================================================================
// Fixture 3 — Gmail vacation responder (auto-reply)
// =============================================================================

const gmailVacationOOO: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-03',
  From: 'ally@example.com',
  FromFull: { Email: 'ally@example.com', Name: 'Ally Chen' },
  To: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com',
  ToFull: [{ Email: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com' }],
  Subject: 'Re: Chen/Patel wedding — uplight colors',
  TextBody:
    'Hi, thanks for your email. I am out of the office until April 29th.\n' +
    'I will respond when I return. For urgent matters please contact my assistant Jessica at jessica@example.com.\n\nAlly',
  StrippedTextReply: '',
  Headers: [
    { Name: 'Auto-Submitted', Value: 'auto-replied' },
    { Name: 'X-Autoreply', Value: 'yes' },
    { Name: 'Message-ID', Value: '<ooo-abc@gmail.com>' },
    { Name: 'In-Reply-To', Value: '<unusonic-reply-003@mail.unusonic.com>' },
  ],
};

describe('Fixture 3 — Gmail vacation responder', () => {
  it('falls back to TextBody since StrippedTextReply is empty', () => {
    const body = selectInboundBodyText(gmailVacationOOO);
    expect(body).toContain('out of the office');
  });

  it('is classified as auto-reply (Auto-Submitted wins)', () => {
    const result = classifyAutoReply(
      headerLookup(gmailVacationOOO),
      gmailVacationOOO.From ?? null,
      gmailVacationOOO.Subject ?? null,
    );
    expect(result.isAutoReply).toBe(true);
    expect(result.reason).toBe('auto-submitted:auto-replied');
  });

  it('still extracts thread-key so OOO appears on the right thread', () => {
    const key = extractThreadKey(headerLookup(gmailVacationOOO));
    expect(key).toBe('unusonic-reply-003@mail.unusonic.com');
  });
});

// =============================================================================
// Fixture 4 — MAILER-DAEMON bounce
// =============================================================================

const mailerDaemonBounce: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-04',
  From: 'mailer-daemon@example.com',
  FromFull: { Email: 'mailer-daemon@example.com' },
  To: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com',
  ToFull: [{ Email: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com' }],
  Subject: 'Delivery Status Notification (Failure)',
  TextBody:
    'This is an automatically generated Delivery Status Notification.\n\n' +
    'Delivery to the following recipient has failed permanently:\n  invalid@example.com\n\n' +
    'Technical details of permanent failure:\n  550 5.1.1 The email account does not exist.',
  Headers: [
    { Name: 'Return-Path', Value: '<>' },
    { Name: 'Content-Type', Value: 'multipart/report; report-type=delivery-status' },
    { Name: 'Auto-Submitted', Value: 'auto-generated' },
  ],
};

describe('Fixture 4 — MAILER-DAEMON bounce', () => {
  it('uses TextBody as body', () => {
    const body = selectInboundBodyText(mailerDaemonBounce);
    expect(body).toContain('Delivery Status Notification');
  });

  it('is classified as auto-reply (return-path null + from-local + auto-submitted all trigger)', () => {
    const result = classifyAutoReply(
      headerLookup(mailerDaemonBounce),
      mailerDaemonBounce.From ?? null,
      mailerDaemonBounce.Subject ?? null,
    );
    expect(result.isAutoReply).toBe(true);
    // Priority order: Auto-Submitted wins over from-local and return-path.
    expect(result.reason).toBe('auto-submitted:auto-generated');
  });
});

// =============================================================================
// Fixture 5 — Reply-all with CC (planner joins mid-thread, Marcus's scenario)
// =============================================================================

const planerJoinedReplyAll: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-05',
  From: 'planner@beaumontevents.com',
  FromFull: { Email: 'planner@beaumontevents.com', Name: 'Jessica Beaumont' },
  To: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com',
  ToFull: [
    { Email: 'thread-abc12345-0000-0000-0000-000000000001@replies.unusonic.com' },
    { Email: 'daniel@unusonic.com' },
  ],
  Cc: 'ally@example.com, raj@example.com',
  CcFull: [{ Email: 'ally@example.com' }, { Email: 'raj@example.com' }],
  Subject: 'Re: Chen/Patel wedding — uplight colors',
  TextBody: 'Hi Marcus, I\u2019m the planner for Ally and Raj. Please loop me in going forward.',
  StrippedTextReply: 'Hi Marcus, I\u2019m the planner for Ally and Raj. Please loop me in going forward.',
  Headers: [
    { Name: 'Message-ID', Value: '<planner-first-message@beaumontevents.com>' },
    { Name: 'In-Reply-To', Value: '<unusonic-reply-005@mail.unusonic.com>' },
  ],
};

describe('Fixture 5 — planner joins mid-thread via reply-all', () => {
  it('uses StrippedTextReply as body', () => {
    expect(selectInboundBodyText(planerJoinedReplyAll)).toBe(
      'Hi Marcus, I\u2019m the planner for Ally and Raj. Please loop me in going forward.',
    );
  });

  it('is not auto-reply (legitimate business email)', () => {
    const result = classifyAutoReply(
      headerLookup(planerJoinedReplyAll),
      planerJoinedReplyAll.From ?? null,
      planerJoinedReplyAll.Subject ?? null,
    );
    expect(result.isAutoReply).toBe(false);
  });

  it('threads on In-Reply-To correctly (planner replied to our message)', () => {
    expect(extractThreadKey(headerLookup(planerJoinedReplyAll))).toBe(
      'unusonic-reply-005@mail.unusonic.com',
    );
  });
});

// =============================================================================
// Fixture 6 — Outlook desktop with reordered References
// =============================================================================

const outlookDesktopReply: PostmarkInboundPayload = {
  MessageID: 'postmark-message-id-06',
  From: 'procurement@corp.example.com',
  FromFull: { Email: 'procurement@corp.example.com', Name: 'Corp Procurement' },
  Subject: 'RE: Corporate event proposal',
  TextBody:
    'Approved. Please proceed with the deposit invoice.\r\n\r\n' +
    'From: Daniel <daniel@unusonic.com>\r\nSent: Wednesday, April 22...',
  StrippedTextReply: 'Approved. Please proceed with the deposit invoice.',
  Headers: [
    { Name: 'Message-ID', Value: '<outlook-corporate-abc@corp.example.com>' },
    { Name: 'In-Reply-To', Value: '<unusonic-proposal-corp-002@mail.unusonic.com>' },
    {
      Name: 'References',
      // Outlook desktop sometimes prepends old thread ancestors. Last is parent.
      Value:
        '<unrelated-prepended@outlook.com> ' +
        '<unusonic-proposal-corp-001@mail.unusonic.com> ' +
        '<corp-first-reply@corp.example.com> ' +
        '<unusonic-proposal-corp-002@mail.unusonic.com>',
    },
  ],
};

describe('Fixture 6 — Outlook desktop with reordered References', () => {
  it('StrippedTextReply correctly drops the quoted "From:" block', () => {
    expect(selectInboundBodyText(outlookDesktopReply)).toBe(
      'Approved. Please proceed with the deposit invoice.',
    );
  });

  it('thread-key uses In-Reply-To (authoritative parent pointer)', () => {
    expect(extractThreadKey(headerLookup(outlookDesktopReply))).toBe(
      'unusonic-proposal-corp-002@mail.unusonic.com',
    );
  });

  it('if In-Reply-To were absent, References LAST id would be correct', () => {
    const withoutInReplyTo: PostmarkInboundPayload = {
      ...outlookDesktopReply,
      Headers: outlookDesktopReply.Headers?.filter((h) => h.Name?.toLowerCase() !== 'in-reply-to'),
    };
    expect(extractThreadKey(headerLookup(withoutInReplyTo))).toBe(
      'unusonic-proposal-corp-002@mail.unusonic.com',
    );
  });
});
