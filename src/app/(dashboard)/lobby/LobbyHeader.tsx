'use client';

/**
 * LobbyHeader — single-row top strip for the lobby.
 *
 * Composition, left → right:
 *   • LobbyFireDot       quiet-when-healthy urgency indicator (popover triage)
 *   • LobbyViewTabs      active view is the identity — selected tab IS the title
 *   • Time-range picker  lens on the dashboard data
 *   • CaptureButton      mic for dictating to Aion (feature-flagged)
 *   • SearchChip         opens CommandSpine (⌘K)
 *
 * No separate h1 — that would duplicate the selected tab. No separate
 * controls row — time range joins the trailing tools cluster since it's the
 * same semantic category (workspace-level controls). Edit-mode chips render
 * on a conditional row above the grid in LobbyOverviewView.
 *
 * @module app/(dashboard)/lobby/LobbyHeader
 */

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CaptureButton } from '@/widgets/lobby-capture';
import { openCommandPalette } from '@/shared/ui/command-spine/open';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import { LobbyFireDot } from './LobbyFireDot';
import { LobbyViewTabs } from './LobbyViewTabs';
import { LobbyTimeRangePicker } from './LobbyTimeRangePicker';

// ── Search chip (opens CommandSpine) ─────────────────────────────────────────

function SearchChip() {
  const [isMac, setIsMac] = React.useState(true);

  React.useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || ''));
  }, []);

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search and jump to anything (⌘K)"
      title="Search (⌘K)"
      className={cn(
        'inline-flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-[var(--stage-radius-input,10px)]',
        'text-xs font-medium',
        'border border-[var(--stage-edge-subtle)]',
        'bg-[var(--stage-surface-elevated)]',
        'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
      )}
      data-testid="lobby-search-chip"
    >
      <Search className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
      <span>Search</span>
      <kbd
        className={cn(
          'ml-1 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-md',
          'text-[10px] font-medium tabular-nums',
          'border border-[var(--stage-edge-subtle)]',
          'bg-[var(--ctx-well,var(--stage-surface))]',
          'text-[var(--stage-text-tertiary)]',
        )}
        aria-hidden
      >
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

export interface LobbyHeaderProps {
  activeLayout: LobbyLayout;
  layouts: LobbyLayout[];
  alerts: UrgencyAlert[];
  captureEnabled: boolean;
  workspaceId: string | null;
  onActivate: (id: string) => Promise<void>;
  onDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void>;
  onDuplicateActive: () => void;
  onCreateBlank: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function LobbyHeader({
  activeLayout,
  layouts,
  alerts,
  captureEnabled,
  workspaceId,
  onActivate,
  onDuplicatePreset,
  onDuplicateActive,
  onCreateBlank,
  onRename,
  onDelete,
}: LobbyHeaderProps) {
  return (
    <div
      className="flex items-center gap-2 min-w-0"
      data-testid="lobby-header"
    >
      <LobbyFireDot alerts={alerts} />
      <div className="flex-1 min-w-0">
        <LobbyViewTabs
          layouts={layouts}
          activeLayoutId={activeLayout.id}
          onActivate={onActivate}
          onDuplicatePreset={onDuplicatePreset}
          onDuplicateActive={onDuplicateActive}
          onCreateBlank={onCreateBlank}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <LobbyTimeRangePicker />
        {captureEnabled && workspaceId && <CaptureButton workspaceId={workspaceId} />}
        <SearchChip />
      </div>
    </div>
  );
}
