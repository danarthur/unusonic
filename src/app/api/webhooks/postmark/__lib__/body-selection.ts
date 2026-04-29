/**
 * Postmark inbound payload types + body-selection cascade.
 *
 * Lifted out of `../route.ts` so the Next.js auto-generated route-type
 * checker doesn't complain about non-handler exports living next to a
 * `POST` handler. Importable by both the route handler and the test
 * fixtures.
 */

import { toPlainText } from '@react-email/render';

// =============================================================================
// Payload types
// =============================================================================

type PostmarkAddress = {
  Email?: string;
  Name?: string;
  MailboxHash?: string;
};

type PostmarkHeader = { Name?: string; Value?: string };

type PostmarkAttachment = {
  Name?: string;
  Content?: string;
  ContentType?: string;
  ContentLength?: number;
  ContentID?: string;
};

export type PostmarkInboundPayload = {
  MessageID?: string;
  MessageStream?: string;
  From?: string;
  FromName?: string;
  FromFull?: PostmarkAddress;
  To?: string;
  ToFull?: PostmarkAddress[];
  Cc?: string;
  CcFull?: PostmarkAddress[];
  OriginalRecipient?: string;
  Subject?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  /** Quote-stripped reply text — industry-reference parser output. Prefer
   *  this over TextBody for Aion classification in Phase 1.5 so the
   *  classifier sees only the new message, not the full quoted thread. */
  StrippedTextReply?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
};

// =============================================================================
// Body selection
// =============================================================================

/**
 * Selects the best plain-text body for an inbound Postmark payload.
 *
 * Cascade, in order of quality:
 *   1. StrippedTextReply — Postmark's quote-stripped reply. Best for
 *      in-card preview and Aion classification (sees only the new message).
 *   2. TextBody — full plain-text body from the sender.
 *   3. toPlainText(HtmlBody) — derived fallback for HTML-only emails.
 *      Gmail's default compose sends multipart with an HTML part and a
 *      WHITESPACE-ONLY plain-text part, which would otherwise land as ""
 *      in body_text and the Replies card's `{message.bodyText && ...}`
 *      check renders nothing. Discovered 2026-04-24 during Test C.
 *
 * Uses `||` not `??` so empty strings cascade. Trim each stage.
 */
export function selectInboundBodyText(payload: PostmarkInboundPayload): string | null {
  return (
    payload.StrippedTextReply?.trim() ||
    payload.TextBody?.trim() ||
    (payload.HtmlBody ? toPlainText(payload.HtmlBody).trim() || null : null)
  );
}
