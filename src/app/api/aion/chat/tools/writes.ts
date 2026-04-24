/**
 * Aion write tools — Phase 3 Sprint 2 §3.5.
 *
 * Three tools. All follow the diff-confirm-execute pattern:
 *
 *   1. Tool handler validates input (deal_in_workspace check), produces a
 *      draft artifact where relevant, writes a row to ops.aion_write_log
 *      with drafted_at=now(), returns { draft_id, preview_url, ... }.
 *
 *   2. Server-rendered preview UI (ReplyPreviewCard, follow-up preview,
 *      DealNarrativeStrip) shows the full before/after.
 *
 *   3. User confirms → confirmAnd* server action stamps confirmed_at and
 *      dispatches the downstream side-effect. requireConfirmed() gate
 *      blocks replay and cross-user invocation.
 *
 * Cross-workspace safety (C5):
 *   • deal_in_workspace RPC runs before any deal-scoped tool accepts input
 *   • ops.aion_write_log RLS pins reads to workspace members
 *   • confirm/dispatch paths re-verify user ownership of the draft
 *
 * Voice-intent gate:
 *   send_reply is listed in VOICE_INTENT_TOOL_NAMES — it's stripped from
 *   desktop tool sets automatically. The other two (schedule_followup,
 *   update_narrative) are desktop-safe with confirm UI.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { Json } from '@/types/supabase';
import { envelope } from '../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../lib/substrate-counts';
import { dealInWorkspace } from '../../lib/deal-in-workspace';
import { WRITE_DENIED, type AionToolContext } from './types';

export function createWriteTools(ctx: AionToolContext) {
  const { workspaceId, userId, canWrite, pageContext } = ctx;

  const resolveDealId = (explicit?: string | null): string | null =>
    explicit ||
    (pageContext?.type === 'deal' || pageContext?.type === 'proposal'
      ? pageContext.entityId
      : null);

  // ---------------------------------------------------------------------------
  // send_reply — draft an outbound reply for owner confirmation.
  //
  // Creates an ops.messages row with direction='outbound' and
  // provider_message_id=NULL (the draft row), then logs an aion_write_log
  // row tying the tool invocation to that message. ReplyPreviewCard renders
  // the draft; confirmAndSendAionReply dispatches via the existing Replies
  // sendReply server action on confirm.
  //
  // Note: this tool is in VOICE_INTENT_TOOL_NAMES — the /api/aion/chat
  // route strips it from desktop tool sets. See surface-detection.ts.
  // ---------------------------------------------------------------------------

  const send_reply = tool({
    description:
      'Draft an email reply to a client on a deal. Produces a preview card for the user to confirm — does NOT send immediately. Use for "reply to Sarah about the cut times", "draft a response to the deposit question". ' +
      'The tool creates the draft; the user explicitly confirms in the preview UI before it dispatches. Audit-logged.',
    inputSchema: z.object({
      deal_id: z.string().optional().describe('Deal to reply on. Defaults to the current deal in view.'),
      in_reply_to_message_id: z.string().optional().describe('Optional — the inbound message id this reply anchors to. Resolved from the most recent inbound on the deal if omitted.'),
      body_text: z.string().min(1).max(10000).describe('The reply body as plaintext. Keep it short and voice-matched.'),
      body_html: z.string().optional().describe('Optional — richer HTML body if the reply needs formatting.'),
      subject_override: z.string().optional().describe('Optional override for the reply subject. Defaults to "Re: <thread subject>".'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const dealId = resolveDealId(params.deal_id);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal in context to reply on.' });
      }
      if (!(await dealInWorkspace(dealId))) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found' });
      }

      const system = getSystemClient();

      // Resolve thread: most recent thread on the deal.
      const { data: threadRow } = await system
        .schema('ops')
        .from('message_threads')
        .select('id, subject, channel, primary_entity_id')
        .eq('workspace_id', workspaceId)
        .eq('deal_id', dealId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!threadRow) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, {
          reason: 'no_messages_from_entity',
          hint: 'No existing email thread on this deal to reply to. Ask the user to compose a new message from the deal page instead.',
        });
      }

      // Resolve recipient (most recent inbound sender).
      const { data: lastInbound } = await system
        .schema('ops')
        .from('messages')
        .select('id, from_address')
        .eq('thread_id', threadRow.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const inReplyToId = params.in_reply_to_message_id ?? lastInbound?.id ?? undefined;
      const subject = params.subject_override
        ?? (threadRow.subject
              ? (threadRow.subject.toLowerCase().startsWith('re:') ? threadRow.subject : `Re: ${threadRow.subject}`)
              : '(no subject)');

      // Insert the draft row via the existing Phase 1 Replies RPC.
      // provider_message_id stays NULL; the Resend send + stamp happens on confirm.
      const { data: messageId, error: draftErr } = await system
        .schema('ops')
        .rpc('record_outbound_message_draft', {
          p_workspace_id:    workspaceId,
          p_thread_id:       threadRow.id,
          p_channel:         'email',
          p_to_addresses:    lastInbound?.from_address ? [lastInbound.from_address] : [],
          p_cc_addresses:    [],
          p_subject:         subject,
          p_body_text:       params.body_text,
          p_body_html:       params.body_html ?? '',
          p_attachments:     [],
          p_sent_by_user_id: userId,
          ...(inReplyToId ? { p_in_reply_to: inReplyToId } : {}),
        });

      if (draftErr || !messageId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'no_messages_from_entity', hint: draftErr?.message ?? 'Failed to draft reply.' });
      }

      const draftId = await logWriteDraft({
        workspaceId,
        userId,
        toolName: 'send_reply',
        dealId,
        artifactRef: { message_id: messageId as string, thread_id: threadRow.id },
        inputParams: redactSendReplyParams(params),
      });

      return {
        draft_id: draftId,
        preview_url: `/aion/drafts/${draftId}`,
        message_id: messageId,
        thread_id: threadRow.id,
        subject,
        to: lastInbound?.from_address ?? null,
        body_text: params.body_text,
        status: 'drafted' as const,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // schedule_followup — queue a future follow-up (soft-confirm window).
  //
  // Stores params in aion_write_log input_params at draft time. On confirm,
  // confirmAndEnrollAionFollowUp writes the ops.follow_up_queue row.
  // ---------------------------------------------------------------------------

  const schedule_followup = tool({
    description:
      'Schedule a follow-up reminder on a deal. Creates a preview card for the user to confirm. Use for "remind me to follow up with Sarah in 3 days", "queue a nudge for this deal next week". Audit-logged.',
    inputSchema: z.object({
      deal_id: z.string().optional().describe('Deal to follow up on. Defaults to the current deal in view.'),
      scheduled_for: z.string().describe('ISO-8601 timestamp. When the follow-up should surface in the queue.'),
      draft_body: z.string().min(1).max(2000).optional().describe('Optional pre-drafted message body for when the follow-up fires.'),
      channel: z.enum(['email', 'sms']).optional().describe('Preferred channel when the follow-up is acted on. Default: email.'),
      remind_owner_first: z.boolean().optional().describe('If true, surface a soft-confirm 1h before scheduled_for (owner reviews before auto-send). Default: true.'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const dealId = resolveDealId(params.deal_id);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal in context to schedule a follow-up on.' });
      }
      if (!(await dealInWorkspace(dealId))) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found' });
      }

      const draftId = await logWriteDraft({
        workspaceId,
        userId,
        toolName: 'schedule_followup',
        dealId,
        artifactRef: {},
        inputParams: {
          scheduled_for:      params.scheduled_for,
          draft_body:         params.draft_body ?? null,
          channel:            params.channel ?? 'email',
          remind_owner_first: params.remind_owner_first ?? true,
        },
      });

      return {
        draft_id: draftId,
        preview_url: `/aion/drafts/${draftId}`,
        deal_id: dealId,
        scheduled_for: params.scheduled_for,
        channel: params.channel ?? 'email',
        draft_body: params.draft_body ?? null,
        remind_owner_first: params.remind_owner_first ?? true,
        status: 'drafted' as const,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // update_narrative — set the Aion-authored narrative for a deal.
  //
  // Stored in cortex.memory with source_type='narrative', source_id=deal_id.
  // The write happens on confirm via upsert_memory_embedding RPC. The
  // DealNarrativeStrip reads the latest row per deal.
  // ---------------------------------------------------------------------------

  const update_narrative = tool({
    description:
      'Write or update the deal narrative — a short Aion-authored summary of where the deal stands (client context, commitments, blockers). Shows below the deal header strip. Creates a preview card for the user to confirm. ' +
      'Use when the user says "update the narrative to say X", "summarize this deal for the team", or when the handoff wizard captures a final state description.',
    inputSchema: z.object({
      deal_id: z.string().optional().describe('Deal to narrate. Defaults to the current deal in view.'),
      narrative: z.string().min(1).max(4000).describe('The narrative prose — short, factual, future-oriented. Sentence case, no exclamation marks.'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const dealId = resolveDealId(params.deal_id);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal in context to update narrative on.' });
      }
      if (!(await dealInWorkspace(dealId))) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found' });
      }

      // Read the existing narrative for the diff in the preview UI.
      const system = getSystemClient();
      const { data: existing } = await system
        .schema('cortex')
        .from('memory')
        .select('content_text, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('source_type', 'narrative')
        .eq('source_id', dealId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const draftId = await logWriteDraft({
        workspaceId,
        userId,
        toolName: 'update_narrative',
        dealId,
        artifactRef: {},
        inputParams: { narrative: params.narrative },
      });

      return {
        draft_id: draftId,
        preview_url: `/aion/drafts/${draftId}`,
        deal_id: dealId,
        previous_narrative: existing?.content_text ?? null,
        previous_updated_at: existing?.updated_at ?? null,
        new_narrative: params.narrative,
        status: 'drafted' as const,
      };
    },
  });

  return { send_reply, schedule_followup, update_narrative };
}

// ---------------------------------------------------------------------------
// Shared helper — insert an ops.aion_write_log row and return the id.
// Service-role write (the table has no INSERT RLS policy for authenticated).
// ---------------------------------------------------------------------------

async function logWriteDraft(params: {
  workspaceId:  string;
  userId:       string;
  toolName:     'send_reply' | 'schedule_followup' | 'update_narrative';
  dealId:       string | null;
  artifactRef:  Record<string, unknown>;
  inputParams:  Record<string, unknown>;
}): Promise<string> {
  const system = getSystemClient();
  // The generated Json type is a strict recursive shape that doesn't directly
  // accept Record<string, unknown>. Widen at the insert site.
  const { data, error } = await system
    .schema('ops')
    .from('aion_write_log')
    .insert({
      workspace_id:  params.workspaceId,
      user_id:       params.userId,
      tool_name:     params.toolName,
      deal_id:       params.dealId,
      artifact_ref:  params.artifactRef as unknown as Json,
      input_params:  params.inputParams as unknown as Json,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`[aion.writes] Failed to log draft: ${error?.message ?? 'unknown'}`);
  }
  return (data as { id: string }).id;
}

/**
 * Strip the body from send_reply input_params before audit-log persistence.
 * The actual body is discoverable via artifact_ref.message_id on ops.messages;
 * keeping a second copy in aion_write_log bloats the audit table and
 * duplicates the PII surface.
 */
function redactSendReplyParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (key === 'body_text' || key === 'body_html') continue;
    redacted[key] = params[key as keyof typeof params];
  }
  return redacted;
}
