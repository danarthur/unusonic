'use client';

/**
 * Dialogs used by LobbyViewTabs — name input (duplicate/blank/rename) and
 * delete confirmation. Extracted so the tab component stays under the
 * file-size ratchet.
 *
 * @module app/(dashboard)/lobby/LobbyLayoutDialogs
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';

export type NameDialogMode = 'duplicate' | 'blank' | 'rename';

export interface NameDialogState {
  mode: NameDialogMode;
  initial: string;
  /** Only set when mode === 'duplicate'. */
  sourcePresetSlug?: PresetSlug;
  /** Only set when mode === 'rename'. */
  targetLayoutId?: string;
}

const TITLE_BY_MODE: Record<NameDialogMode, string> = {
  duplicate: 'Duplicate this view',
  blank: 'New blank view',
  rename: 'Rename view',
};

function submitLabelFor(mode: NameDialogMode): string {
  return mode === 'rename' ? 'Save' : 'Create';
}

export function NameDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: NameDialogState | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const [value, setValue] = React.useState(state?.initial ?? '');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setValue(state?.initial ?? '');
    setBusy(false);
  }, [state?.mode, state?.initial, state?.targetLayoutId]);

  const title = state ? TITLE_BY_MODE[state.mode] : '';
  const submitText = state ? submitLabelFor(state.mode) : '';

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[420px]" ariaLabel={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <div className="flex flex-col gap-3 p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--stage-text-secondary)]">Name</span>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Finance weekly review"
              className={cn(
                'h-9 px-3 rounded-[var(--stage-radius-input,10px)] text-sm',
                'bg-[var(--ctx-well,var(--stage-surface))]',
                'border border-[var(--stage-edge-subtle)]',
                'text-[var(--stage-text-primary)]',
                'placeholder:text-[var(--stage-text-tertiary)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/50',
              )}
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!value.trim() || busy}
            >
              {busy ? 'Saving' : submitText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: LobbyLayout | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setBusy(false);
  }, [target?.id]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[420px]" ariaLabel="Delete view">
        <DialogHeader>
          <DialogTitle>Delete view</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <div className="flex flex-col gap-3 p-6">
          <p className="text-sm text-[var(--stage-text-secondary)]">
            Delete <span className="text-[var(--stage-text-primary)]">{target?.name}</span>?
            This can&apos;t be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={busy}
            >
              {busy ? 'Deleting' : 'Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
