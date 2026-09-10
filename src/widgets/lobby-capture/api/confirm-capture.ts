/**
 * Confirm a capture — writes the linked ghost entity (if needed), the
 * capture_events audit row, and fans out to aion_memory + cortex.memory.
 *
 * Called from the CaptureModal after the user has reviewed the parse and
 * (optionally) edited the entity / follow-up / note / visibility. The
 * server action orchestrates cross-schema writes:
 *
 *   1. Resolve or ghost-create the entity in directory.entities.
 *   2. Call cortex.write_capture_confirmed RPC to persist the audit row.
 *   3. If an entity resolved — best-effort fan out to cortex.aion_memory
 *      (structured fact) and cortex.memory (RAG embedding) via
 *      syncCaptureToMemory. See docs/reference/capture-surfaces-design.md §4.2.
 *
 * Deferred to Phase E (follow-up queue unlock):
 *   - Writing a follow_up_queue row when parse.follow_up.suggested_when is
 *     an explicit ISO date. `ops.follow_up_queue.deal_id` is NOT NULL today
 *     and `reason_type` lacks `captured_intent`; both change in a later
 *     migration.
 *
 * Deferred to Phase 2 of the write side:
 *   - Uploading the audio blob to the `captures` storage bucket.
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { syncCaptureToMemory } from '@/app/api/aion/lib/capture-memory-sync';
import type { CaptureParseResult } from '@/app/api/aion/capture/parse/route';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { decideVenueFact, normaliseFact } from './venue-facts';

export type CaptureVisibility = 'user' | 'workspace';

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
    /**
     * Privacy tier for the capture. Defaults to `'user'` (owner-only) when
     * omitted — the composer toggle is the only way to promote to workspace
     * visibility, per the privacy-by-default rule in the design doc §10.
     */
    visibility?: CaptureVisibility;
    /**
     * Override for the parsed linked production. `undefined` = defer to parse,
     * `null` = user explicitly cleared, `{ kind, id }` = user picked one.
     * At most one of deal/event may be non-null (DB constraint).
     */
    linkedProduction?: { kind: 'deal' | 'event'; id: string } | null;
  };
};

export type ConfirmCaptureResult =
  | {
      ok: true;
      captureId: string;
      resolvedEntityId: string | null;
      /** Display name of the resolved entity, if any. Used by the success state. */
      resolvedEntityName: string | null;
    }
  | { ok: false; error: string };

/**
 * Phase 2 — read current working notes, upsert ONLY fields that are currently
 * null. The user's manual entries are sacred; Aion fills the empty slots.
 */
/**
 * Record what a person costs, when nothing is on file yet.
 *
 * Reads the existing attributes through the typed reader and patches back
 * through patch_entity_attributes, which merges rather than replaces -- writing
 * the blob wholesale would drop every other attribute on the entity.
 */
async function autoFillRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server client's generics vary; only .schema()/.rpc() are used.
  supabase: any,
  entityId: string,
  rate: NonNullable<CaptureParseResult['rate']>,
): Promise<void> {
  if (!Number.isFinite(rate.amount) || rate.amount <= 0) return;

  const { data: row } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', entityId)
    .maybeSingle();

  const attrs = readEntityAttrs((row as { attributes: unknown } | null)?.attributes, 'person');
  if (attrs.rate_amount != null) return;

  const patch: Record<string, unknown> = { rate_amount: rate.amount };
  const unit = rate.unit?.trim();
  if (unit) patch.rate_unit = unit;
  const note = rate.note?.trim();
  if (note) patch.rate_note = note;

  await supabase.schema('directory').rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: patch,
  });
}

/**
 * Land spoken venue facts in the spec fields.
 *
 * A venue's standing facts have a fixed shape, because the same questions get
 * asked at every venue every time: how do I get in, where do I park, where is
 * power, when do I have to stop. That makes them a form being filled in over
 * years, one voice note at a time -- not a list. A form can show what is still
 * missing; a list of notes never can.
 *
 * Fill-only, with one addition: hearing a fact that already matches what is on
 * file re-stamps its date. Venues go stale in specific ways -- new management,
 * a renovation, a limiter fitted after a noise complaint -- so "confirmed Aug
 * '24" is the difference between a spec you act on and one you ring to check.
 *
 * A spoken value that CONTRADICTS what is stored is deliberately not written.
 * Sending someone to the wrong dock on a misheard sentence is worse than
 * missing an update, and changing a spec stays a deliberate edit.
 */
async function autoFillVenueFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server client's generics vary; only .schema()/.rpc() are used.
  supabase: any,
  entityId: string,
  facts: NonNullable<CaptureParseResult['venue_facts']>,
): Promise<void> {
  const { data: row } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', entityId)
    .maybeSingle();

  const attrs = readEntityAttrs((row as { attributes: unknown } | null)?.attributes, 'venue');
  const current = attrs as unknown as Record<string, unknown>;
  const confirmedOn = { ...((attrs.specs_confirmed as Record<string, string> | null) ?? {}) };
  const today = new Date().toISOString().slice(0, 10);

  const patch: Record<string, unknown> = {};
  let touched = false;

  for (const [key, spoken] of Object.entries(facts)) {
    const outcome = decideVenueFact(spoken, current[key]);
    if (outcome === 'skip') continue;
    if (outcome === 'fill') patch[key] = normaliseFact(spoken);
    confirmedOn[key] = today;
    touched = true;
  }

  if (!touched) return;

  patch.specs_confirmed = confirmedOn;
  await supabase.schema('directory').rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: patch,
  });
}

async function autoFillWorkingNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  entityId: string,
  signals: NonNullable<CaptureParseResult['working_notes_signals']>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await supabase
    .schema('directory')
    .from('entity_working_notes')
    .select('communication_style, dnr_flagged, dnr_reason, preferred_channel')
    .eq('workspace_id', workspaceId)
    .eq('entity_id', entityId)
    .maybeSingle();

  const current = (existing as {
    communication_style: string | null;
    dnr_flagged: boolean;
    dnr_reason: string | null;
    preferred_channel: string | null;
  } | null) ?? null;

  // Build the patch: only include fields that are empty today and have a signal.
  const patch: {
    p_communication_style?: string;
    p_dnr_flagged?: boolean;
    p_dnr_reason?: string;
    p_dnr_note?: string;
    p_preferred_channel?: string;
  } = {};

  const trimmedCommStyle = signals.communication_style?.trim() ?? '';
  if (trimmedCommStyle && !current?.communication_style) {
    patch.p_communication_style = trimmedCommStyle;
  }

  if (signals.dnr_reason && !current?.dnr_flagged) {
    patch.p_dnr_flagged = true;
    patch.p_dnr_reason = signals.dnr_reason;
    const note = signals.dnr_note?.trim();
    if (note) patch.p_dnr_note = note;
  }

  const prefChannel = signals.preferred_channel?.trim() ?? '';
  if (prefChannel && !current?.preferred_channel) {
    patch.p_preferred_channel = prefChannel;
  }

  if (Object.keys(patch).length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.schema('directory').rpc('upsert_entity_working_notes', {
    p_workspace_id: workspaceId,
    p_entity_id: entityId,
    p_communication_style: patch.p_communication_style ?? undefined,
    p_dnr_flagged: patch.p_dnr_flagged ?? undefined,
    p_dnr_reason: patch.p_dnr_reason ?? undefined,
    p_dnr_note: patch.p_dnr_note ?? undefined,
    p_preferred_channel: patch.p_preferred_channel ?? undefined,
    p_source: 'capture',
  });
}

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
): Promise<{ id: string; name: string } | { error: string }> {
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
    .select('id, display_name')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create entity.' };
  }
  return { id: data.id, name: data.display_name ?? trimmed };
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

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!member) return { ok: false, error: 'Not authorized for this workspace.' };

  // ── Resolve entity ────────────────────────────────────────────────────────
  let resolvedEntityId: string | null = null;
  let resolvedEntityName: string | null = null;

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
    resolvedEntityName = result.name;
  }

  // If an existing entity was picked (not ghost-created), fetch its display
  // name + type so the memory embedding's context header can ground on a real
  // name, and we can decide whether to auto-populate working notes.
  let resolvedEntityType: string | null = null;
  if (resolvedEntityId) {
    const { data: entRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name, type')
      .eq('id', resolvedEntityId)
      .maybeSingle();
    if (!resolvedEntityName) {
      resolvedEntityName = entRow?.display_name ?? null;
    }
    resolvedEntityType = (entRow as { type: string | null } | null)?.type ?? null;
  }

  // ── Resolve parsed fields with edits ─────────────────────────────────────
  const finalNote = edits?.note !== undefined ? edits.note : parse.note;
  const finalFollowUp =
    edits?.followUpText !== undefined
      ? edits.followUpText
        ? { ...(parse.follow_up ?? {}), text: edits.followUpText }
        : null
      : parse.follow_up;
  const visibility: CaptureVisibility = edits?.visibility ?? 'user';

  // Resolve linked production: explicit user override wins; else parse.
  const parsedLink = parse.linked_production ?? null;
  const finalLink =
    edits?.linkedProduction !== undefined ? edits.linkedProduction : parsedLink;
  const linkedDealId = finalLink?.kind === 'deal' ? finalLink.id : null;
  const linkedEventId = finalLink?.kind === 'event' ? finalLink.id : null;

  // Where the note gets filed. Only meaningful with a production attached --
  // "true for that one show" says nothing when there is no show -- and the RPC
  // drops a dangling 'show' for the same reason. Null lands on the profile,
  // which is the safe direction: noise there is visible and gets fixed in a
  // tap, while a wrongly demoted note is invisible and never gets corrected.
  const noteScope = finalLink ? parse.note_scope : null;

  // ── Persist the capture row ──────────────────────────────────────────────
  // cortex RPCs must be called with explicit .schema('cortex') — the default
  // schema is public and this function only exists in cortex.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: captureId, error: rpcError } = await supabase
    .schema('cortex')
    .rpc('write_capture_confirmed', {
      p_workspace_id: workspaceId,
      p_transcript: transcript,
      p_parsed_entity: parse.entity ?? null,
      p_parsed_follow_up: finalFollowUp ?? null,
      p_parsed_note: finalNote && finalNote.length > 0 ? finalNote : undefined,
      p_resolved_entity_id: resolvedEntityId ?? undefined,
      p_created_follow_up_queue_id: null, // deferred — see header comment ?? undefined,
      p_audio_storage_path: null,         // deferred — see header comment ?? undefined,
      p_visibility: visibility,
      p_linked_deal_id: linkedDealId ?? undefined,
      p_note_scope: noteScope ?? undefined,
      p_linked_event_id: linkedEventId ?? undefined,
    });

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }
  if (!captureId) {
    return { ok: false, error: 'Write refused — workspace mismatch.' };
  }

  // ── Fan out to aion_memory + cortex.memory ───────────────────────────────
  // Best-effort. A failure here does not fail the capture — the audit row
  // is canonical and the memory layer can be rebuilt from it.
  if (resolvedEntityId) {
    await syncCaptureToMemory({
      workspaceId,
      captureId: captureId as string,
      userId: user.id,
      visibility,
      resolvedEntityId,
      resolvedEntityName,
      transcript,
      parsedNote: finalNote && finalNote.length > 0 ? finalNote : null,
    });
  }

  // ── Auto-populate Working notes (Phase 2) ────────────────────────────────
  // Venue facts, when the capture is about a venue.
  if (resolvedEntityId && parse.venue_facts && resolvedEntityType === 'venue') {
    try {
      await autoFillVenueFacts(supabase, resolvedEntityId, parse.venue_facts);
    } catch (err) {
      console.error('[confirmCapture] autoFillVenueFacts failed:', err);
    }
  }

  // A spoken rate, when the person has none on file.
  //
  // Fill-only, like the working-notes signals above: a rate already recorded is
  // a number quoted from, and having a misheard "four fifty" silently replace a
  // real 550 is worse than never hearing it. Changing an existing rate stays a
  // deliberate edit.
  if (
    resolvedEntityId
    && parse.rate
    && (resolvedEntityType === 'person' || resolvedEntityType === 'couple')
  ) {
    try {
      await autoFillRate(supabase, resolvedEntityId, parse.rate);
    } catch (err) {
      console.error('[confirmCapture] autoFillRate failed:', err);
    }
  }

  // Only when the parse surfaced explicit signals AND the entity is a person
  // or couple. NEVER overwrites existing values — the user's hand-entry is
  // sacred. Best-effort.
  if (
    resolvedEntityId
    && parse.working_notes_signals
    && (resolvedEntityType === 'person' || resolvedEntityType === 'couple')
  ) {
    try {
      await autoFillWorkingNotes(
        supabase,
        workspaceId,
        resolvedEntityId,
        parse.working_notes_signals,
      );
    } catch (err) {
      console.error('[confirmCapture] autoFillWorkingNotes failed:', err);
    }
  }

  revalidatePath('/lobby');

  return {
    ok: true,
    captureId: captureId as string,
    resolvedEntityId,
    resolvedEntityName,
  };
}
