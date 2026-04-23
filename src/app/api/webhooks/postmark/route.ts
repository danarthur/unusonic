/**
 * Postmark Inbound Webhook Handler
 *
 * Handles inbound email parsing for the Replies feature. Register in Postmark:
 *   Inbound Server → Settings → Webhook URL:
 *     https://{user}:{pass}@{APP_URL}/api/webhooks/postmark
 *
 * Postmark authenticates via HTTP Basic Auth on the URL. The credentials
 * live in POSTMARK_WEBHOOK_USERNAME and POSTMARK_WEBHOOK_PASSWORD and are
 * verified with timingSafeEqual before any DB access.
 *
 * Architecture context — we chose Postmark for inbound (keeping Resend for
 * outbound) after a three-agent research pass on 2026-04-20. Rationale:
 *   - Resend inbound was still pre-GA; our earlier Resend handler shipped
 *     with a 3-candidate event-name fallback set, which was the confession
 *     that we didn't trust Resend's contract.
 *   - Postmark Inbound has been GA for ~10 years with a frozen payload
 *     shape, industry-reference quote-stripped reply parsing
 *     (StrippedTextReply), and no SLA ambiguity.
 *   - The follow-up engine's silent-drop failure mode on Resend inbound
 *     would have fired nagging 8am nudges on already-replied deals —
 *     the exact "Unusonic is theater" failure the design doc is built
 *     to prevent.
 *
 * The webhook handler is an adapter: it normalizes Postmark's payload
 * into the jsonb shape `ops.record_inbound_message` expects, then delegates.
 * Vendor swap is a file + DNS flip, not a rebuild. See
 * docs/reference/replies-design.md §4.2.
 *
 * @module app/api/webhooks/postmark
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';
import { enqueueMessageEmbedding } from '@/app/api/aion/lib/embeddings';

export const runtime = 'nodejs';

// Our Reply-To alias format on outbound (same as before — thread identity
// is vendor-agnostic). Inbound parsing resolves the thread id from whichever
// recipient address matches this pattern.
const THREAD_ALIAS_RE = /^thread-([0-9a-f-]{36})@replies\.unusonic\.com$/i;

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

type PostmarkInboundPayload = {
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

function verifyBasicAuth(req: NextRequest): boolean {
  const username = process.env.POSTMARK_WEBHOOK_USERNAME;
  const password = process.env.POSTMARK_WEBHOOK_PASSWORD;
  // Require both credentials. Never open-access in any environment.
  if (!username || !password) return false;

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) return false;

  try {
    const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf-8');
    const sep = decoded.indexOf(':');
    if (sep === -1) return false;
    const providedUser = decoded.slice(0, sep);
    const providedPass = decoded.slice(sep + 1);
    const userOk = timingSafeEqual(Buffer.from(providedUser), Buffer.from(username));
    const passOk = timingSafeEqual(Buffer.from(providedPass), Buffer.from(password));
    return userOk && passOk;
  } catch {
    // Buffer length mismatch → not equal. Malformed header → reject.
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyBasicAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = (await req.json()) as PostmarkInboundPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Always 200 on structural failures — Postmark retries on 4xx/5xx for ~12h
  // and we don't want retry storms on misconfigured aliases.
  const result = await handleInboundEmail(payload);
  if (!result.ok) {
    console.warn('[postmark webhook] inbound skipped:', result.reason);
  }
  return NextResponse.json({ received: true });
}

// =============================================================================
// Inbound parse pipeline
// =============================================================================

type InboundHandleResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

async function handleInboundEmail(payload: PostmarkInboundPayload): Promise<InboundHandleResult> {
  const providerMessageId = payload.MessageID;
  if (!providerMessageId) {
    return { ok: false, reason: 'missing MessageID' };
  }

  // 1. Collect all recipients and find the per-thread alias.
  const toAddresses = (payload.ToFull ?? []).map((a) => a.Email?.toLowerCase()).filter((a): a is string => !!a);
  const ccAddresses = (payload.CcFull ?? []).map((a) => a.Email?.toLowerCase()).filter((a): a is string => !!a);
  const originalRecipient = payload.OriginalRecipient?.toLowerCase();
  const allRecipients = [
    ...toAddresses,
    ...ccAddresses,
    ...(originalRecipient ? [originalRecipient] : []),
  ];

  let threadId: string | null = null;
  for (const addr of allRecipients) {
    const match = addr.match(THREAD_ALIAS_RE);
    if (match) {
      threadId = match[1];
      break;
    }
  }

  if (!threadId) {
    return { ok: false, reason: 'no per-thread alias match in recipients' };
  }

  // 2. Resolve workspace + existing deal from the thread. We generated this
  //    thread when we sent the outbound that started the conversation, so
  //    it exists in ops.message_threads unless the client responded to a
  //    stale alias from a deleted thread.
  const supabase = getSystemClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
  const { data: threadRow } = await (supabase as any)
    .schema('ops')
    .from('message_threads')
    .select('id, workspace_id, deal_id, provider_thread_key')
    .eq('id', threadId)
    .maybeSingle();

  if (!threadRow) {
    return { ok: false, reason: `thread not found: ${threadId}` };
  }

  // 3. Extract RFC 2822 threading headers. Postmark gives headers as an
  //    array of {Name, Value}; we index into it case-insensitively.
  const headerMap = new Map<string, string>();
  for (const h of payload.Headers ?? []) {
    if (h.Name && h.Value) headerMap.set(h.Name.toLowerCase(), h.Value);
  }
  const inReplyTo = headerMap.get('in-reply-to') ?? null;
  const references = headerMap.get('references') ?? null;
  const rawMessageIdHeader = headerMap.get('message-id') ?? null;

  // Normalize: strip <>, split at whitespace, take the first non-empty root.
  const threadKeyFromHeaders =
    (references ?? inReplyTo ?? rawMessageIdHeader ?? '').replace(/[<>]/g, '').split(/\s+/)[0] || null;
  const providerThreadKey = threadKeyFromHeaders ?? threadRow.provider_thread_key;

  // 4. Sender address — prefer FromFull for consistency with Attachments
  //    and ToFull shapes. Strip to lowercase email only.
  const fromAddress = payload.FromFull?.Email?.trim().toLowerCase() ?? payload.From?.trim().toLowerCase() ?? null;
  if (!fromAddress) {
    return { ok: false, reason: 'missing from address' };
  }

  // 5. Body. Prefer StrippedTextReply for the in-card preview and Aion
  //    classification; keep the full TextBody for audit / RAG. We store
  //    only the stripped form in body_text to keep rows light, and the
  //    full body in body_html for provenance.
  //
  //    Design call: Phase 1 stores StrippedTextReply → body_text. This
  //    matches what the Replies card shows and what Aion classifies on.
  //    If we later need full quoted history, re-download from Postmark.
  const bodyText = payload.StrippedTextReply ?? payload.TextBody ?? null;
  const bodyHtml = payload.HtmlBody ?? null;

  // 6. Attachments — Postmark inlines base64 Content in the webhook. We
  //    don't write bytes into ops.messages.attachments (per the "NEVER
  //    inline base64" invariant). Phase 1 persists metadata only; Phase
  //    1.5 streams the bytes into workspace-scoped Supabase Storage.
  const attachmentMetadata = (payload.Attachments ?? []).map((a) => ({
    filename: a.Name ?? 'attachment',
    mime: a.ContentType ?? 'application/octet-stream',
    size: typeof a.ContentLength === 'number' ? a.ContentLength : null,
    // Deferred: storage_path set when Phase 1.5 uploads to storage.
    storage_path: null,
  }));

  const rpcPayload = {
    workspace_id: threadRow.workspace_id,
    provider_message_id: providerMessageId,
    provider_thread_key: providerThreadKey,
    channel: 'email',
    subject: payload.Subject ?? null,
    from_address: fromAddress,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    body_text: bodyText,
    body_html: bodyHtml,
    attachments: attachmentMetadata,
    deal_id: threadRow.deal_id,
  };

  // 7. Fire the RPC. Idempotent on provider_message_id; retries safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMessageId, error } = await (supabase as any)
    .schema('ops')
    .rpc('record_inbound_message', { p_payload: rpcPayload });

  if (error) {
    console.error('[postmark webhook] record_inbound_message failed:', error.message);
    return { ok: false, reason: `rpc error: ${error.message}` };
  }

  // 7b. Enqueue for Aion embedding. Fire-and-forget inside the helper —
  //     logs on failure but does not bubble up, so a Voyage/queue hiccup
  //     doesn't retry the webhook (the client would double-deliver the
  //     email on retry). The deterministic get_latest_messages tool still
  //     finds the message via ops.messages even if this enqueue fails;
  //     only the semantic lookup_client_messages path is impaired.
  await enqueueMessageEmbedding({
    workspaceId: threadRow.workspace_id,
    messageId: newMessageId as string,
    bodyText: bodyText ?? '',
    channel: 'email',
    direction: 'inbound',
    providerMessageId,
  });

  // 8. Urgent-keyword insight dispatch. Same logic as the Resend webhook
  //    used to carry — now lives here because Postmark is the inbound
  //    vendor. If the RPC's keyword heuristic flagged the message and the
  //    thread is deal-bound, write an aion_insights row so the owner sees
  //    it on the Daily Brief within seconds.
  await maybeFireUrgentInsight(
    newMessageId as string,
    threadRow.workspace_id,
    threadRow.deal_id,
    fromAddress,
    bodyText,
  );

  // 9. Phase 2 Sprint 2: resolve dead_silence and proposal_engagement proactive
  //    lines for this deal. Silence is broken (deal got a reply); both pills
  //    are now stale. money_event lines are intentionally left alone — a
  //    client reply saying "I'll pay tomorrow" isn't an actual payment.
  if (threadRow.deal_id) {
    for (const signalType of ['dead_silence', 'proposal_engagement'] as const) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .schema('cortex')
          .rpc('resolve_aion_proactive_lines_by_deal', {
            p_workspace_id: threadRow.workspace_id,
            p_deal_id: threadRow.deal_id,
            p_signal_type: signalType,
          });
      } catch (resolveErr) {
        console.warn(
          '[postmark webhook] resolve_aion_proactive_lines_by_deal skipped:',
          signalType,
          (resolveErr as Error).message,
        );
      }
    }
  }

  return { ok: true, messageId: newMessageId as string };
}

/**
 * Look up the just-inserted message's urgency flag and, if set, upsert a
 * cortex.aion_insight row with trigger_type='inbound_reply_urgent'. Silent
 * failure on any error — urgency is an enhancement, the reply itself
 * already landed on the Deal Lens Replies card.
 */
async function maybeFireUrgentInsight(
  messageId: string,
  workspaceId: string,
  dealId: string | null,
  fromAddress: string,
  bodyText: string | null,
): Promise<void> {
  if (!dealId) return;

  const supabase = getSystemClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgRow } = await (supabase as any)
      .schema('ops')
      .from('messages')
      .select('urgency_keyword_match')
      .eq('id', messageId)
      .maybeSingle();

    const keyword = (msgRow as { urgency_keyword_match: string | null } | null)?.urgency_keyword_match;
    if (!keyword) return;

    const preview = (bodyText ?? '').slice(0, 140);
    const title = `Client reply mentions "${keyword}"`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).schema('cortex').rpc('upsert_aion_insight', {
      p_workspace_id: workspaceId,
      p_trigger_type: 'inbound_reply_urgent',
      p_entity_type: 'deal',
      p_entity_id: dealId,
      p_title: title,
      p_context: {
        keyword,
        message_id: messageId,
        from_address: fromAddress,
        preview,
        suggestedAction: 'Open the Replies card and respond',
        href: `/crm?selected=${dealId}`,
        urgency: 'high',
      },
      p_priority: 80,
      p_expires_at: expiresAt,
    });
  } catch (err) {
    console.error('[postmark webhook] urgent insight dispatch failed:', err instanceof Error ? err.message : err);
  }
}
