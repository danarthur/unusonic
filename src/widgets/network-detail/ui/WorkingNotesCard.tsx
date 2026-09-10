'use client';

/**
 * WorkingNotesCard — what a workspace privately knows about a contact.
 *
 * Renders only when something is populated. The Day.ai pattern: empty fields
 * look like a half-built product, so we hide them until a real value lands.
 *
 * Always shows an edit affordance (pencil on hover of the card, or the "Add
 * working notes" empty-state when nothing exists yet). Edit surfaces four
 * inline fields:
 *   • Communication style — free text, ≤ 200 chars
 *   • DNR — toggle + reason select + optional note
 *   • Preferred channel — call / email / sms / none
 *   • Private notes — free text, ≤ 5000 chars, never written by a capture
 *
 * Design: docs/reference/network-page-ia-redesign.md §4.1, §12.4.
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Lock, MessageCircle, Phone, Mail, AlertTriangle, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import {
  getWorkingNotes,
  type WorkingNotes,
  type WorkingNotesChannel,
  type WorkingNotesDnrReason,
  type WorkingNotesFieldKey,
} from '../api/get-working-notes';
import {
  updateWorkingNotes,
  type UpdateWorkingNotesPatch,
} from '../api/update-working-notes';
import { PRIVATE_NOTES_MAX } from '../model/working-notes-limits';
import { formatRelative } from '@/shared/lib/format-relative';

export interface WorkingNotesCardProps {
  workspaceId: string;
  entityId: string;
  /**
   * What the contact is, so the card can leave out fields that mean nothing
   * for them. A venue's contact preference lives on the venue's own PM fields,
   * not here; offering both is two homes for one answer.
   */
  entityType?: 'person' | 'company' | 'venue' | 'couple';
}

const DNR_REASONS: { value: WorkingNotesDnrReason; label: string }[] = [
  { value: 'paid_late', label: 'Paid late' },
  { value: 'unreliable', label: 'Unreliable' },
  { value: 'contractual', label: 'Contractual' },
  { value: 'abuse', label: 'Abuse / safety' },
  { value: 'other', label: 'Other' },
];

const CHANNELS: { value: WorkingNotesChannel; label: string; Icon: typeof Phone }[] = [
  { value: 'call', label: 'Call', Icon: Phone },
  { value: 'email', label: 'Email', Icon: Mail },
  { value: 'sms', label: 'Text', Icon: MessageCircle },
];

export function WorkingNotesCard({ workspaceId, entityId, entityType }: WorkingNotesCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.workingNotes(workspaceId, entityId),
    queryFn: () => getWorkingNotes(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  const mutation = useMutation({
    mutationFn: (patch: UpdateWorkingNotesPatch) =>
      updateWorkingNotes(workspaceId, entityId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.entities.workingNotes(workspaceId, entityId),
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save.', { duration: Infinity });
    },
  });

  const notes = data && 'ok' in data && data.ok ? data.notes : null;

  // Hide entirely on loading — skeleton feels heavy for a potentially-empty card.
  if (isLoading) return null;

  // A venue has `venue_contact_name`/`venue_pm_phone` of its own; a second
  // "preferred channel" here would be a competing answer to the same question.
  const showsChannel = entityType !== 'venue';

  const hasContent =
    !!notes?.communicationStyle ||
    notes?.dnrFlagged ||
    (showsChannel && !!notes?.preferredChannel) ||
    !!notes?.privateNotes;

  // Empty state + not editing → render a subtle "Add" affordance that fits
  // a minimal profile without looking broken.
  if (!hasContent && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'w-full text-left inline-flex items-center gap-2 px-3 py-2',
          'rounded-md border border-dashed border-[var(--stage-edge-subtle)]',
          'bg-transparent',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
          'hover:border-[var(--stage-edge-top)] transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        )}
        aria-label="Add handling preferences"
      >
        <Pencil className="size-3" strokeWidth={1.5} />
        <span className="text-[11px]">Add handling preferences</span>
      </button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_LIGHT}
      className={cn(
        'group rounded-[var(--stage-radius-panel)]',
        'bg-[var(--stage-surface-elevated)] p-4 space-y-3',
      )}
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <h3 className="stage-label text-[var(--stage-text-secondary)]">
          How to handle
        </h3>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? 'Cancel edit' : 'Edit working notes'}
          className={cn(
            'p-1 rounded-md text-[var(--stage-text-tertiary)]',
            'hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]',
            'transition-colors',
            editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          {editing ? <X className="size-3.5" strokeWidth={1.5} /> : <Pencil className="size-3" strokeWidth={1.5} />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {editing ? (
          <WorkingNotesEditor
            key="edit"
            showsChannel={showsChannel}
            initial={notes ?? DEFAULT_NOTES}
            onCancel={() => setEditing(false)}
            onSave={async (patch) => {
              await mutation.mutateAsync(patch);
              setEditing(false);
            }}
            saving={mutation.isPending}
          />
        ) : (
          <WorkingNotesDisplay key="view" notes={notes!} showsChannel={showsChannel} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const DEFAULT_NOTES: WorkingNotes = {
  communicationStyle: null,
  dnrFlagged: false,
  dnrReason: null,
  dnrNote: null,
  preferredChannel: null,
  privateNotes: null,
  updatedAt: null,
  updatedByName: null,
  autoFilledFields: [],
};

/**
 * AionMark rendered at inline-text size. Indicates a field was auto-filled
 * by Aion from a capture — user hand-edits remove the mark (the mutation RPC
 * drops the field from `auto_filled_fields` on source='manual' writes).
 */
function AionFilled({ field, autoFilled }: { field: WorkingNotesFieldKey; autoFilled: WorkingNotesFieldKey[] }) {
  if (!autoFilled.includes(field)) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center text-[var(--stage-text-tertiary)]"
      title="Auto-filled by Aion from a capture"
      aria-label="Auto-filled by Aion"
    >
      <AionMark size={12} />
    </span>
  );
}

// ── Display mode ─────────────────────────────────────────────────────────────

function WorkingNotesDisplay({ notes, showsChannel }: { notes: WorkingNotes; showsChannel: boolean }) {
  const channel = showsChannel && notes.preferredChannel
    ? CHANNELS.find((c) => c.value === notes.preferredChannel)
    : null;
  const autoFilled = notes.autoFilledFields;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="space-y-2"
    >
      {notes.communicationStyle && (
        <p className="flex items-start gap-1.5 text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] leading-snug">
          <span>{notes.communicationStyle}</span>
          <AionFilled field="communication_style" autoFilled={autoFilled} />
        </p>
      )}

      {(channel || notes.dnrFlagged) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {channel && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
                'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)]',
                'stage-badge-text text-[var(--stage-text-secondary)]',
              )}
              title="Preferred channel"
            >
              <channel.Icon className="size-2.5" strokeWidth={1.5} />
              {channel.label}
              <AionFilled field="preferred_channel" autoFilled={autoFilled} />
            </span>
          )}

          {notes.dnrFlagged && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
                'bg-[var(--color-unusonic-warning)]/15',
                'stage-badge-text text-[var(--color-unusonic-warning)]',
              )}
              title={notes.dnrNote ?? 'Do not rebook'}
            >
              <AlertTriangle className="size-2.5" strokeWidth={1.5} />
              DNR
              {notes.dnrReason && (
                <span className="opacity-80">
                  · {DNR_REASONS.find((r) => r.value === notes.dnrReason)?.label ?? notes.dnrReason}
                </span>
              )}
              <AionFilled field="dnr" autoFilled={autoFilled} />
            </span>
          )}
        </div>
      )}

      {notes.dnrFlagged && notes.dnrNote && (
        <p className="text-[11px] text-[var(--stage-text-tertiary)] italic">
          {notes.dnrNote}
        </p>
      )}

      {/*
        Private notes read as prose, so they get their own block rather than a
        chip. `whitespace-pre-wrap` because someone who types paragraphs meant
        them. No AionFilled: a capture cannot write this field.
      */}
      {notes.privateNotes && (
        <div className="pt-1 space-y-1">
          <p className="flex items-center gap-1 stage-label text-[var(--stage-text-tertiary)]">
            <Lock className="size-2.5" strokeWidth={1.5} />
            Private notes
          </p>
          <p className="whitespace-pre-wrap text-[length:var(--stage-data-size)] leading-snug text-[var(--stage-text-primary)]">
            {notes.privateNotes}
          </p>
        </div>
      )}

      {notes.updatedAt && notes.updatedByName && (
        <div className="flex items-center gap-1 pt-0.5 text-[10px] text-[var(--stage-text-tertiary)]">
          <Lock className="size-2.5" strokeWidth={1.5} />
          <span>updated by {notes.updatedByName} · {formatRelative(notes.updatedAt)}</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Edit mode ────────────────────────────────────────────────────────────────

function WorkingNotesEditor({
  initial,
  onCancel,
  onSave,
  saving,
  showsChannel,
}: {
  initial: WorkingNotes;
  onCancel: () => void;
  onSave: (patch: UpdateWorkingNotesPatch) => Promise<void> | void;
  saving: boolean;
  showsChannel: boolean;
}) {
  const [commStyle, setCommStyle] = React.useState(initial.communicationStyle ?? '');
  const [channel, setChannel] = React.useState<WorkingNotesChannel | ''>(
    initial.preferredChannel ?? '',
  );
  const [dnrFlagged, setDnrFlagged] = React.useState(initial.dnrFlagged);
  const [dnrReason, setDnrReason] = React.useState<WorkingNotesDnrReason | ''>(
    initial.dnrReason ?? '',
  );
  const [dnrNote, setDnrNote] = React.useState(initial.dnrNote ?? '');
  const [privateNotes, setPrivateNotes] = React.useState(initial.privateNotes ?? '');

  const handleSave = () => {
    // Build a patch that only includes CHANGED fields. "Empty string" means
    // explicit clear in the server patch semantics.
    const patch: UpdateWorkingNotesPatch = {};

    const origStyle = initial.communicationStyle ?? '';
    if (commStyle !== origStyle) {
      patch.communicationStyle = commStyle === '' ? '' : commStyle;
    }

    const origChannel = initial.preferredChannel ?? '';
    if (channel !== origChannel) {
      patch.preferredChannel = channel === '' ? '' : channel;
    }

    const origFlagged = initial.dnrFlagged;
    const origReason = initial.dnrReason ?? '';
    const origNote = initial.dnrNote ?? '';
    const dnrChanged =
      dnrFlagged !== origFlagged ||
      dnrReason !== origReason ||
      dnrNote !== origNote;
    if (dnrChanged) {
      patch.dnr = {};
      if (dnrFlagged !== origFlagged) patch.dnr.flagged = dnrFlagged;
      if (dnrReason !== origReason) {
        patch.dnr.reason = dnrReason === '' ? '' : (dnrReason as WorkingNotesDnrReason);
      }
      if (dnrNote !== origNote) {
        patch.dnr.note = dnrNote === '' ? '' : dnrNote;
      }
    }

    const origPrivate = initial.privateNotes ?? '';
    if (privateNotes !== origPrivate) {
      patch.privateNotes = privateNotes === '' ? '' : privateNotes;
    }

    void onSave(patch);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="space-y-3"
    >
      {/* Communication style */}
      <div className="space-y-1">
        <Label>Communication style</Label>
        <input
          type="text"
          value={commStyle}
          onChange={(e) => setCommStyle(e.target.value.slice(0, 200))}
          placeholder="e.g. prefers text over email"
          disabled={saving}
          className={cn(
            'w-full text-sm px-2 py-1.5 rounded-md',
            'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
            'text-[var(--stage-text-primary)]',
            'placeholder:text-[var(--stage-text-tertiary)]',
            'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
          )}
        />
      </div>

      {/* Preferred channel */}
      {showsChannel && (
      <div className="space-y-1">
        <Label>Preferred channel</Label>
        <div className="flex gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setChannel(channel === c.value ? '' : c.value)}
              disabled={saving}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md',
                'border text-xs transition-colors',
                channel === c.value
                  ? 'border-[var(--stage-accent)]/50 bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]'
                  : 'border-transparent bg-[var(--ctx-well)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
              )}
            >
              <c.Icon className="size-3" strokeWidth={1.5} />
              {c.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* DNR */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Do not rebook</Label>
          <button
            type="button"
            onClick={() => setDnrFlagged((v) => !v)}
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
              'stage-badge-text transition-colors',
              dnrFlagged
                ? 'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]'
                : 'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]',
            )}
          >
            <AlertTriangle className="size-2.5" strokeWidth={1.5} />
            {dnrFlagged ? 'Flagged' : 'Not flagged'}
          </button>
        </div>
        {dnrFlagged && (
          <>
            <select
              value={dnrReason}
              onChange={(e) => setDnrReason(e.target.value as WorkingNotesDnrReason | '')}
              disabled={saving}
              className={cn(
                'w-full text-xs px-2 py-1.5 rounded-md',
                'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
                'text-[var(--stage-text-primary)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
              )}
            >
              <option value="">Reason (optional)</option>
              {DNR_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={dnrNote}
              onChange={(e) => setDnrNote(e.target.value.slice(0, 200))}
              placeholder="Optional note"
              disabled={saving}
              className={cn(
                'w-full text-xs px-2 py-1.5 rounded-md',
                'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
                'text-[var(--stage-text-primary)]',
                'placeholder:text-[var(--stage-text-tertiary)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
              )}
            />
          </>
        )}
      </div>

      {/* Private notes */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Private notes</Label>
          {privateNotes.length > PRIVATE_NOTES_MAX - 500 && (
            <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
              {privateNotes.length} / {PRIVATE_NOTES_MAX}
            </span>
          )}
        </div>
        <textarea
          value={privateNotes}
          onChange={(e) => setPrivateNotes(e.target.value.slice(0, PRIVATE_NOTES_MAX))}
          placeholder="What you would want to remember before the next conversation"
          rows={4}
          disabled={saving}
          className={cn(
            'w-full text-sm px-2 py-1.5 rounded-md resize-y',
            'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
            'text-[var(--stage-text-primary)]',
            'placeholder:text-[var(--stage-text-tertiary)]',
            'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
          )}
        />
        <p className="flex items-center gap-1 text-[10px] text-[var(--stage-text-tertiary)]">
          <Lock className="size-2.5" strokeWidth={1.5} />
          Only your workspace sees this.
        </p>
      </div>

      {/* Save / cancel */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="stage-btn stage-btn-ghost text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
        >
          {saving ? 'Saving…' : (
            <>
              <Check className="size-3" strokeWidth={2} />
              Save
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--stage-text-tertiary)]">
      {children}
    </div>
  );
}

