'use client';

/**
 * Presentational subcomponents used by LobbyLayoutSwitcher — one-off rows
 * and section groupings for the popover menu. Extracted so the switcher
 * file stays under the file-size ratchet.
 *
 * @module app/(dashboard)/lobby/LobbyLayoutSwitcherParts
 */

import * as React from 'react';
import { Check, Copy, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { LobbyLayout } from '@/shared/lib/lobby-layouts/types';

export function LayoutRow({
  layout,
  active,
  onPick,
}: {
  layout: LobbyLayout;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onPick(layout.id)}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]',
      )}
    >
      <span className="truncate">{layout.name}</span>
      {active && (
        <Check
          className="w-3.5 h-3.5 text-[var(--stage-text-primary)]"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </button>
  );
}

export function ActionRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors w-full',
        destructive
          ? 'text-[var(--stage-status-error,oklch(0.70_0.18_25))] hover:bg-[oklch(0.70_0.18_25/0.08)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]',
      )}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function ActionsSection({
  active,
  onDuplicate,
  onNewBlank,
  onRename,
  onDelete,
}: {
  active: LobbyLayout;
  onDuplicate: () => void;
  onNewBlank: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {active.kind === 'preset' && (
        <ActionRow
          icon={<Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
          label="Duplicate this view"
          onClick={onDuplicate}
        />
      )}
      <ActionRow
        icon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
        label="New blank"
        onClick={onNewBlank}
      />
      {active.kind === 'custom' && (
        <>
          <ActionRow
            icon={<Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
            label="Rename"
            onClick={onRename}
          />
          <ActionRow
            icon={<Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
            label="Delete"
            onClick={onDelete}
            destructive
          />
        </>
      )}
    </div>
  );
}

export function LayoutsSection({
  presets,
  customs,
  activeId,
  onPick,
}: {
  presets: LobbyLayout[];
  customs: LobbyLayout[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div role="listbox" className="flex flex-col gap-0.5">
      {presets.map((layout) => (
        <LayoutRow
          key={layout.id}
          layout={layout}
          active={layout.id === activeId}
          onPick={onPick}
        />
      ))}
      {customs.length > 0 && (
        <div className="my-1 border-t border-[var(--stage-edge-subtle)]" aria-hidden />
      )}
      {customs.map((layout) => (
        <LayoutRow
          key={layout.id}
          layout={layout}
          active={layout.id === activeId}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
