/**
 * Capture → memory write-through.
 *
 * When a capture confirms (or reassigns to a new entity) we fan out to:
 *   1. cortex.aion_memory  — entity-scoped structured fact, retrievable by
 *                            Aion chat. Scoped user_id=user for visibility=
 *                            'user' captures, NULL for 'workspace'.
 *   2. cortex.memory       — embedded chunk indexed on entity_ids, searchable
 *                            via cortex.match_memory RPC.
 *
 * Both writes are best-effort — a failure logs but does not throw. The
 * capture_events audit row is the canonical source; these secondary writes
 * can be rebuilt from it.
 *
 * Design: docs/reference/capture-surfaces-design.md §4.2.
 */

import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';
import { embedContent, buildContextHeader } from './embeddings';

export type CaptureMemorySyncInput = {
  workspaceId: string;
  captureId: string;
  userId: string;
  visibility: 'user' | 'workspace';
  resolvedEntityId: string;
  resolvedEntityName: string | null;
  transcript: string;
  parsedNote: string | null;
};

/**
 * Write the aion_memory fact + cortex.memory embedding for one capture.
 * Safe to re-run — save_aion_memory dedupes by (workspace, scope, fact,
 * user_id, entity_id), and upsert_memory_embedding is keyed on
 * (source_type, source_id).
 */
export async function syncCaptureToMemory(
  input: CaptureMemorySyncInput,
): Promise<void> {
  const {
    workspaceId,
    captureId,
    userId,
    visibility,
    resolvedEntityId,
    resolvedEntityName,
    transcript,
    parsedNote,
  } = input;

  const system = getSystemClient();

  // User-scoped memory when the capture is private; workspace-scoped otherwise.
  const scopedUserId = visibility === 'user' ? userId : null;

  // ── 1. aion_memory fact ────────────────────────────────────────────────────
  // The fact powers Aion chat recall ("what about Alexa?"). Prefer the
  // distilled parsed_note over the raw transcript — that's what the user
  // wants Aion to remember.
  const fact = (parsedNote ?? '').trim() || transcript.trim();
  if (fact.length > 0) {
    try {
      await system.schema('cortex').rpc('save_aion_memory' as never, {
        p_workspace_id: workspaceId,
        p_scope: 'episodic',
        p_fact: fact,
        p_source: 'capture',
        p_user_id: scopedUserId,
        p_entity_id: resolvedEntityId,
      } as never);
    } catch (err) {
      console.error(
        `[capture-memory-sync] save_aion_memory failed for capture ${captureId}:`,
        err,
      );
    }
  }

  // ── 2. cortex.memory embedding ─────────────────────────────────────────────
  // Combine transcript + parsed note so the RAG surface catches both the
  // verbatim quote ("he said hates Tuesdays") and the distilled fact
  // ("prefers text over email"). Metadata carries the user_id + visibility
  // so the chat recall tool can filter private captures to their author.
  const contentText = [transcript.trim(), parsedNote?.trim()]
    .filter((s): s is string => Boolean(s && s.length > 0))
    .join('\n\n');

  if (contentText.length > 0) {
    try {
      const header = buildContextHeader('capture', {
        entityName: resolvedEntityName ?? null,
        date: new Date().toISOString().slice(0, 10),
      });
      const embedding = await embedContent(contentText, header);
      const embeddingStr = `[${embedding.join(',')}]`;

      await system.schema('cortex').rpc('upsert_memory_embedding' as never, {
        p_workspace_id: workspaceId,
        p_source_type: 'capture',
        p_source_id: captureId,
        p_content_text: contentText,
        p_content_header: header,
        p_embedding: embeddingStr,
        p_entity_ids: [resolvedEntityId],
        p_metadata: {
          user_id: userId,
          visibility,
          entity_id: resolvedEntityId,
        },
      } as never);
    } catch (err) {
      console.error(
        `[capture-memory-sync] upsert_memory_embedding failed for capture ${captureId}:`,
        err,
      );
    }
  }
}

/**
 * Remove a capture's embedding from cortex.memory. Called from the dismiss
 * path (soft-delete) so the embedding stops appearing in RAG results.
 *
 * The aion_memory fact is left in place — dedup by (scope, fact, user_id,
 * entity_id) means identical facts from other captures would get bumped,
 * and deleting here would drop them too. Acceptable decay: the fact lingers
 * until a workspace-wide aion_memory sweep rebuilds from live captures.
 */
export async function removeCaptureFromMemory(captureId: string): Promise<void> {
  try {
    const system = getSystemClient();
    await system.schema('cortex').rpc('delete_memory_embedding' as never, {
      p_source_type: 'capture',
      p_source_id: captureId,
    } as never);
  } catch (err) {
    console.error(
      `[capture-memory-sync] delete_memory_embedding failed for capture ${captureId}:`,
      err,
    );
  }
}
