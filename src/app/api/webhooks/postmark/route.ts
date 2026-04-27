/**
 * Postmark Inbound Webhook Handler
 *
 * Handles inbound email parsing for the Replies feature. Register in Postmark:
 *   Inbound Server → Settings → Webhook URL:
 *     https://{user}:{pass}@{APP_URL}/api/webhooks/postmark
 *
 * Postmark authenticates via HTTP Basic Auth on the URL. The credentials
 * live in POSTMARK_WEBHOOK_USERNAME and POSTMARK_WEBHOOK_PASSWORD and are
 * verified with a constant-length padded timingSafeEqual (see __lib__/auth.ts).
 *
 * Architecture context — we chose Postmark for inbound (keeping Resend for
 * outbound) after a three-agent research pass on 2026-04-20. Rationale in
 * docs/reference/replies-design.md §9.
 *
 * Pipeline stages, each observable via Sentry breadcrumbs:
 *   1. Receive POST + write raw payload to ops.inbound_raw_payloads (DLQ).
 *      Never skip — even auth-failed payloads land here so an operator can
 *      audit forged attempts. The DLQ row is THE source of truth until a
 *      parsed ops.messages row is created.
 *   2. Verify Basic Auth (padded timingSafeEqual).
 *   3. Resolve thread via Reply-To alias (authoritative) or RFC 2822
 *      headers (fallback reconciliation).
 *   4. Classify as auto-reply (RFC 3834 + heuristics). If yes, still
 *      persist but mute downstream notifications and follow-up resolution.
 *   5. Extract body via selectInboundBodyText cascade.
 *   6. Fire ops.record_inbound_message RPC with explicit thread_id.
 *   7. Fire-and-forget Aion embedding enqueue + urgency insight.
 *   8. Update DLQ row status to 'parsed' with message_id.
 *
 * The handler is an adapter: it normalizes Postmark's payload into the
 * jsonb shape the RPC expects and persists a raw copy for replayability.
 * Vendor swap is a file + DNS flip, not a rebuild.
 *
 * See:
 *   - docs/reference/replies-design.md §4.2
 *   - src/app/api/webhooks/postmark/__lib__/auth.ts
 *   - src/app/api/webhooks/postmark/__lib__/auto-reply.ts
 *   - src/app/api/webhooks/postmark/__lib__/thread-key.ts
 *
 * @module app/api/webhooks/postmark
 */

import { NextRequest, NextResponse } from 'next/server';
import { toPlainText } from '@react-email/render';
import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import { enqueueMessageEmbedding } from '@/app/api/aion/lib/embeddings';
import { verifyBasicAuth } from './__lib__/auth';
import { classifyAutoReply } from './__lib__/auto-reply';
import { extractThreadKey } from './__lib__/thread-key';

export const runtime = 'nodejs';

// Reply-To alias format on outbound (same as before — thread identity is
// vendor-agnostic). Inbound parsing resolves the thread id from whichever
// recipient address matches this pattern. This is the AUTHORITATIVE signal
// — RFC 2822 headers are secondary reconciliation.
const THREAD_ALIAS_RE = /^thread-([0-9a-f-]{36})@replies\.unusonic\.com$/i;

// DLQ parse_status values — mirror ops.inbound_raw_payloads.parse_status
// CHECK constraint. Keep in sync with the migration.
type DlqStatus =
  | 'pending'
  | 'parsed'
  | 'parse_failed'
  | 'filtered_autoresponder'
  | 'unmatched_alias'
  | 'unverified_sender'
  | 'auth_failed'
  | 'duplicate';

// =============================================================================
// Payload types (exported for test fixtures)
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
// Body selection — exported for tests
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

// =============================================================================
// POST entry
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  let rawBodyText: string;

  try {
    rawBodyText = await req.text();
  } catch {
    // Body never arrived or stream error. Return 400 — no DLQ row possible
    // because we have no payload to record.
    Sentry.logger.warn('postmark.webhook.bodyReadFailed');
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let payload: PostmarkInboundPayload | null = null;
  let payloadParseError: string | null = null;
  try {
    payload = JSON.parse(rawBodyText) as PostmarkInboundPayload;
  } catch (err) {
    payloadParseError = err instanceof Error ? err.message : 'JSON parse failed';
  }

  // ── DLQ write ─────────────────────────────────────────────────────────
  // Every POST — authed or not, parseable or not — lands here first. This
  // guarantees no silent drops. The row's parse_status is updated as the
  // pipeline progresses; terminal statuses (parsed, filtered_autoresponder,
  // auth_failed, unmatched_alias) are the final states.
  const supabase = getSystemClient();
  const providerMessageId = payload?.MessageID ?? null;
  const rawJsonForDlq = payload ?? { __raw: rawBodyText, __parseError: payloadParseError };

  let dlqRowId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST
    const { data: dlqRow, error: dlqErr } = await (supabase as any)
      .schema('ops')
      .from('inbound_raw_payloads')
      .insert({
        provider: 'postmark',
        provider_message_id: providerMessageId,
        raw_payload: rawJsonForDlq,
        parse_status: 'pending',
      })
      .select('id')
      .single();

    if (dlqErr) {
      // DLQ write failure is itself an incident — log and continue, don't
      // drop the message. Postmark will 200 because we couldn't even track
      // it, and at least Sentry will have the record.
      Sentry.logger.error('postmark.webhook.dlqInsertFailed', { error: dlqErr.message });
    } else {
      dlqRowId = (dlqRow as { id: string }).id;
    }
  } catch (err) {
    Sentry.logger.error('postmark.webhook.dlqInsertThrew', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  Sentry.addBreadcrumb({
    category: 'postmark.webhook',
    level: 'info',
    message: 'dlq-row-created',
    data: { dlqRowId, hasPayload: !!payload, providerMessageId },
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  const authResult = verifyBasicAuth(authHeader);
  if (!authResult.ok) {
    await updateDlqStatus(dlqRowId, 'auth_failed', authResult.reason);
    Sentry.logger.warn('postmark.webhook.authFailed', { reason: authResult.reason });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Payload parse ─────────────────────────────────────────────────────
  if (!payload) {
    await updateDlqStatus(dlqRowId, 'parse_failed', `invalid JSON: ${payloadParseError}`);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Pipeline ──────────────────────────────────────────────────────────
  // Always 200 on non-auth failures. Postmark retries on 4xx/5xx for ~12h;
  // we don't want retry storms for misconfigured aliases or auto-reply
  // filters. The DLQ row carries the real fate; observability queries
  // surface pipeline health.
  const result = await handleInboundEmail(payload, dlqRowId);
  if (!result.ok) {
    // Non-success but handler chose to 200. Log + record on DLQ.
    Sentry.logger.info('postmark.webhook.pipelineSkip', {
      reason: result.reason,
      status: result.dlqStatus,
    });
  }
  return NextResponse.json({ received: true });
}

// =============================================================================
// Inbound parse pipeline
// =============================================================================

type InboundHandleResult =
  | { ok: true; messageId: string; dlqStatus: 'parsed' }
  | { ok: false; reason: string; dlqStatus: DlqStatus };

async function handleInboundEmail(
  payload: PostmarkInboundPayload,
  dlqRowId: string | null,
): Promise<InboundHandleResult> {
  const providerMessageId = payload.MessageID;
  if (!providerMessageId) {
    await updateDlqStatus(dlqRowId, 'parse_failed', 'missing MessageID');
    return { ok: false, reason: 'missing MessageID', dlqStatus: 'parse_failed' };
  }

  // ── 1. Resolve thread via alias ────────────────────────────────────────
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
    await updateDlqStatus(dlqRowId, 'unmatched_alias', 'no per-thread alias in recipients');
    return {
      ok: false,
      reason: 'no per-thread alias match in recipients',
      dlqStatus: 'unmatched_alias',
    };
  }

  Sentry.addBreadcrumb({
    category: 'postmark.webhook',
    level: 'info',
    message: 'alias-resolved',
    data: { threadId },
  });

  // ── 2. Load thread row (workspace + deal) ──────────────────────────────
  const supabase = getSystemClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: threadRow, error: threadErr } = await (supabase as any)
    .schema('ops')
    .from('message_threads')
    .select('id, workspace_id, deal_id, provider_thread_key')
    .eq('id', threadId)
    .maybeSingle();

  if (threadErr) {
    await updateDlqStatus(dlqRowId, 'parse_failed', `thread lookup failed: ${threadErr.message}`);
    return { ok: false, reason: `thread lookup error: ${threadErr.message}`, dlqStatus: 'parse_failed' };
  }

  if (!threadRow) {
    // Alias parsed but no matching thread in the DB. Could be a stale
    // alias from a deleted thread, a forged alias, or a dev-env UUID.
    // Route to Unmatched Replies triage — DO NOT silently create a new
    // thread (that was the 2026-04-24 bug).
    await updateDlqStatus(dlqRowId, 'unmatched_alias', `thread ${threadId} not found`);
    return {
      ok: false,
      reason: `thread not found: ${threadId}`,
      dlqStatus: 'unmatched_alias',
    };
  }

  if (!threadRow.workspace_id) {
    // Data corruption — thread exists but has no workspace. Don't guess.
    await updateDlqStatus(dlqRowId, 'parse_failed', `thread ${threadId} has null workspace_id`);
    return {
      ok: false,
      reason: `thread ${threadId} missing workspace`,
      dlqStatus: 'parse_failed',
    };
  }

  // Bind DLQ row to thread + workspace for audit queries.
  await bindDlqRowContext(dlqRowId, {
    thread_id: threadRow.id,
    workspace_id: threadRow.workspace_id,
  });

  // ── 3. RFC 2822 threading headers (reconciliation fallback) ────────────
  const headerMap = new Map<string, string>();
  for (const h of payload.Headers ?? []) {
    if (h.Name && h.Value) headerMap.set(h.Name.toLowerCase(), h.Value);
  }
  const getHeader = (name: string): string | null => headerMap.get(name.toLowerCase()) ?? null;

  const threadKeyFromHeaders = extractThreadKey(getHeader);
  const providerThreadKey = threadKeyFromHeaders ?? threadRow.provider_thread_key ?? null;

  // ── 4. Sender ──────────────────────────────────────────────────────────
  const fromAddress = payload.FromFull?.Email?.trim().toLowerCase()
    ?? payload.From?.trim().toLowerCase()
    ?? null;
  if (!fromAddress) {
    await updateDlqStatus(dlqRowId, 'parse_failed', 'missing from address');
    return { ok: false, reason: 'missing from address', dlqStatus: 'parse_failed' };
  }

  // ── 5. Auto-reply classification ───────────────────────────────────────
  const autoReply = classifyAutoReply(getHeader, fromAddress, payload.Subject ?? null);
  if (autoReply.isAutoReply) {
    Sentry.addBreadcrumb({
      category: 'postmark.webhook',
      level: 'info',
      message: 'auto-reply-detected',
      data: { reason: autoReply.reason, fromAddress },
    });
    // Note: we still persist the message (user wants to see "Ally is OOO
    // until 3/15"); the flag muzzles notifications, urgency, and follow-up
    // auto-resolve via the RPC's is_auto_reply handling.
  }

  // ── 6. Body ────────────────────────────────────────────────────────────
  const bodyText = selectInboundBodyText(payload);
  const bodyHtml = payload.HtmlBody ?? null;

  // ── 7. Attachments — metadata only, Phase 1.5 streams to storage ──────
  const attachmentMetadata = (payload.Attachments ?? []).map((a) => ({
    filename: a.Name ?? 'attachment',
    mime: a.ContentType ?? 'application/octet-stream',
    size: typeof a.ContentLength === 'number' ? a.ContentLength : null,
    storage_path: null,
  }));

  // ── 8. RPC write ───────────────────────────────────────────────────────
  const rpcPayload = {
    workspace_id: threadRow.workspace_id,
    provider_message_id: providerMessageId,
    provider_thread_key: providerThreadKey,
    thread_id: threadRow.id, // ← FIX: explicit thread_id is authoritative
    channel: 'email',
    subject: payload.Subject ?? null,
    from_address: fromAddress,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    body_text: bodyText,
    body_html: bodyHtml,
    attachments: attachmentMetadata,
    deal_id: threadRow.deal_id,
    is_auto_reply: autoReply.isAutoReply,
    auto_reply_reason: autoReply.reason,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMessageId, error: rpcErr } = await (supabase as any)
    .schema('ops')
    .rpc('record_inbound_message', { p_payload: rpcPayload });

  if (rpcErr) {
    Sentry.logger.error('postmark.webhook.rpcFailed', { error: rpcErr.message });
    await updateDlqStatus(dlqRowId, 'parse_failed', `rpc error: ${rpcErr.message}`);
    return { ok: false, reason: `rpc error: ${rpcErr.message}`, dlqStatus: 'parse_failed' };
  }

  Sentry.addBreadcrumb({
    category: 'postmark.webhook',
    level: 'info',
    message: 'message-persisted',
    data: {
      messageId: newMessageId,
      isAutoReply: autoReply.isAutoReply,
      hasBody: !!bodyText,
    },
  });

  // ── 9. Mark DLQ row terminal ───────────────────────────────────────────
  const terminalStatus: DlqStatus = autoReply.isAutoReply ? 'filtered_autoresponder' : 'parsed';
  await finalizeDlqRow(dlqRowId, {
    parse_status: terminalStatus,
    parse_reason: autoReply.reason,
    message_id: newMessageId as string,
  });

  // ── 10. Enqueue Aion embedding ────────────────────────────────────────
  // Skip embeddings for auto-replies — they'd pollute Aion's semantic
  // recall with bounce/OOO noise.
  if (!autoReply.isAutoReply) {
    await enqueueMessageEmbedding({
      workspaceId: threadRow.workspace_id,
      messageId: newMessageId as string,
      bodyText: bodyText ?? '',
      channel: 'email',
      direction: 'inbound',
      providerMessageId,
    });

    // ── 11. Urgent-keyword insight dispatch ─────────────────────────────
    await maybeFireUrgentInsight(
      newMessageId as string,
      threadRow.workspace_id,
      threadRow.deal_id,
      fromAddress,
      bodyText,
    );

    // ── 12. Resolve dead_silence / proposal_engagement proactive lines ──
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
          Sentry.logger.warn('postmark.webhook.proactiveResolveSkipped', {
            signalType,
            error: resolveErr instanceof Error ? resolveErr.message : String(resolveErr),
          });
        }
      }
    }
  }

  return { ok: true, messageId: newMessageId as string, dlqStatus: 'parsed' };
}

// =============================================================================
// DLQ helpers
// =============================================================================

async function updateDlqStatus(
  dlqRowId: string | null,
  status: DlqStatus,
  reason: string | null,
): Promise<void> {
  if (!dlqRowId) return;
  try {
    const supabase = getSystemClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .schema('ops')
      .from('inbound_raw_payloads')
      .update({
        parse_status: status,
        parse_reason: reason,
        processed_at: new Date().toISOString(),
      })
      .eq('id', dlqRowId);
  } catch (err) {
    Sentry.logger.warn('postmark.webhook.dlqUpdateFailed', {
      dlqRowId,
      status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function bindDlqRowContext(
  dlqRowId: string | null,
  ctx: { thread_id: string; workspace_id: string },
): Promise<void> {
  if (!dlqRowId) return;
  try {
    const supabase = getSystemClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .schema('ops')
      .from('inbound_raw_payloads')
      .update(ctx)
      .eq('id', dlqRowId);
  } catch {
    // best-effort — the row will still have received_at + raw_payload
  }
}

async function finalizeDlqRow(
  dlqRowId: string | null,
  patch: { parse_status: DlqStatus; parse_reason: string | null; message_id: string },
): Promise<void> {
  if (!dlqRowId) return;
  try {
    const supabase = getSystemClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .schema('ops')
      .from('inbound_raw_payloads')
      .update({
        ...patch,
        processed_at: new Date().toISOString(),
      })
      .eq('id', dlqRowId);
  } catch (err) {
    Sentry.logger.warn('postmark.webhook.dlqFinalizeFailed', {
      dlqRowId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// Urgent insight dispatch — unchanged from pre-hardening except now gated
// by the is_auto_reply check in handleInboundEmail.
// =============================================================================

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
    Sentry.logger.error('postmark.webhook.urgentInsightFailed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
