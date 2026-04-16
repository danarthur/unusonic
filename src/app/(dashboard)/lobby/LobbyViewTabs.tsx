'use client';

/**
 * LobbyViewTabs — Row 2 of the lobby header composition.
 *
 * Horizontal tab strip for switching between preset and custom lobby views.
 * Replaces the single compact chip pattern; promotes custom views to a
 * first-class affordance next to presets. Mirrors the premium pattern used by
 * Notion / Linear / Vercel (tabs below title, not a dropdown).
 *
 * Hover on a custom tab reveals a ⋯ menu for rename/delete. A trailing `+`
 * menu offers "Duplicate [active view]" and "Start blank".
 *
 * Hidden when only one preset is visible (preserves the single-layout UX).
 *
 * @module app/(dashboard)/lobby/LobbyViewTabs
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import {
  NameDialog,
  DeleteConfirmDialog,
  type NameDialogState,
} from './LobbyLayoutDialogs';
import { Tab, CustomTabMenu, AddMenu } from './LobbyViewTabsParts';

// ── Props ────────────────────────────────────────────────────────────────────

export interface LobbyViewTabsProps {
  layouts: LobbyLayout[];
  activeLayoutId: string;
  onActivate: (id: string) => Promise<void> | void;
  onDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void> | void;
  onDuplicateActive: () => void;
  onCreateBlank: (name: string) => Promise<void> | void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export function LobbyViewTabs({
  layouts,
  activeLayoutId,
  onActivate,
  onDuplicatePreset,
  onDuplicateActive,
  onCreateBlank,
  onRename,
  onDelete,
}: LobbyViewTabsProps) {
  const [nameDialog, setNameDialog] = React.useState<NameDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<LobbyLayout | null>(null);

  // Visibility gate: with only a single preset visible there's nothing to switch.
  if (layouts.length <= 1) return null;

  const active = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
  const presets = layouts.filter((l) => l.kind === 'preset');
  const customs = layouts.filter((l) => l.kind === 'custom');

  const handlePick = (id: string) => {
    if (id === active.id) return;
    void onActivate(id);
  };

  // Duplicating a preset seeds the Name dialog with a copy-suffixed name
  // against the preset slug. Duplicating a custom hands off to onDuplicateActive
  // (which already copies from the current layout).
  const handleDuplicate = () => {
    if (active.kind === 'preset') {
      setNameDialog({
        mode: 'duplicate',
        initial: `${active.name} copy`,
        sourcePresetSlug: (active.sourcePresetSlug ?? (active.id as PresetSlug)),
      });
    } else {
      onDuplicateActive();
    }
  };

  const handleBlank = () => setNameDialog({ mode: 'blank', initial: '' });

  const handleRename = (target: LobbyLayout) => {
    if (target.kind !== 'custom') return;
    setNameDialog({
      mode: 'rename',
      initial: target.name,
      targetLayoutId: target.id,
    });
  };

  const handleDelete = (target: LobbyLayout) => {
    if (target.kind !== 'custom') return;
    setDeleteTarget(target);
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
      <div
        role="tablist"
        aria-label="Lobby views"
        className="relative flex items-center min-w-0"
        data-testid="lobby-view-tabs"
      >
        <div
          className={cn(
            'flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {presets.map((layout) => (
            <Tab
              key={layout.id}
              layout={layout}
              active={layout.id === active.id}
              onActivate={handlePick}
            />
          ))}
          {customs.length > 0 && (
            <span
              className="mx-1 h-4 w-px bg-[var(--stage-edge-subtle)] shrink-0"
              aria-hidden
            />
          )}
          {customs.map((layout) => (
            <Tab
              key={layout.id}
              layout={layout}
              active={layout.id === active.id}
              onActivate={handlePick}
              trailing={
                <CustomTabMenu
                  onRename={() => handleRename(layout)}
                  onDelete={() => handleDelete(layout)}
                />
              }
            />
          ))}
        </div>
        <AddMenu
          activeName={active.name}
          canDuplicate={true}
          onDuplicate={handleDuplicate}
          onBlank={handleBlank}
        />
      </div>

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
