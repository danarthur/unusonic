/**
 * Confirm a capture — writes the linked ghost entity (if needed) and the
 * capture_events audit row.
 *
 * Called from the CaptureModal after the user has reviewed the parse and
 * (optionally) edited the entity/follow-up/note. The server action
 * orchestrates cross-schema writes:
 *
 *   1. If parse.entity.new_entity_proposal AND user didn't pick an existing
 *      entity → create a ghost in directory.entities.
 *   2. Call cortex.write_capture_confirmed RPC to persist the capture row.
 *
 * Deferred to Phase 2:
 *   - Writing a follow_up_queue row (`ops.follow_up_queue.deal_id` is NOT
 *     NULL today, and `reason_type` lacks a `captured_intent` value; both
 *     need to change before captures without a deal can seed the queue).
 *   - Uploading the audio blob to the `captures` storage bucket.
 *   - Attaching a `cortex.aion_memory` note to the resolved entity.
 *
 * See docs/reference/sales-brief-v2-design.md §10.
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import type { CaptureParseResult } from '@/app/api/aion/capture/parse/route';

export type ConfirmCaptureInput = {
  workspaceId: string;
  transcript: string;
  parse: CaptureParseResult;
  /** User overrides applied in the review card. */
  edits?: {
    /** If set, user picked this existing entity instead of parsed match/new proposal. */
    resolvedEntityId?: string | null;
    /** If set and no resolvedEntityId, user edited the ghost proposal name. */
    newEntityName?: string | null;
    /** If set and no resolvedEntityId, user chose the ghost proposal type. */
    newEntityType?: 'person' | 'company' | 'venue' | null;
    /** Edited note text. Empty string clears. */
    note?: string | null;
    /** Edited follow-up text. Empty string clears. */
    followUpText?: string | null;
  };
};

export type ConfirmCaptureResult =
  | { ok: true; captureId: string; resolvedEntityId: string | null }
  | { ok: false; error: string };

function splitName(name: string): { first: string; last: string | null } {
  const parts = name.trim().split(/\s+/);
  return {
    first: parts[0] ?? name.trim(),
    last: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

async function createGhostFromParse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  name: string,
  type: 'person' | 'company' | 'venue',
  proposal: CaptureParseResult['entity'] extends infer E
    ? E extends { new_entity_proposal: infer P }
      ? P
      : never
    : never,
): Promise<{ id: string } | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is required.' };

  const attributes: Record<string, unknown> = {
    is_ghost: true,
    from_capture: true,
  };

  if (type === 'person') {
    const { first, last } = splitName(trimmed);
    attributes.first_name = first;
    if (last) attributes.last_name = last;
  }

  // Venues and companies use display_name as-is — no first/last split,
  // no role_hint (doesn't apply to locations or orgs).
  if (type === 'person' && proposal?.role_hint) {
    attributes.role_hint = proposal.role_hint;
  }
  if (proposal?.organization_hint) attributes.organization_hint = proposal.organization_hint;

  const { data, error } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      display_name: trimmed,
      type,
      claimed_by_user_id: null,
      owner_workspace_id: workspaceId,
      attributes,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create entity.' };
  }
  return { id: data.id };
}

export async function confirmCapture(
  input: ConfirmCaptureInput,
): Promise<ConfirmCaptureResult> {
  const { workspaceId, transcript, parse, edits } = input;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // Workspace membership check — belt-and-suspenders before the RPC does the same.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!member) return { ok: false, error: 'Not authorized for this workspace.' };

  // ── Resolve entity ────────────────────────────────────────────────────────
  let resolvedEntityId: string | null = null;

  // Priority: explicit override > parsed match > new ghost from proposal
  if (edits?.resolvedEntityId !== undefined) {
    resolvedEntityId = edits.resolvedEntityId;
  } else if (parse.entity?.matched_entity_id) {
    resolvedEntityId = parse.entity.matched_entity_id;
  } else if (parse.entity?.new_entity_proposal) {
    const name =
      edits?.newEntityName?.trim() ||
      parse.entity.new_entity_proposal.name;
    const type = edits?.newEntityType ?? parse.entity.new_entity_proposal.type;
    const result = await createGhostFromParse(
      supabase,
      workspaceId,
      name,
      type,
      parse.entity.new_entity_proposal,
    );
    if ('error' in result) return { ok: false, error: result.error };
    resolvedEntityId = result.id;
  }

  // ── Resolve parsed fields with edits ─────────────────────────────────────
  const finalNote = edits?.note !== undefined ? edits.note : parse.note;
  const finalFollowUp =
    edits?.followUpText !== undefined
      ? edits.followUpText
        ? { ...(parse.follow_up ?? {}), text: edits.followUpText }
        : null
      : parse.follow_up;

  // ── Persist the capture row ──────────────────────────────────────────────
  const { data: captureId, error: rpcError } = await supabase.rpc(
    'write_capture_confirmed' as never,
    {
      p_workspace_id: workspaceId,
      p_transcript: transcript,
      p_parsed_entity: parse.entity ?? null,
      p_parsed_follow_up: finalFollowUp ?? null,
      p_parsed_note: finalNote && finalNote.length > 0 ? finalNote : null,
      p_resolved_entity_id: resolvedEntityId,
      p_created_follow_up_queue_id: null, // deferred — see header comment
      p_audio_storage_path: null,         // deferred — see header comment
    } as never,
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }
  if (!captureId) {
    return { ok: false, error: 'Write refused — workspace mismatch.' };
  }

  revalidatePath('/lobby');

  return {
    ok: true,
    captureId: captureId as string,
    resolvedEntityId,
  };
}
