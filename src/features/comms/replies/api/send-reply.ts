'use server';

/**
 * sendReply — outbound email server action for the Replies feature.
 *
 * Insert-first-then-send pattern (see docs/reference/replies-design.md §4.2):
 *   1. ops.record_outbound_message_draft — insert ops.messages row, returns id
 *   2. Resend send with Reply-To = thread-{thread_id}@replies.unusonic.com
 *   3. ops.stamp_outbound_provider_id — stamp the Resend email_id on the row
 *
 * If the Resend send fails AFTER step 1, the row remains with
 * provider_message_id = NULL so it's discoverable and can be retried or
 * marked bounced. The partial UNIQUE index on provider_message_id ignores
 * NULLs, so unstamped drafts don't collide.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getWorkspaceFrom } from '@/shared/api/email/send';
import { getResend } from '@/shared/api/email/core';
import { enqueueMessageEmbedding } from '@/app/api/aion/lib/embeddings';

const inputSchema = z.object({
  threadId: z.string().uuid(),
  bodyText: z.string().trim().min(1).max(50000),
});

export type SendReplyResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

export async function sendReply(input: {
  threadId: string;
  bodyText: string;
}): Promise<SendReplyResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = (supabase as any).schema('ops');

    // ── 1. Resolve thread + target recipient ─────────────────────────────
    // The to-address is the sender of the most recent inbound message in the
    // thread. For a thread we originated where no reply has landed yet, fall
    // back to the thread's primary_entity_id email.
    const { data: threadRow, error: threadErr } = await opsClient
      .from('message_threads')
      .select('id, workspace_id, channel, subject, primary_entity_id')
      .eq('id', parsed.data.threadId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (threadErr || !threadRow) {
      return { success: false, error: 'Thread not found in this workspace' };
    }
    if (threadRow.channel !== 'email') {
      return { success: false, error: 'SMS outbound ships in Phase 1.5' };
    }

    // Most-recent inbound to reply to.
    const { data: lastInboundRow } = await opsClient
      .from('messages')
      .select('id, from_address')
      .eq('thread_id', threadRow.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let toAddress: string | null = lastInboundRow?.from_address ?? null;

    // Fallback: pull email from primary_entity_id's attributes.
    if (!toAddress && threadRow.primary_entity_id) {
      const { data: entityRow } = await supabase
        .schema('directory')
        .from('entities')
        .select('attributes')
        .eq('id', threadRow.primary_entity_id)
        .maybeSingle();
      const attrs = (entityRow?.attributes as Record<string, unknown> | null) ?? null;
      const email = typeof attrs?.email === 'string' ? attrs.email : null;
      toAddress = email;
    }

    if (!toAddress) {
      return { success: false, error: 'No recipient resolved for this thread' };
    }

    // ── 2. Resolve sender + subject ──────────────────────────────────────
    const fromAddress = await getWorkspaceFrom(workspaceId);
    const subject = threadRow.subject
      ? threadRow.subject.toLowerCase().startsWith('re:')
        ? threadRow.subject
        : `Re: ${threadRow.subject}`
      : '(no subject)';

    // ── 3. Insert the draft row FIRST ───────────────────────────────────
    const { data: messageId, error: draftErr } = await opsClient.rpc('record_outbound_message_draft', {
      p_workspace_id: workspaceId,
      p_thread_id: threadRow.id,
      p_channel: 'email',
      p_to_addresses: [toAddress],
      p_cc_addresses: [],
      p_subject: subject,
      p_body_text: parsed.data.bodyText,
      p_body_html: null,
      p_attachments: [],
      p_sent_by_user_id: user.id,
      p_in_reply_to: lastInboundRow?.id ?? null,
    });

    if (draftErr || !messageId) {
      return { success: false, error: draftErr?.message ?? 'Failed to draft message' };
    }

    // ── 4. Send via Resend ─────────────────────────────────────────────
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'Email service is not configured' };
    }

    const replyToAlias = `thread-${threadRow.id}@replies.unusonic.com`;

    const { data: sendResult, error: sendErr } = await resend.emails.send({
      from: fromAddress,
      to: [toAddress],
      subject,
      text: parsed.data.bodyText,
      // Match the array-form used by senders/proposal.ts. Resend accepts
      // both but the array form is what the rest of the codebase uses.
      replyTo: [replyToAlias],
    });

    if (sendErr || !sendResult?.id) {
      // Draft row stays in the DB with provider_message_id = NULL. Log and
      // bubble up the error so the composer can surface it to the user.
      console.error('[send-reply] Resend send failed:', sendErr?.message);
      return { success: false, error: sendErr?.message ?? 'Failed to send email' };
    }

    // ── 5. Stamp the provider message id on the draft row ──────────────
    const { error: stampErr } = await opsClient.rpc('stamp_outbound_provider_id', {
      p_message_id: messageId,
      p_provider_message_id: sendResult.id,
    });

    if (stampErr) {
      // Email went out successfully — log the stamp failure but don't fail
      // the caller. The reconciliation job (Phase 1.5) can fix orphans.
      console.error('[send-reply] stamp failed but send succeeded:', stampErr.message);
    }

    // Phase 3 Sprint 1: enqueue for Aion semantic embedding. Fire-and-forget
    // inside the helper — a queue hiccup shouldn't fail a sent email.
    await enqueueMessageEmbedding({
      workspaceId,
      messageId: messageId as string,
      bodyText: parsed.data.bodyText,
      channel: 'email',
      direction: 'outbound',
      providerMessageId: sendResult.id,
    });

    return { success: true, messageId: messageId as string };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error while sending reply',
    };
  }
}
