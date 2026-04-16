'use client';

/**
 * Presentational subcomponents for LobbyViewTabs — the tab button, the
 * hover-revealed ⋯ menu on custom tabs, the trailing + menu for creating
 * new views, and the shared menu row. Extracted so LobbyViewTabs stays
 * under the file-size ratchet.
 *
 * @module app/(dashboard)/lobby/LobbyViewTabsParts
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Plus, Pencil, Trash2, Copy, FilePlus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { LobbyLayout } from '@/shared/lib/lobby-layouts/types';

const SELECTED_LAYOUT_ID = 'lobby-view-tabs-indicator';

// ── Tab button ───────────────────────────────────────────────────────────────

export function Tab({
  layout,
  active,
  onActivate,
  trailing,
}: {
  layout: LobbyLayout;
  active: boolean;
  onActivate: (id: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative group flex items-center shrink-0',
        active
          ? 'text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
      )}
    >
      {active && (
        <motion.span
          layoutId={SELECTED_LAYOUT_ID}
          className="absolute inset-0 rounded-[var(--stage-radius-input,10px)] bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)]"
          transition={STAGE_LIGHT}
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={() => onActivate(layout.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative z-10 inline-flex items-center gap-1.5 h-8 px-3',
          'text-xs font-medium whitespace-nowrap',
          'transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50 rounded-[var(--stage-radius-input,10px)]',
        )}
        data-testid={`lobby-view-tab-${layout.id}`}
      >
        <span className="truncate max-w-[160px]">{layout.name}</span>
      </button>
      {trailing}
    </div>
  );
}

// ── Menu row ─────────────────────────────────────────────────────────────────

export function MenuRow({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
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
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Custom tab menu (⋯ on hover) ────────────────────────────────────────────

export function CustomTabMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label="View options"
          className={cn(
            'relative z-10 inline-flex items-center justify-center h-6 w-6 mr-1 rounded-md',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            open && 'opacity-100 text-[var(--stage-text-primary)]',
            'transition-opacity',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
          )}
        >
          <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[180px] p-1.5"
        data-surface="dropdown"
      >
        <MenuRow
          icon={<Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
          label="Rename"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
        />
        <MenuRow
          icon={<Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
          label="Delete"
          destructive
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Add menu (+ button) ──────────────────────────────────────────────────────

export function AddMenu({
  activeName,
  canDuplicate,
  onDuplicate,
  onBlank,
}: {
  activeName: string;
  canDuplicate: boolean;
  onDuplicate: () => void;
  onBlank: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="New view"
          title="New view"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 ml-1 rounded-[var(--stage-radius-input,10px)]',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'hover:bg-[var(--stage-surface-elevated)]',
            'transition-colors shrink-0',
            open && 'text-[var(--stage-text-primary)] bg-[var(--stage-surface-elevated)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
          )}
          data-testid="lobby-view-tabs-add"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[240px] p-1.5"
        data-surface="dropdown"
      >
        {canDuplicate && (
          <MenuRow
            icon={<Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
            label={`Duplicate "${activeName}"`}
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          />
        )}
        <MenuRow
          icon={<FilePlus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
          label="Start blank"
          onClick={() => {
            setOpen(false);
            onBlank();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
