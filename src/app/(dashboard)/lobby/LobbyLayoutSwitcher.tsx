'use client';

/**
 * LobbyLayoutSwitcher — Lobby layouts feature. Dropdown button next to the
 * time-range picker; lists visible layouts with a checkmark on the active
 * one plus an actions section (Duplicate / New blank / Rename / Delete).
 * Uses the shared Radix Popover primitive — same one used across the app
 * (transport-logistics-card, plan-vitals-row, etc.) so focus, outside-click,
 * and portal behavior are handled consistently.
 *
 * Hidden when only Default is visible.
 *
 * @module app/(dashboard)/lobby/LobbyLayoutSwitcher
 */

import * as React from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/shared/ui/popover';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import {
  NameDialog,
  DeleteConfirmDialog,
  type NameDialogState,
} from './LobbyLayoutDialogs';
import {
  ActionsSection,
  LayoutsSection,
} from './LobbyLayoutSwitcherParts';

// ── Props ────────────────────────────────────────────────────────────────────

interface LobbyLayoutSwitcherProps {
  layouts: LobbyLayout[];
  activeLayoutId: string;
  onActivate: (id: string) => Promise<void> | void;
  onDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void> | void;
  onCreateBlank: (name: string) => Promise<void> | void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  className?: string;
}

// ── Switcher ─────────────────────────────────────────────────────────────────

export function LobbyLayoutSwitcher({
  layouts,
  activeLayoutId,
  onActivate,
  onDuplicatePreset,
  onCreateBlank,
  onRename,
  onDelete,
  className,
}: LobbyLayoutSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const [nameDialog, setNameDialog] = React.useState<NameDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<LobbyLayout | null>(null);

  // Visibility gate: hide the whole component when only Default is visible.
  if (layouts.length <= 1) return null;

  const active = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
  const presets = layouts.filter((l) => l.kind === 'preset');
  const customs = layouts.filter((l) => l.kind === 'custom');

  const handlePick = async (id: string) => {
    setOpen(false);
    if (id === active.id) return;
    await onActivate(id);
  };

  const handleDuplicate = () => {
    setOpen(false);
    if (active.kind !== 'preset') return;
    setNameDialog({
      mode: 'duplicate',
      initial: `${active.name} copy`,
      sourcePresetSlug: (active.sourcePresetSlug ?? (active.id as PresetSlug)),
    });
  };

  const handleNewBlank = () => {
    setOpen(false);
    setNameDialog({ mode: 'blank', initial: '' });
  };

  const handleRename = () => {
    setOpen(false);
    if (active.kind !== 'custom') return;
    setNameDialog({
      mode: 'rename',
      initial: active.name,
      targetLayoutId: active.id,
    });
  };

  const handleDelete = () => {
    setOpen(false);
    if (active.kind !== 'custom') return;
    setDeleteTarget(active);
  };

  const submitName = async (name: string) => {
    if (!nameDialog) return;
    if (nameDialog.mode === 'duplicate' && nameDialog.sourcePresetSlug) {
      await onDuplicatePreset(nameDialog.sourcePresetSlug, name);
    } else if (nameDialog.mode === 'blank') {
      await onCreateBlank(name);
    } else if (nameDialog.mode === 'rename' && nameDialog.targetLayoutId) {
      await onRename(nameDialog.targetLayoutId, name);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 h-8 px-2.5 rounded-[var(--stage-radius-input,10px)]',
              'text-xs font-medium',
              'border border-[var(--stage-edge-subtle)]',
              'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
              'hover:text-[var(--stage-text-primary)] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
              open && 'text-[var(--stage-text-primary)]',
              className,
            )}
            aria-label={`View: ${active.name}`}
            data-testid="lobby-layout-switcher"
          >
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
            <span className="truncate max-w-[160px]">{active.name}</span>
            <ChevronDown className="w-3 h-3 opacity-60" strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[260px] p-2"
          data-surface="dropdown"
        >
          <p className="stage-label text-[var(--stage-text-tertiary)] px-2 py-1">
            Views
          </p>
          <LayoutsSection
            presets={presets}
            customs={customs}
            activeId={active.id}
            onPick={handlePick}
          />

          <div className="my-2 border-t border-[var(--stage-edge-subtle)]" aria-hidden />

          <p className="stage-label text-[var(--stage-text-tertiary)] px-2 py-1">
            Actions
          </p>
          <ActionsSection
            active={active}
            onDuplicate={handleDuplicate}
            onNewBlank={handleNewBlank}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        </PopoverContent>
      </Popover>

      <NameDialog
        state={nameDialog}
        onClose={() => setNameDialog(null)}
        onSubmit={submitName}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await onDelete(deleteTarget.id);
        }}
      />
    </>
  );
}
