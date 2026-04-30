'use client';

/**
 * Roster-status action cards for the NetworkDetailSheet transmission panel.
 *
 * Extracted from NetworkDetailSheet.tsx during the Phase 0.5-style split
 * (2026-04-28). Renders the portal-invite card and the roster status panel
 * (do-not-rebook flag, archive/unarchive, remove-from-roster with force).
 * Each action is locally stateful — keep the optimistic UI + confirm flows
 * here; the parent only listens for onSaved/onRemoved callbacks.
 */

import * as React from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  archiveRosterMember,
  removeRosterMember,
  setDoNotRebook,
} from '@/features/network-data';
import { deployInvites } from '@/features/team-invite/api/actions';
import type { NodeDetail } from '@/features/network-data';

export function InviteCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(details.inviteStatus === 'invited');

  const handleSend = async () => {
    setSending(true);
    setError(null);
    const result = await deployInvites(sourceOrgId, [details.id]);
    setSending(false);
    if (result.ok && result.sent > 0) {
      setSent(true);
      onSaved();
    } else if (result.ok && result.sent === 0) {
      setError('No invite to send. Check that this member has an email address.');
    } else if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">
            {sent ? 'Invite sent' : 'Invite to portal'}
          </h3>
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
            {sent
              ? 'Waiting for acceptance.'
              : 'Send an invite so they can access their schedule and profile.'}
          </p>
        </div>
        {!sent && (
          <Button
            variant="default"
            size="sm"
            onClick={handleSend}
            disabled={sending}
          >
            <Send className="size-3.5 mr-1.5" strokeWidth={1.5} />
            {sending ? 'Sending...' : 'Send invite'}
          </Button>
        )}
        {sent && (
          <span className="stage-badge-text px-2.5 py-1 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]">
            Pending
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)] mt-2">{error}</p>}
    </div>
  );
}

export function RosterStatusCard({
  details,
  sourceOrgId,
  onRemoved,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onRemoved: () => void;
  onSaved: () => void;
}) {
  const doNotRebook = details.doNotRebook ?? false;
  const isArchived = details.archived ?? false;

  // Archive confirm state
  const [archiveConfirm, setArchiveConfirm] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  // Remove confirm state
  const [removeConfirm, setRemoveConfirm] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [forceCount, setForceCount] = React.useState<number | null>(null);

  // DNR state
  const [dnrSaving, setDnrSaving] = React.useState(false);
  const [dnrError, setDnrError] = React.useState<string | null>(null);

  const handleDnrToggle = async () => {
    setDnrSaving(true);
    setDnrError(null);
    const result = await setDoNotRebook(details.id, sourceOrgId, !doNotRebook);
    setDnrSaving(false);
    if (result.ok) {
      onSaved();
    } else {
      setDnrError(result.error);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setArchiveError(null);
    const result = await archiveRosterMember(details.id, sourceOrgId, !isArchived);
    setArchiving(false);
    if (result.ok) {
      setArchiveConfirm(false);
      onSaved();
    } else {
      setArchiveError(result.error);
    }
  };

  const handleRemove = async (force?: boolean) => {
    setRemoving(true);
    setRemoveError(null);
    const result = await removeRosterMember(details.id, sourceOrgId, force);
    setRemoving(false);
    if (result.ok) {
      onRemoved();
    } else if ('requiresForce' in result && result.requiresForce) {
      setForceCount(result.assignmentCount ?? null);
    } else {
      setRemoveError(result.error);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3" data-surface="elevated">
      <h3 className="stage-label text-[var(--stage-text-secondary)]">
        Roster actions
      </h3>

      {/* Do-not-rebook */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">Do not rebook</p>
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
              Flags this person in scheduling suggestions.
            </p>
          </div>
          {doNotRebook ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-unusonic-warning)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-unusonic-warning)]">
                Flagged
              </span>
              <button
                type="button"
                onClick={handleDnrToggle}
                disabled={dnrSaving}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors disabled:opacity-[0.45]"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDnrToggle}
              disabled={dnrSaving}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-warning)]/50 hover:text-[var(--color-unusonic-warning)] transition-colors disabled:opacity-[0.45]"
            >
              Flag do not rebook
            </button>
          )}
        </div>
        {doNotRebook && details.lastModifiedByName && (
          <p className="text-xs text-[var(--stage-text-tertiary)]">
            Set by {details.lastModifiedByName}
            {details.lastModifiedAt ? ` · ${new Date(details.lastModifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          </p>
        )}
        {dnrError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{dnrError}</p>}
      </div>

      {/* Archive / Unarchive */}
      <div className="space-y-1 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {isArchived ? 'Archived' : 'Archive'}
            </p>
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
              {isArchived
                ? 'Member is on record but excluded from active scheduling.'
                : 'Keeps the member on record but removes from active scheduling.'}
            </p>
          </div>
          {isArchived ? (
            <button
              type="button"
              onClick={() => handleArchive()}
              disabled={archiving}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors disabled:opacity-[0.45]"
            >
              {archiving ? 'Restoring…' : 'Unarchive'}
            </button>
          ) : archiveConfirm ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiving}
                className="rounded-lg bg-[var(--color-unusonic-warning)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-unusonic-warning)] hover:bg-[var(--color-unusonic-warning)]/25 transition-colors disabled:opacity-[0.45]"
              >
                {archiving ? 'Archiving…' : 'Confirm archive?'}
              </button>
              <button
                type="button"
                onClick={() => setArchiveConfirm(false)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setArchiveConfirm(true)}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-warning)]/50 hover:text-[var(--color-unusonic-warning)] transition-colors"
            >
              Archive
            </button>
          )}
        </div>
        {archiveError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{archiveError}</p>}
      </div>

      {/* Remove from roster */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex-1">
          <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">Remove from roster</p>
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            Permanently removes this member. Cannot be undone.
          </p>
        </div>
        {removeConfirm ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRemove(forceCount !== null ? true : false)}
              disabled={removing}
              className="rounded-lg bg-[var(--color-unusonic-error)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/25 transition-colors disabled:opacity-[0.45]"
            >
              {removing
                ? 'Removing…'
                : forceCount !== null
                ? `${forceCount} assignment(s) — remove anyway?`
                : 'Confirm remove?'}
            </button>
            <button
              type="button"
              onClick={() => { setRemoveConfirm(false); setForceCount(null); }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRemoveConfirm(true);
              setForceCount(null);
              setRemoveError(null);
            }}
            className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-error)]/50 hover:text-[var(--color-unusonic-error)] transition-colors"
          >
            Remove from roster
          </button>
        )}
      </div>
      {removeError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{removeError}</p>}
    </div>
  );
}
