'use client';

/**
 * LobbyHeader — identity row for the lobby.
 *
 * Owns the active view name (h1), the fire-dot alert indicator, and the
 * trailing cluster of cross-app actions (capture mic, command palette).
 *
 * Row 1 of the three-row lobby header composition:
 *   Row 1: identity + cross-app actions   (this file)
 *   Row 2: view tabs                      (LobbyViewTabs)
 *   Row 3: contextual controls            (LobbyControlsBar)
 *
 * @module app/(dashboard)/lobby/LobbyHeader
 */

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CaptureButton } from '@/widgets/lobby-capture';
import { openCommandPalette } from '@/shared/ui/command-spine/open';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import { LobbyFireDot } from './LobbyFireDot';

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
  /** Active view name — renders as the h1. */
  title: string;
  /** Urgency alerts used to drive the fire-dot indicator. */
  alerts: UrgencyAlert[];
  /** When true, renders the CaptureButton. Mirrors the `aion.lobby_capture` flag. */
  captureEnabled: boolean;
  /** Workspace id required by CaptureButton. */
  workspaceId: string | null;
}

export function LobbyHeader({
  title,
  alerts,
  captureEnabled,
  workspaceId,
}: LobbyHeaderProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 min-w-0"
      data-testid="lobby-header"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <h1
          className={cn(
            'truncate text-[22px] md:text-[26px] leading-tight font-medium tracking-tight',
            'text-[var(--stage-text-primary)]',
          )}
        >
          {title}
        </h1>
        <LobbyFireDot alerts={alerts} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {captureEnabled && workspaceId && <CaptureButton workspaceId={workspaceId} />}
        <SearchChip />
      </div>
    </div>
  );
}
