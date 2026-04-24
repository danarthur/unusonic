/**
 * requireConfirmed — the gate every Aion write dispatcher MUST pass through
 * before triggering an irreversible side-effect (Postmark send, Twilio send,
 * cortex.memory write, follow-up enrollment).
 *
 * Workflow (Phase 3 §3.5):
 *   1. Tool handler drafts the write, inserts a row into ops.aion_write_log
 *      with `drafted_at=now()`, returns draft_id.
 *   2. ReplyPreviewCard / DealNarrativeStrip / follow-up preview UI shows the
 *      user the full before/after diff. User clicks Confirm.
 *   3. Confirm server action stamps `confirmed_at=now()` on the write-log row.
 *   4. Dispatcher (sendReply, enrollFollowUp, updateNarrative) calls
 *      `requireConfirmed(draftId, userId)` FIRST. Throws if the row is
 *      unconfirmed, belongs to another user, or has already been executed.
 *   5. On success, dispatcher runs the side-effect, stamps `executed_at`.
 *
 * Why throw (not return false)? The dispatcher path is service-role; any
 * caller reaching this function has a `draftId` they intend to execute. A
 * silent `false` return would invite race/replay bugs. Throwing halts the
 * pipeline and surfaces the violation in Sentry.
 *
 * The ESLint rule `aion/require-confirmed` enforces that any handler
 * dispatching to Postmark/Twilio references this function in the same
 * function body (C3 rail).
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { Json } from '@/types/supabase';

export class ConfirmationError extends Error {
  constructor(message: string, public readonly code: ConfirmationErrorCode) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

export type ConfirmationErrorCode =
  | 'draft_not_found'
  | 'draft_not_confirmed'
  | 'draft_user_mismatch'
  | 'draft_already_executed';

/**
 * Verify an ops.aion_write_log row is in a valid pre-execute state.
 *
 * Requirements:
 *   • Row exists
 *   • user_id matches the caller
 *   • confirmed_at IS NOT NULL (user has clicked Confirm)
 *   • executed_at IS NULL (no replay)
 *
 * Returns the row for dispatcher use (artifact_ref, input_params, deal_id).
 */
export async function requireConfirmed(
  draftId: string,
  userId: string,
): Promise<AionWriteLogRow> {
  const system = getSystemClient();

  const { data, error } = await system
    .schema('ops')
    .from('aion_write_log')
    .select(
      'id, workspace_id, user_id, tool_name, deal_id, artifact_ref, input_params, confirmed_at, executed_at',
    )
    .eq('id', draftId)
    .maybeSingle();

  if (error || !data) {
    throw new ConfirmationError(
      `Draft ${draftId} not found or unreadable.`,
      'draft_not_found',
    );
  }

  const row = data as AionWriteLogRow;

  if (row.user_id !== userId) {
    throw new ConfirmationError(
      `Draft ${draftId} belongs to a different user.`,
      'draft_user_mismatch',
    );
  }

  if (row.executed_at !== null) {
    throw new ConfirmationError(
      `Draft ${draftId} already executed at ${row.executed_at}. Replays are not allowed.`,
      'draft_already_executed',
    );
  }

  if (row.confirmed_at === null) {
    throw new ConfirmationError(
      `Draft ${draftId} has not been confirmed by the user.`,
      'draft_not_confirmed',
    );
  }

  return row;
}

/**
 * Mark a confirmed draft as executed with its result payload. Called by the
 * dispatcher after the downstream side-effect completes successfully.
 *
 * The write is idempotent via the `WHERE executed_at IS NULL` clause — a
 * double-call no-ops (consistent with requireConfirmed's replay protection).
 */
export async function markExecuted(
  draftId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const system = getSystemClient();
  // aion_write_log.result is jsonb; the generated Json recursive type refuses
  // Record<string, unknown> directly, so we widen at the call site.
  const { error } = await system
    .schema('ops')
    .from('aion_write_log')
    .update({ executed_at: new Date().toISOString(), result: result as unknown as Json })
    .eq('id', draftId)
    .is('executed_at', null);

  if (error) {
    console.error(`[aion.requireConfirmed] mark_executed_failed draft=${draftId} err=${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Row shape — mirror the migration. Keep in sync with
// 20260521000000_aion_write_log_and_deal_in_workspace.sql.
// ---------------------------------------------------------------------------

export type AionWriteLogToolName = 'send_reply' | 'schedule_followup' | 'update_narrative';

export type AionWriteLogRow = {
  id:            string;
  workspace_id:  string;
  user_id:       string;
  tool_name:     AionWriteLogToolName;
  deal_id:       string | null;
  artifact_ref:  Record<string, unknown>;
  input_params:  Record<string, unknown>;
  confirmed_at:  string | null;
  executed_at:   string | null;
};
