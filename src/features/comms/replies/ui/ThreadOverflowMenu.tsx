'use client';

/**
 * ThreadOverflowMenu — kebab menu on a thread row.
 *
 * Phase 1 (PR #20) scope:
 *   - Snooze submenu: 4h / Tomorrow / Next week / Unsnooze
 *   - Flag as owed / Dismiss (Fork C owed override)
 *
 * Deferred to PR #21+ (documented in design doc):
 *   - Mute thread
 *   - Copy thread link
 *   - Tap-to-call primary contact
 *   - Mark as read / unread toggle
 *
 * @module features/comms/replies/ui/ThreadOverflowMenu
 */

import { useState, useTransition } from 'react';
import { MoreHorizontal, BellOff, Bell, Flag, FlagOff, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { snoozeThread, type SnoozeDuration } from '../api/snooze-thread';
import { setOwedOverride, type OwedAction } from '../api/set-owed-override';
import type { ReplyThread } from '../api/get-deal-replies';

export type ThreadOverflowMenuProps = {
  thread: ReplyThread;
  onActionComplete?: () => void;
};

const SNOOZE_OPTIONS: Array<{ duration: SnoozeDuration; label: string }> = [
  { duration: '4h', label: 'For 4 hours' },
  { duration: 'tomorrow', label: 'Until tomorrow morning' },
  { duration: 'next_week', label: 'Until next Monday' },
];

export function ThreadOverflowMenu({ thread, onActionComplete }: ThreadOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const isSnoozed = thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date();

  function runSnooze(duration: SnoozeDuration) {
    setOpen(false);
    startTransition(async () => {
      await snoozeThread({ threadId: thread.id, duration });
      onActionComplete?.();
    });
  }

  function runOwedAction(action: OwedAction) {
    setOpen(false);
    startTransition(async () => {
      await setOwedOverride({ threadId: thread.id, action });
      onActionComplete?.();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Thread actions"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="inline-flex items-center justify-center rounded-md transition-colors"
          style={{
            width: 24,
            height: 24,
            color: 'var(--stage-text-tertiary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="p-0 min-w-[220px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex flex-col"
          style={{
            padding: '6px',
            fontSize: '13px',
            color: 'var(--stage-text-secondary)',
          }}
        >
          {/* Snooze section */}
          <div
            className="stage-label"
            style={{
              padding: '6px 10px 2px',
              color: 'var(--stage-text-tertiary)',
            }}
          >
            {isSnoozed ? 'Snoozed' : 'Snooze'}
          </div>
          {isSnoozed ? (
            <MenuItem
              icon={<Bell size={13} />}
              label="Unsnooze"
              onClick={() => runSnooze('clear')}
            />
          ) : (
            SNOOZE_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.duration}
                icon={<BellOff size={13} />}
                label={opt.label}
                onClick={() => runSnooze(opt.duration)}
              />
            ))
          )}

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'var(--stage-edge-subtle)',
              margin: '6px 0',
            }}
          />

          {/* Owed override section */}
          <div
            className="stage-label"
            style={{
              padding: '2px 10px 2px',
              color: 'var(--stage-text-tertiary)',
            }}
          >
            Owed status
          </div>
          {thread.owedOverride === true ? (
            <MenuItem
              icon={<FlagOff size={13} />}
              label="Unflag"
              onClick={() => runOwedAction('clear')}
            />
          ) : (
            <MenuItem
              icon={<Flag size={13} />}
              label="Flag as owed"
              onClick={() => runOwedAction('flag')}
            />
          )}
          {thread.isOwed && thread.owedOverride !== false && (
            <MenuItem
              icon={<FlagOff size={13} />}
              label="Not owed (dismiss)"
              onClick={() => runOwedAction('dismiss')}
            />
          )}
          {thread.owedOverride === false && (
            <MenuItem
              icon={<Undo2 size={13} />}
              label="Clear dismissal"
              onClick={() => runOwedAction('clear')}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full text-left rounded-md transition-colors"
      style={{
        padding: '6px 10px',
        gap: '8px',
        background: 'transparent',
        border: 'none',
        color: 'var(--stage-text-secondary)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'oklch(1 0 0 / 0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ color: 'var(--stage-text-tertiary)' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
