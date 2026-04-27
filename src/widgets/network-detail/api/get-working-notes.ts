/**
 * getWorkingNotes — read workspace-scoped working notes for one person.
 *
 * Returns three fields that earn a place on the person profile because they
 * change how the owner contacts this person day-to-day:
 *   • communication_style — free text ("prefers text over email")
 *   • dnr — flagged + reason + note ("paid late, three invoices")
 *   • preferred_channel — call / email / sms
 *
 * Storage: `directory.entity_working_notes`, keyed on (workspace_id, entity_id).
 * Reads use RLS (workspace members SELECT). Writes via RPC — see
 * update-working-notes.ts.
 *
 * Design: docs/reference/network-page-ia-redesign.md §4.1, §12.4.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type WorkingNotesDnrReason =
  | 'paid_late'
  | 'unreliable'
  | 'abuse'
  | 'contractual'
  | 'other';

export type WorkingNotesChannel = 'call' | 'email' | 'sms';

export type WorkingNotesFieldKey =
  | 'communication_style'
  | 'dnr'
  | 'preferred_channel';

export type WorkingNotes = {
  communicationStyle: string | null;
  dnrFlagged: boolean;
  dnrReason: WorkingNotesDnrReason | null;
  dnrNote: string | null;
  preferredChannel: WorkingNotesChannel | null;
  updatedAt: string | null;
  updatedByName: string | null;
  /** Fields most recently populated by Aion from a capture — for rendering the mark. */
  autoFilledFields: WorkingNotesFieldKey[];
};

export type GetWorkingNotesResult =
  | { ok: true; notes: WorkingNotes }
  | { ok: false; error: string };

type RawRow = {
  communication_style: string | null;
  dnr_flagged: boolean;
  dnr_reason: string | null;
  dnr_note: string | null;
  preferred_channel: string | null;
  updated_at: string | null;
  updated_by: string | null;
  auto_filled_fields: string[] | null;
};

const EMPTY: WorkingNotes = {
  communicationStyle: null,
  dnrFlagged: false,
  dnrReason: null,
  dnrNote: null,
  preferredChannel: null,
  updatedAt: null,
  updatedByName: null,
  autoFilledFields: [],
};

const ALL_FIELD_KEYS: readonly WorkingNotesFieldKey[] = [
  'communication_style',
  'dnr',
  'preferred_channel',
];

export async function getWorkingNotes(
  workspaceId: string,
  entityId: string,
): Promise<GetWorkingNotesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('directory')
    .from('entity_working_notes')
    .select(
      'communication_style, dnr_flagged, dnr_reason, dnr_note, preferred_channel, updated_at, updated_by, auto_filled_fields',
    )
    .eq('workspace_id', workspaceId)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (error) return { ok: false, error: (error as { message: string }).message };
  const row = (data as RawRow | null) ?? null;
  if (!row) return { ok: true, notes: EMPTY };

  // Resolve updated_by display name if present.
  let updatedByName: string | null = null;
  if (row.updated_by) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', row.updated_by)
      .maybeSingle();
    updatedByName = (profile as { full_name: string | null } | null)?.full_name ?? null;
  }

  const autoFilledFields = (row.auto_filled_fields ?? []).filter(
    (f): f is WorkingNotesFieldKey => (ALL_FIELD_KEYS as readonly string[]).includes(f),
  );

  return {
    ok: true,
    notes: {
      communicationStyle: row.communication_style,
      dnrFlagged: row.dnr_flagged,
      dnrReason: (row.dnr_reason as WorkingNotesDnrReason | null) ?? null,
      dnrNote: row.dnr_note,
      preferredChannel: (row.preferred_channel as WorkingNotesChannel | null) ?? null,
      updatedAt: row.updated_at,
      updatedByName,
      autoFilledFields,
    },
  };
}
