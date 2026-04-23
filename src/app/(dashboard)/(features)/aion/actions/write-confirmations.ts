'use server';

/**
 * Confirmation + dispatch endpoints for the three Aion write tools
 * (Phase 3 §3.5). Called from:
 *   • ReplyPreviewCard (send_reply)
 *   • Follow-up preview UI (schedule_followup)
 *   • DealNarrativeStrip confirmation dialog (update_narrative)
 *
 * Every action is the diff-confirm-execute pipeline:
 *   1. User hits Confirm in the preview UI
 *   2. Action stamps ops.aion_write_log.confirmed_at via service role
 *   3. requireConfirmed() gate passes
 *   4. Dispatcher runs the downstream side-effect
 *   5. markExecuted() stamps result payload
 *
 * Cross-user + cross-workspace protection is enforced at every step:
 *   • requireConfirmed checks user_id matches
 *   • dispatchers re-verify the deal belongs to the caller's workspace
 *   • public.deal_in_workspace RPC runs belt + SQL RLS
 */

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  requireConfirmed,
  markExecuted,
  ConfirmationError,
} from '@/app/api/aion/lib/require-confirmed';
import { writeDealNarrative } from '@/app/api/aion/lib/narrative-writer';
import { sendReply as dispatchSendReply } from '@/features/comms/replies/api/send-reply';

export type ConfirmWriteResult =
  | { success: true; executedAt: string; result: Record<string, unknown> }
  | { success: false; error: string; code?: string };

/**
 * Stamp confirmed_at on a draft row. No side effects — dispatchers call
 * requireConfirmed() separately to read the confirmed state. Separating
 * confirm-stamp from dispatch keeps the user click cheap and allows the
 * dispatcher to retry the side-effect without re-confirming.
 */
export async function confirmAionDraft(draftId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const system = getSystemClient();
  const { data, error } = await system
    .schema('ops')
    .from('aion_write_log')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('user_id', user.id)
    .is('confirmed_at', null)
    .is('executed_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Draft not confirmable (missing, wrong user, or already acted).' };

  return { success: true };
}

/**
 * Confirm + dispatch a send_reply draft. The draft's artifact_ref holds the
 * ops.messages row that was inserted at tool-invocation time; we read its
 * body + thread, hand off to the existing Replies sendReply server action,
 * and stamp executed_at on success.
 *
 * Idempotent via the WHERE executed_at IS NULL guard in markExecuted.
 */
export async function confirmAndSendAionReply(draftId: string): Promise<ConfirmWriteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // 1. Stamp confirmed_at (idempotent, skipped if already confirmed).
  const confirm = await confirmAionDraft(draftId);
  if (!confirm.success && confirm.error && !confirm.error.includes('already acted')) {
    return { success: false, error: confirm.error };
  }

  // 2. Load + validate via requireConfirmed gate.
  let row;
  try {
    row = await requireConfirmed(draftId, user.id);
  } catch (err) {
    if (err instanceof ConfirmationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return { success: false, error: 'Unexpected confirmation failure' };
  }

  if (row.tool_name !== 'send_reply') {
    return { success: false, error: `Draft is a ${row.tool_name}, not a send_reply.` };
  }

  // 3. Read the draft ops.messages row the tool created.
  const messageId = (row.artifact_ref as { message_id?: string }).message_id;
  if (!messageId) {
    return { success: false, error: 'Draft artifact missing message_id.' };
  }

  const system = getSystemClient();
  const { data: draftMessage } = await system
    .schema('ops')
    .from('messages')
    .select('thread_id, body_text, provider_message_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!draftMessage) {
    return { success: false, error: 'Draft message row not found.' };
  }
  if (draftMessage.provider_message_id) {
    // Message already sent — idempotent short-circuit.
    return {
      success: true,
      executedAt: row.executed_at ?? new Date().toISOString(),
      result: { message_id: messageId, already_sent: true },
    };
  }
  if (!draftMessage.body_text || !draftMessage.thread_id) {
    return { success: false, error: 'Draft message is missing body or thread.' };
  }

  // 4. Dispatch via existing Replies sendReply server action. It handles
  // to-address resolution, Resend send, and stamp_outbound_provider_id.
  //
  // NOTE: sendReply internally calls record_outbound_message_draft which
  // creates a NEW message row. We don't want that duplication — the Aion
  // tool already created the draft row. For Phase 3 Sprint 2 Wk 5-6 we
  // reuse sendReply's full pipeline and accept the duplicate row; the
  // original (messageId) remains with provider_message_id=NULL as an
  // orphan. Reconciliation is tracked as follow-up work.
  //
  // Cleaner long-term: factor sendReply into a "resume draft" variant that
  // takes an existing message_id and just does the Resend send + stamp.
  const sendResult = await dispatchSendReply({
    threadId: draftMessage.thread_id,
    bodyText: draftMessage.body_text,
  });

  if (!sendResult.success) {
    return { success: false, error: sendResult.error };
  }

  // 5. Stamp executed_at.
  const result = { message_id: sendResult.messageId, original_draft_id: messageId };
  await markExecuted(draftId, result);

  return {
    success: true,
    executedAt: new Date().toISOString(),
    result,
  };
}

/**
 * Confirm + enroll a schedule_followup draft. Writes a row into
 * ops.follow_up_queue with reason_type='nudge_client' and source='aion'.
 *
 * Idempotent via unique index (deal_id, reason_type) WHERE status='pending'.
 * A second call with the same deal returns the existing row.
 */
export async function confirmAndEnrollAionFollowUp(draftId: string): Promise<ConfirmWriteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  await confirmAionDraft(draftId);

  let row;
  try {
    row = await requireConfirmed(draftId, user.id);
  } catch (err) {
    if (err instanceof ConfirmationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return { success: false, error: 'Unexpected confirmation failure' };
  }

  if (row.tool_name !== 'schedule_followup' || !row.deal_id) {
    return { success: false, error: 'Invalid follow-up draft.' };
  }

  const params = row.input_params as {
    draft_body?: string;
    channel?: 'email' | 'sms';
    scheduled_for?: string;
  };

  const system = getSystemClient();
  const { data: queueRow, error: enqueueErr } = await system
    .schema('ops')
    .from('follow_up_queue')
    .upsert({
      workspace_id:      row.workspace_id,
      deal_id:           row.deal_id,
      reason_type:       'nudge_client',
      reason:            'Scheduled from Aion chat',
      suggested_action:  params.draft_body ?? null,
      suggested_channel: params.channel ?? 'email',
      snoozed_until:     params.scheduled_for ?? null,
      status:            'pending',
      priority_score:    50,
    }, {
      onConflict: 'deal_id,reason_type',
      ignoreDuplicates: false,
    })
    .select('id')
    .maybeSingle();

  if (enqueueErr || !queueRow) {
    return { success: false, error: enqueueErr?.message ?? 'Failed to enqueue follow-up.' };
  }

  const result = { queue_item_id: queueRow.id };
  await markExecuted(draftId, result);
  return {
    success: true,
    executedAt: new Date().toISOString(),
    result,
  };
}

/**
 * Confirm + write a deal narrative into cortex.memory.
 *
 * source_type='narrative', source_id=deal_id, workspace_id=caller's workspace.
 * ON CONFLICT (source_type, source_id) DO UPDATE — one row per deal, mutable.
 * The cortex.upsert_memory_embedding RPC handles the upsert.
 *
 * Embedding is NOT generated here to keep the confirm-path fast; the
 * activity-embed cron picks up new narrative rows on its next tick (or the
 * admin panel "backfill" button re-embeds on demand).
 */
export async function confirmAndWriteAionNarrative(draftId: string): Promise<ConfirmWriteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  await confirmAionDraft(draftId);

  let row;
  try {
    row = await requireConfirmed(draftId, user.id);
  } catch (err) {
    if (err instanceof ConfirmationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return { success: false, error: 'Unexpected confirmation failure' };
  }

  if (row.tool_name !== 'update_narrative' || !row.deal_id) {
    return { success: false, error: 'Invalid narrative draft.' };
  }

  const params = row.input_params as { narrative?: string };
  if (!params.narrative) {
    return { success: false, error: 'Narrative body missing from draft.' };
  }

  const { memoryId, error: writeErr } = await writeDealNarrative({
    workspaceId: row.workspace_id,
    dealId:      row.deal_id,
    narrative:   params.narrative,
    author:      { kind: 'user', userId: user.id, draftId },
  });

  if (writeErr) return { success: false, error: writeErr };

  const result = { memory_id: memoryId, deal_id: row.deal_id };
  await markExecuted(draftId, result);
  return {
    success: true,
    executedAt: new Date().toISOString(),
    result,
  };
}

/**
 * Cancel a drafted (unconfirmed) Aion write. Stamps executed_at with a
 * `cancelled: true` result so the row is inert — no replay possible.
 */
export async function cancelAionDraft(draftId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const system = getSystemClient();
  const { error } = await system
    .schema('ops')
    .from('aion_write_log')
    .update({ executed_at: new Date().toISOString(), result: { cancelled: true } })
    .eq('id', draftId)
    .eq('user_id', user.id)
    .is('executed_at', null);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
