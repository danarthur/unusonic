/**
 * Auto-responder classification (RFC 3834 + industry-standard heuristics).
 *
 * Inbound email that is an out-of-office, vacation responder, bounce, or
 * bulk mailing should land on the thread (so the user can see "Ally is
 * OOO until 3/15") but be visually muted and skip notifications, Aion
 * urgency classification, and follow-up auto-resolution. This module is
 * the single source of truth for that classification.
 *
 * Header priority order (first match wins, ordered by reliability):
 *   1. Auto-Submitted (RFC 3834 canonical, most-trusted)
 *   2. X-Autoreply / X-Autorespond / X-Auto-Response-Suppress (vendor-specific)
 *   3. Precedence: bulk|list|junk|auto_reply (legacy mailing-list standard)
 *   4. List-Unsubscribe / List-Id (bulk-mail RFC 2369)
 *   5. Return-Path: null / mailer-daemon / bounce patterns (DSN)
 *   6. From local-part heuristics (noreply, mailer-daemon, postmaster)
 *   7. Subject prefix heuristics (Out of Office:, Auto-reply:, etc.)
 *
 * Field Expert's Q3 finding: missing this class of filter is the #1 user
 * complaint on Day 1 of any CRM email feature. 5-15% of inbound in a busy
 * workspace is auto-responder garbage. Marcus (pilot user, User Advocate)
 * was explicit: "Monday morning, 30 OOO notifications, I disable
 * notifications, I miss the real one, dead."
 *
 * @module app/api/webhooks/postmark/__lib__/auto-reply
 */

type HeaderLookup = (name: string) => string | null;

export type AutoReplyClassification = {
  isAutoReply: boolean;
  /** Short machine-readable reason, suitable for DB column + analytics. */
  reason: string | null;
};

/**
 * Classify an inbound email as auto-reply or not.
 *
 * @param getHeader case-insensitive header lookup (returns null if missing)
 * @param fromAddress lowercase email address of the sender, or null
 * @param subject message subject line, or null
 */
export function classifyAutoReply(
  getHeader: HeaderLookup,
  fromAddress: string | null,
  subject: string | null,
): AutoReplyClassification {
  // 1. Auto-Submitted (RFC 3834). Authoritative.
  //    Values: "no" (human) | "auto-generated" | "auto-replied" | "auto-notified"
  const autoSubmitted = getHeader('auto-submitted')?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') {
    return { isAutoReply: true, reason: `auto-submitted:${autoSubmitted}` };
  }

  // 2. Vendor-specific automation markers.
  if (getHeader('x-autoreply')) {
    return { isAutoReply: true, reason: 'x-autoreply' };
  }
  if (getHeader('x-autorespond')) {
    return { isAutoReply: true, reason: 'x-autorespond' };
  }
  const autoSuppress = getHeader('x-auto-response-suppress');
  if (autoSuppress && /all|oof|autoreply/i.test(autoSuppress)) {
    return { isAutoReply: true, reason: 'x-auto-response-suppress' };
  }

  // 3. Precedence (legacy). Values include bulk, list, junk, auto_reply.
  const precedence = getHeader('precedence')?.trim().toLowerCase();
  if (precedence && /^(bulk|list|junk|auto_reply)$/.test(precedence)) {
    return { isAutoReply: true, reason: `precedence:${precedence}` };
  }

  // 4. Bulk mail via List-Unsubscribe / List-Id. A real conversational
  //    reply almost never carries these.
  if (getHeader('list-unsubscribe') || getHeader('list-id')) {
    return { isAutoReply: true, reason: 'list-header' };
  }

  // 5. Return-Path: null or mailer-daemon / bounce.
  const returnPath = getHeader('return-path')?.trim().toLowerCase();
  if (returnPath === '<>' || returnPath === '') {
    return { isAutoReply: true, reason: 'return-path:null' };
  }
  if (returnPath && /mailer-daemon|bounce|postmaster|noreply|no-reply/.test(returnPath)) {
    return { isAutoReply: true, reason: 'return-path:bounce' };
  }

  // 6. From local-part heuristics.
  if (fromAddress) {
    const local = fromAddress.split('@')[0]?.toLowerCase() ?? '';
    // Common automation local-parts. Match exact or prefix (postmaster-bounce@…).
    const automationLocals = [
      'mailer-daemon',
      'postmaster',
      'noreply',
      'no-reply',
      'do-not-reply',
      'donotreply',
      'auto-reply',
      'bounce',
      'bounces',
    ];
    if (automationLocals.some((al) => local === al || local.startsWith(al + '-') || local.startsWith(al + '.'))) {
      return { isAutoReply: true, reason: `from-local:${local}` };
    }
  }

  // 7. Subject prefix heuristics. Multi-locale subset — English covers the
  //    pilot; extend when non-English pilots onboard.
  if (subject) {
    const normalizedSubject = subject.trim();
    const subjectPatterns: Array<[RegExp, string]> = [
      [/^(out of office|out of the office|automatic reply|auto-reply|auto reply|autoresponder|vacation reply|away from office|away from my desk)[\s:]/i, 'subject:oof-en'],
      [/^abwesenheitsnotiz[\s:]/i, 'subject:oof-de'],
      [/^(réponse automatique|absent du bureau)[\s:]/i, 'subject:oof-fr'],
      [/^(respuesta automática|ausente de la oficina)[\s:]/i, 'subject:oof-es'],
      [/^delivery (status|failure)/i, 'subject:dsn'],
      [/^undeliver(ed|able)/i, 'subject:dsn'],
      [/^mail delivery failed/i, 'subject:dsn'],
    ];
    for (const [pattern, reason] of subjectPatterns) {
      if (pattern.test(normalizedSubject)) {
        return { isAutoReply: true, reason };
      }
    }
  }

  return { isAutoReply: false, reason: null };
}
