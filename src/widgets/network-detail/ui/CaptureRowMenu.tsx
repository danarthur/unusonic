'use client';

/**
 * The per-note actions menu on the capture timeline.
 *
 * Lifted out of CaptureTimelinePanel, which was past a thousand lines. The two
 * scope actions are the reason it grew: a note can be moved between the profile
 * and its show from here, in either direction.
 *
 * Both directions matter, but not equally. Demoting is the complaint that
 * started this work; promoting is the one that keeps the profile honest, since
 * a judgement wrongly filed under a show is invisible and would otherwise stay
 * that way. Either way the placement is pinned, because a correction the next
 * parse can undo is a correction nobody bothers to make twice.
 *
 * @module widgets/network-detail/ui/CaptureRowMenu
 */

import * as React from 'react';
import {
  MoreHorizontal,
  Lock,
  Users,
  Pencil,
  Link2,
  Trash2,
  FileText,
  CalendarCheck2,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import { updateCapture } from '../api/update-capture';
import type { EntityCapture } from '../api/get-entity-captures';

export function CaptureRowMenu({
  capture,
  isOwn,
  expanded,
  onToggleTranscript,
  onStartEdit,
  onStartReassign,
  onMutated,
}: {
  capture: EntityCapture;
  isOwn: boolean;
  expanded: boolean;
  onToggleTranscript: () => void;
  onStartEdit: () => void;
  onStartReassign: () => void;
  onMutated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pendingVisibilityConfirm, setPendingVisibilityConfirm] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState(false);

  const isPrivate = capture.visibility === 'user';

  const handleVisibility = async () => {
    const next = isPrivate ? 'workspace' : 'user';
    // Confirm on user→workspace promotion only; workspace→user is always safe.
    if (isPrivate && !pendingVisibilityConfirm) {
      setPendingVisibilityConfirm(true);
      return;
    }
    setPendingVisibilityConfirm(false);
    const result = await updateCapture({
      action: 'visibility',
      captureId: capture.id,
      visibility: next,
    });
    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    toast.success(next === 'workspace' ? 'Shared with team.' : 'Made private.');
    setOpen(false);
    onMutated();
  };

  /**
   * Move a note between the profile and its show.
   *
   * Offered in both directions on purpose. Demoting is the complaint that
   * started this, but promoting is the one that matters: a logistics note left
   * on the profile is visible and gets fixed, while a judgement wrongly filed
   * under a show is invisible, and without this control it stays that way.
   */
  const handleScope = async (noteScope: 'about' | 'show') => {
    const result = await updateCapture({ action: 'scope', captureId: capture.id, noteScope });
    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    toast.success(noteScope === 'show' ? 'Moved to show notes.' : 'Kept on the profile.');
    setOpen(false);
    onMutated();
  };

  const handleDelete = async () => {
    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }
    setPendingDelete(false);
    const result = await updateCapture({
      action: 'delete',
      captureId: capture.id,
    });
    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    toast.success('Deleted.');
    setOpen(false);
    onMutated();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPendingVisibilityConfirm(false);
          setPendingDelete(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Capture actions"
          className={cn(
            'shrink-0 p-1 rounded-md',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0/0.06)] transition-colors',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <MenuItem
          icon={<FileText className="size-3.5" />}
          label={expanded ? 'Hide transcript' : 'Show transcript'}
          onClick={() => {
            onToggleTranscript();
            setOpen(false);
          }}
          disabled={!capture.transcript}
        />
        {isOwn && (
          <>
            <MenuItem
              icon={<Pencil className="size-3.5" />}
              label="Edit"
              onClick={() => {
                onStartEdit();
                setOpen(false);
              }}
            />
            <MenuItem
              icon={<Link2 className="size-3.5" />}
              label="Reassign"
              onClick={() => {
                onStartReassign();
                setOpen(false);
              }}
            />
            {capture.noteScope === 'show' ? (
              <MenuItem
                icon={<UserIcon className="size-3.5" />}
                label="Keep on profile"
                onClick={() => handleScope('about')}
              />
            ) : (
              <MenuItem
                icon={<CalendarCheck2 className="size-3.5" />}
                label="Show notes only"
                onClick={() => handleScope('show')}
                // Nothing to demote it to. The RPC refuses this too.
                disabled={!capture.linkedProduction}
              />
            )}
            <MenuItem
              icon={
                isPrivate ? (
                  <Users className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )
              }
              label={
                pendingVisibilityConfirm
                  ? 'Confirm share with team?'
                  : isPrivate
                    ? 'Share with team'
                    : 'Make private'
              }
              onClick={handleVisibility}
              variant={pendingVisibilityConfirm ? 'warning' : 'default'}
            />
            <MenuItem
              icon={<Trash2 className="size-3.5" />}
              label={pendingDelete ? 'Confirm delete?' : 'Delete'}
              onClick={handleDelete}
              variant={pendingDelete ? 'danger' : 'default'}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'warning' | 'danger';
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-[var(--color-unusonic-error)]'
      : variant === 'warning'
        ? 'text-[var(--color-unusonic-warning)]'
        : 'text-[var(--stage-text-primary)]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs',
        'hover:bg-[oklch(1_0_0/0.06)] transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        colorClass,
      )}
    >
      <span className="text-[var(--stage-text-tertiary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
