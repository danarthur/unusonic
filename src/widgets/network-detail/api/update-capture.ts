/**
 * updateCapture — server action for all post-confirm capture mutations.
 *
 * Four action types:
 *   - 'edit'       — change transcript and/or parsed_note; re-index embedding
 *   - 'reassign'   — change resolved_entity_id; re-index memory on new entity
 *   - 'visibility' — toggle user ↔ workspace
 *   - 'delete'     — soft-delete (status='dismissed'); remove embedding
 *
 * Ownership rules match the Postgres RPCs: only the capturing user can
 * mutate, even for workspace-visible captures. This is stricter than the
 * RLS SELECT policy on purpose — captures are the author's mental notes;
 * teammates can read but not rewrite.
 *
 * Design: docs/reference/capture-surfaces-design.md §4.4, §11.
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import {
  syncCaptureToMemory,
  removeCaptureFromMemory,
} from '@/app/api/aion/lib/capture-memory-sync';
import type { CaptureVisibility } from '@/widgets/lobby-capture/api/confirm-capture';

export type UpdateCaptureInput =
  | {
      action: 'edit';
      captureId: string;
      /** New transcript. Pass null to leave unchanged. */
      transcript?: string | null;
      /** New parsed_note. Pass empty string to clear, null to leave unchanged. */
      parsedNote?: string | null;
    }
  | {
      action: 'reassign';
      captureId: string;
      /** Target entity id. Pass null to un-assign (detaches from any entity). */
      newEntityId: string | null;
    }
  | {
      action: 'visibility';
      captureId: string;
      visibility: CaptureVisibility;
    }
  | {
      action: 'delete';
      captureId: string;
    };

export type UpdateCaptureResult =
  | { ok: true }
  | { ok: false; error: string };

type CaptureRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  visibility: CaptureVisibility;
  transcript: string | null;
  parsed_note: string | null;
  resolved_entity_id: string | null;
};

async function loadCapture(
  supabase: Awaited<ReturnType<typeof createClient>>,
  captureId: string,
): Promise<CaptureRow | null> {
  // cortex schema isn't in generated types — cast through any for the chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .schema('cortex')
    .from('capture_events')
    .select(
      'id, workspace_id, user_id, visibility, transcript, parsed_note, resolved_entity_id',
    )
    .eq('id', captureId)
    .maybeSingle();
  return (data as CaptureRow | null) ?? null;
}

async function loadEntityName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
): Promise<string | null> {
  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name')
    .eq('id', entityId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

export async function updateCapture(
  input: UpdateCaptureInput,
): Promise<UpdateCaptureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const capture = await loadCapture(supabase, input.captureId);
  if (!capture) return { ok: false, error: 'Capture not found.' };

  // RLS enforces workspace visibility; the SECURITY DEFINER RPCs below
  // enforce owner-only mutation. This client-side check is belt-and-suspenders.
  if (capture.user_id !== user.id) {
    return { ok: false, error: 'You can only edit your own captures.' };
  }

  const invalidate = () => {
    // Entity detail page(s) — two routes serve the same entity.
    if (capture.resolved_entity_id) {
      revalidatePath(`/network/entity/${capture.resolved_entity_id}`);
    }
    revalidatePath('/lobby');
  };

  // All mutation RPCs live in cortex; must call with explicit schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cortex = supabase.schema('cortex');

  switch (input.action) {
    case 'edit': {
      const { error } = await cortex.rpc('update_capture_content', {
        p_capture_id: input.captureId,
        p_transcript: input.transcript ?? null,
        p_parsed_note: input.parsedNote ?? null,
      });
      if (error) return { ok: false, error: error.message };

      // Re-sync memory with the new content. Upsert replaces the embedding
      // row in-place; aion_memory will dedupe on the new fact text.
      if (capture.resolved_entity_id) {
        const entityName = await loadEntityName(supabase, capture.resolved_entity_id);
        const nextTranscript = input.transcript ?? capture.transcript ?? '';
        const nextNote =
          input.parsedNote === '' ? null
            : input.parsedNote ?? capture.parsed_note;
        await syncCaptureToMemory({
          workspaceId: capture.workspace_id,
          captureId: capture.id,
          userId: capture.user_id,
          visibility: capture.visibility,
          resolvedEntityId: capture.resolved_entity_id,
          resolvedEntityName: entityName,
          transcript: nextTranscript,
          parsedNote: nextNote,
        });
      }

      invalidate();
      return { ok: true };
    }

    case 'reassign': {
      // Also revalidate the OLD entity page so its timeline drops the row.
      const oldEntityId = capture.resolved_entity_id;

      const { error } = await cortex.rpc('reassign_capture', {
        p_capture_id: input.captureId,
        p_new_entity_id: input.newEntityId,
      });
      if (error) return { ok: false, error: error.message };

      // Rewrite the embedding so it indexes against the new entity. The old
      // aion_memory fact on the previous entity stays (see design doc §4.4
      // — acceptable decay; cleanup is future work).
      if (input.newEntityId) {
        const entityName = await loadEntityName(supabase, input.newEntityId);
        await syncCaptureToMemory({
          workspaceId: capture.workspace_id,
          captureId: capture.id,
          userId: capture.user_id,
          visibility: capture.visibility,
          resolvedEntityId: input.newEntityId,
          resolvedEntityName: entityName,
          transcript: capture.transcript ?? '',
          parsedNote: capture.parsed_note,
        });
      } else {
        // Un-assign: drop the embedding entirely.
        await removeCaptureFromMemory(capture.id);
      }

      if (oldEntityId) revalidatePath(`/network/entity/${oldEntityId}`);
      if (input.newEntityId) revalidatePath(`/network/entity/${input.newEntityId}`);
      revalidatePath('/lobby');
      return { ok: true };
    }

    case 'visibility': {
      const { error } = await cortex.rpc('update_capture_visibility', {
        p_capture_id: input.captureId,
        p_visibility: input.visibility,
      });
      if (error) return { ok: false, error: error.message };

      // Re-sync so the cortex.memory metadata reflects the new visibility.
      // The embedding itself doesn't change; metadata.visibility does.
      if (capture.resolved_entity_id) {
        const entityName = await loadEntityName(supabase, capture.resolved_entity_id);
        await syncCaptureToMemory({
          workspaceId: capture.workspace_id,
          captureId: capture.id,
          userId: capture.user_id,
          visibility: input.visibility,
          resolvedEntityId: capture.resolved_entity_id,
          resolvedEntityName: entityName,
          transcript: capture.transcript ?? '',
          parsedNote: capture.parsed_note,
        });
      }

      invalidate();
      return { ok: true };
    }

    case 'delete': {
      const { error } = await cortex.rpc('dismiss_capture', {
        p_capture_id: input.captureId,
      });
      if (error) return { ok: false, error: error.message };

      await removeCaptureFromMemory(capture.id);
      invalidate();
      return { ok: true };
    }
  }
}
