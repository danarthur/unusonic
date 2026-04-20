/**
 * Resend Webhook Handler
 *
 * Handles Resend webhook events. Register in Resend dashboard:
 * https://resend.com/webhooks → POST to {APP_URL}/api/webhooks/resend
 *
 * Events handled:
 *   • domain.updated       — sync sending_domain_status onto public.workspaces
 *   • email.delivered      — stamp delivered_at on proposal/crew/messages
 *   • email.bounced        — stamp bounced_at on proposal/crew/messages
 *   • email.opened         — stamp opened_at on messages
 *   • email.clicked        — stamp clicked_at on messages
 *   • inbound (email)      — parse + call ops.record_inbound_message RPC
 *
 * Inbound parsing requires:
 *   - MX record on replies.unusonic.com pointing at Resend's inbound endpoint
 *   - DKIM / SPF / DMARC on replies.unusonic.com
 *   - Per-thread alias `thread-{uuid}@replies.unusonic.com` used as Reply-To
 *     on every outbound message we send (see ops.record_outbound_message_draft)
 *
 * Secrets: RESEND_WEBHOOK_SECRET is required. Verified via x-resend-secret
 * header with timingSafeEqual. Never open-access in any environment.
 *
 * @module app/api/webhooks/resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

const VALID_DOMAIN_STATUSES = ['not_started', 'pending', 'verified', 'temporary_failure', 'failure'];

// Resend's inbound-email event name isn't fully pinned in the public docs;
// accept a couple of plausible spellings so a minor rename on their side
// doesn't silently drop inbound. Confirm against the current docs during
// the staging rollout and tighten this list.
const INBOUND_EVENT_TYPES = new Set(['email.inbound', 'inbound.received', 'email.received']);

// Our Reply-To alias format on outbound. Inbound parsing resolves the thread
// id from whichever `to` address matches this pattern.
const THREAD_ALIAS_RE = /^thread-([0-9a-f-]{36})@replies\.unusonic\.com$/i;

type ResendWebhookBody = {
  type: string;
  data: Record<string, unknown>;
};

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const providedSecret = req.headers.get('x-resend-secret');
  if (!providedSecret) return false;
  try {
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    body = (await req.json()) as ResendWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getSystemClient();

  // ── Domain verification status sync ──
  if (body.type === 'domain.updated') {
    const resendDomainId = body.data?.id as string | undefined;
    const status = body.data?.status as string | undefined;
    if (resendDomainId && status && VALID_DOMAIN_STATUSES.includes(status)) {
      await supabase
        .from('workspaces')
        .update({ sending_domain_status: status })
        .eq('resend_domain_id', resendDomainId);
      revalidatePath('/settings/email');
    }
    return NextResponse.json({ received: true });
  }

  // ── Email delivery / tracking status ──
  //
  // A resend email_id is provider-globally unique, so it belongs to at most
  // one upstream record. Any of the following readers may match:
  //   • proposals (legacy proposal email tracking)
  //   • crew_comms_log (day-sheet sends)
  //   • ops.messages (the new Replies outbound path)
  if (
    body.type === 'email.delivered'
    || body.type === 'email.bounced'
    || body.type === 'email.opened'
    || body.type === 'email.clicked'
  ) {
    const emailId = body.data?.email_id as string | undefined;
    if (!emailId) return NextResponse.json({ received: true });

    const now = new Date().toISOString();

    // ops.messages: uniform stamp by event type. Safe to UPDATE with no WHERE
    // match — no-op if this email_id doesn't belong to a messages row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opsClient: any = (supabase as any).schema('ops');
    if (body.type === 'email.delivered') {
      await opsClient.from('messages').update({ delivered_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.bounced') {
      await opsClient.from('messages').update({ bounced_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.opened') {
      await opsClient.from('messages').update({ opened_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.clicked') {
      await opsClient.from('messages').update({ clicked_at: now }).eq('provider_message_id', emailId);
    }

    // Legacy paths: proposal + crew day-sheet tracking only care about
    // delivered/bounced. Opens/clicks don't have a target row there.
    if (body.type === 'email.delivered' || body.type === 'email.bounced') {
      const isDelivered = body.type === 'email.delivered';

      await supabase
        .from('proposals')
        .update(isDelivered ? { email_delivered_at: now } : { email_bounced_at: now })
        .eq('resend_message_id', emailId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sourceRow } = await (supabase as any)
        .schema('ops')
        .from('crew_comms_log')
        .select('id, workspace_id, deal_crew_id, event_id, payload')
        .eq('resend_message_id', emailId)
        .eq('event_type', 'day_sheet_sent')
        .maybeSingle();

      if (sourceRow) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .schema('ops')
          .from('crew_comms_log')
          .insert({
            workspace_id: sourceRow.workspace_id,
            deal_crew_id: sourceRow.deal_crew_id,
            event_id: sourceRow.event_id,
            resend_message_id: emailId,
            channel: 'email',
            event_type: isDelivered ? 'day_sheet_delivered' : 'day_sheet_bounced',
            occurred_at: now,
            summary: isDelivered ? 'Day sheet delivered' : 'Day sheet bounced',
            payload: {
              source_log_id: sourceRow.id,
              recipient_email: sourceRow.payload?.recipient_email ?? null,
            },
          });
      }
    }

    return NextResponse.json({ received: true });
  }

  // ── Inbound email parse ──
  //
  // Resend POSTs a parsed inbound message when our MX on replies.unusonic.com
  // receives mail. We only accept messages to per-thread aliases
  // (thread-{uuid}@replies.unusonic.com) — anything else is out of scope for
  // Phase 1 and returns 200 OK to keep Resend from retrying.
  if (INBOUND_EVENT_TYPES.has(body.type)) {
    const handled = await handleInboundEmail(body.data);
    if (!handled.ok) {
      // Return 200 OK even on non-matching aliases so Resend stops retrying.
      // Log server-side so we can spot misconfigured MX or unknown senders.
      console.warn('[resend webhook] inbound skipped:', handled.reason);
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}

// =============================================================================
// Inbound parse pipeline
// =============================================================================

type InboundPayload = Record<string, unknown>;

type InboundHandleResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

/**
 * Parse a Resend inbound payload and fan out to record_inbound_message.
 *
 * Resend's inbound payload shape is approximately:
 *   {
 *     "email_id":     string,              // provider-unique message id
 *     "from":         { email, name? },    // or raw string
 *     "to":           Array<{ email, name? }> | string[],
 *     "cc":           Array<{ email, name? }> | string[],
 *     "subject":      string,
 *     "text":         string,              // plain body
 *     "html":         string,              // rich body (optional)
 *     "headers":      { "message-id": string, "in-reply-to"?: string, ... },
 *     "attachments":  Array<{ filename, content_type, size, url? }>
 *   }
 *
 * The exact field names aren't fully pinned in public docs, so we defensively
 * read several plausible spellings. Tighten once confirmed in staging.
 */
async function handleInboundEmail(payload: InboundPayload): Promise<InboundHandleResult> {
  const supabase = getSystemClient();

  // 1. Required: provider_message_id + at least one recipient that matches
  //    our per-thread alias pattern.
  const providerMessageId = pickString(payload, ['email_id', 'id', 'message_id']);
  if (!providerMessageId) {
    return { ok: false, reason: 'missing provider message id' };
  }

  const toAddresses = extractAddressList(payload.to);
  const ccAddresses = extractAddressList(payload.cc);
  const allRecipients = [...toAddresses, ...ccAddresses];

  // 2. Match a recipient against thread-{uuid}@replies.unusonic.com.
  let threadId: string | null = null;
  for (const addr of allRecipients) {
    const match = addr.toLowerCase().match(THREAD_ALIAS_RE);
    if (match) {
      threadId = match[1];
      break;
    }
  }

  if (!threadId) {
    return { ok: false, reason: 'no per-thread alias match in recipients' };
  }

  // 3. Resolve workspace + existing deal from the thread. The thread exists
  //    because we generated the alias when we sent the outbound that started
  //    this conversation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: threadRow } = await (supabase as any)
    .schema('ops')
    .from('message_threads')
    .select('id, workspace_id, deal_id, provider_thread_key')
    .eq('id', threadId)
    .maybeSingle();

  if (!threadRow) {
    return { ok: false, reason: `thread not found: ${threadId}` };
  }

  // 4. Build the provider_thread_key. Prefer RFC2822 In-Reply-To / References
  //    root if the headers carry it. Otherwise fall back to the thread's
  //    stored key (so all reply events in this conversation stitch together).
  const headers = (payload.headers ?? {}) as Record<string, unknown>;
  const inReplyTo = pickString(headers, ['in-reply-to', 'In-Reply-To', 'Message-ID']);
  const references = pickString(headers, ['references', 'References']);
  // Normalize: strip `<>`, split at whitespace, take the first non-empty.
  const threadKeyFromHeaders = (references ?? inReplyTo ?? '').replace(/[<>]/g, '').split(/\s+/)[0] || null;
  const providerThreadKey = threadKeyFromHeaders ?? threadRow.provider_thread_key;

  // 5. Compose the RPC payload.
  const fromAddress = extractSingleAddress(payload.from);
  if (!fromAddress) {
    return { ok: false, reason: 'missing from address' };
  }

  const bodyText = pickString(payload, ['text', 'body_text', 'plain']);
  const bodyHtml = pickString(payload, ['html', 'body_html']);
  const subject = pickString(payload, ['subject']);
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  // Phase 1: attachments store metadata-only. Resend provides a url per
  // attachment; we persist that plus filename/mime/size. Phase 1.5 downloads
  // the bytes into workspace-scoped storage and stamps storage_path.
  const attachmentMetadata = attachments
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a) => ({
      filename: pickString(a, ['filename', 'name']) ?? 'attachment',
      mime: pickString(a, ['content_type', 'contentType', 'type']) ?? 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : null,
      content_url: pickString(a, ['url', 'download_url']) ?? null,
    }));

  const rpcPayload = {
    workspace_id: threadRow.workspace_id,
    provider_message_id: providerMessageId,
    provider_thread_key: providerThreadKey,
    channel: 'email',
    subject,
    from_address: fromAddress,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    body_text: bodyText ?? null,
    body_html: bodyHtml ?? null,
    attachments: attachmentMetadata,
    deal_id: threadRow.deal_id,
  };

  // 6. Fire the RPC. Errors here are logged and 200'd back to Resend —
  //    the RPC is idempotent, and persistent retries on our side would
  //    compound provider retries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMessageId, error } = await (supabase as any)
    .schema('ops')
    .rpc('record_inbound_message', { p_payload: rpcPayload });

  if (error) {
    console.error('[resend webhook] record_inbound_message failed:', error.message);
    return { ok: false, reason: `rpc error: ${error.message}` };
  }

  return { ok: true, messageId: newMessageId as string };
}

// =============================================================================
// Small helpers — defensive readers for Resend's payload shape
// =============================================================================

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Extract a single email address from a "from" field. Resend may shape it as:
 *   - "name <email@example.com>"
 *   - { email: "email@example.com", name?: "Name" }
 *   - "email@example.com"
 */
function extractSingleAddress(from: unknown): string | null {
  if (!from) return null;
  if (typeof from === 'string') {
    const m = from.match(/<([^>]+)>/);
    return (m ? m[1] : from).trim().toLowerCase() || null;
  }
  if (typeof from === 'object' && 'email' in from) {
    const email = (from as { email?: unknown }).email;
    return typeof email === 'string' ? email.trim().toLowerCase() : null;
  }
  return null;
}

/**
 * Extract an array of email addresses from a "to"/"cc" field. Handles:
 *   - Array<{ email, name? }>
 *   - Array<string> (plain emails or "name <email>" strings)
 *   - string (single "name <email>")
 */
function extractAddressList(field: unknown): string[] {
  if (!field) return [];
  if (typeof field === 'string') {
    const addr = extractSingleAddress(field);
    return addr ? [addr] : [];
  }
  if (!Array.isArray(field)) return [];
  const out: string[] = [];
  for (const entry of field) {
    const addr = extractSingleAddress(entry);
    if (addr) out.push(addr);
  }
  return out;
}
