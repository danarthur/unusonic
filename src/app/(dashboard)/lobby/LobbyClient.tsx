'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  STAGE_LIGHT,
  M3_FADE_THROUGH_EXIT,
} from '@/shared/lib/motion-constants';
import { ChatInterface } from '@/app/(dashboard)/(features)/aion/components/ChatInterface';
import { dashboardQueries } from '@/widgets/dashboard/api/queries';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { LOBBY_CARD_CAP } from '@/shared/lib/lobby-layouts/presets';
import type { CapabilityKey } from '@/shared/lib/permission-registry';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import type { LobbyLayout } from '@/shared/lib/lobby-layouts/types';
import {
  LobbyTimeRangeProvider,
  useLobbyTimeRange,
} from './LobbyTimeRangeContext';
import { LibraryDrawer } from './LibraryDrawer';
import { LobbyOverviewView } from './LobbyOverviewView';
import { useLobbyLayouts } from './useLobbyLayouts';

// ── Props ──────────────────────────────────────────────────────────────────

interface LobbyClientProps {
  /**
   * Every layout the viewer can see (presets + their customs), with exactly
   * one flagged active. Resolved by the server page from listVisibleLayouts().
   */
  layouts: LobbyLayout[];
  /** Convenience — the id of the active layout (mirrors isActive: true). */
  activeLayoutId: string;
  /**
   * Capability keys the viewer holds in this workspace. Used by the library
   * drawer to filter the registry. Resolved server-side.
   */
  userCaps?: CapabilityKey[];
  /**
   * Lobby pins for the current user in this workspace. When `pinEnabled` is
   * true AND this array has entries, the "Your pins" section renders above
   * the default grid.
   */
  pins?: LobbyPin[];
  /**
   * Mirrors the `reports.aion_pin` feature flag. Gates the "Your pins"
   * section independently of the layouts system.
   */
  pinEnabled?: boolean;
}

// ── Chat view ─────────────────────────────────────────────────────────────

function ChatView({ onReturn }: { onReturn: () => void }) {
  return (
    <motion.div
      key="chat-view"
      className="relative z-10 flex-1 min-h-0 w-full flex flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: -4,
        transition: M3_FADE_THROUGH_EXIT,
      }}
      transition={STAGE_LIGHT}
    >
      <StagePanel className="flex-1 overflow-hidden flex flex-col !p-0">
        <div className="flex-1">
          <ChatInterface />
        </div>
      </StagePanel>

      <motion.button
        type="button"
        onClick={onReturn}
        transition={STAGE_LIGHT}
        className="mt-4 mx-auto flex items-center gap-2 stage-btn stage-btn-secondary text-xs uppercase tracking-widest"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75"
          />
        </svg>
        Return to dashboard
      </motion.button>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

/**
 * Unusonic Hub (Lobby). Single ambient backdrop, urgency strip at top, bento
 * grid below. Chat view toggles via session viewState.
 *
 * The active layout decides the renderer: 'legacy' (Default preset) keeps the
 * frozen hand-coded bento; 'modular' renders an ordered registry-backed grid.
 * Only customs are editable — presets force a Duplicate-first flow.
 */
export function LobbyClient(props: LobbyClientProps) {
  return (
    <LobbyTimeRangeProvider>
      <LobbyClientInner {...props} />
    </LobbyTimeRangeProvider>
  );
}

function LobbyClientInner({
  layouts,
  activeLayoutId,
  userCaps,
  pins,
  pinEnabled,
}: LobbyClientProps) {
  const { viewState, setViewState } = useSession();
  const { workspaceId } = useWorkspace();
  const { resolved } = useLobbyTimeRange();
  const showOverview = viewState !== 'chat';
  const [libraryOpen, setLibraryOpen] = React.useState(false);

  const period = { periodStart: resolved.start, periodEnd: resolved.end };

  const { data: dashboardData } = useQuery({
    ...dashboardQueries.all(workspaceId ?? '', period),
    enabled: !!workspaceId,
  });
  const { data: usage } = useQuery({
    ...dashboardQueries.usage(workspaceId ?? ''),
    enabled: !!workspaceId,
  });

  const layoutsState = useLobbyLayouts({
    initialLayouts: layouts,
    initialActiveId: activeLayoutId,
  });

  const { activeLayout } = layoutsState;

  // Fail-safe: if there's no active layout the UI can't render.
  if (!activeLayout) {
    return (
      <div className="flex-1 min-h-0 w-full flex items-center justify-center text-[var(--stage-text-tertiary)] text-sm">
        No views available.
      </div>
    );
  }

  const isCustom = activeLayout.kind === 'custom';
  // Close the library drawer whenever a card is added, so the next open reads
  // the fresh cardIds instead of the stale snapshot.
  const handleAdd = (id: string) => {
    layoutsState.handleAdd(id);
    setLibraryOpen(false);
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col font-sans relative">
      {/* Ambient backdrop */}
      {showOverview && (
        <div className="absolute inset-0 z-0" aria-hidden>
          <div className="lobby-ambient-growth" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {showOverview && (
          <LobbyOverviewView
            dashboardData={dashboardData}
            usage={usage}
            activeLayout={activeLayout}
            layouts={layoutsState.layouts}
            editMode={layoutsState.editMode}
            onToggleEdit={() => layoutsState.setEditMode((v) => !v)}
            onOpenLibrary={() => setLibraryOpen(true)}
            onReorder={layoutsState.handleReorder}
            onRemove={layoutsState.handleRemove}
            onActivate={layoutsState.handleActivate}
            onDuplicateActive={layoutsState.handleDuplicateActive}
            onDuplicatePreset={layoutsState.handleDuplicatePreset}
            onCreateBlank={layoutsState.handleCreateBlank}
            onRename={layoutsState.handleRename}
            onDelete={layoutsState.handleDelete}
            pins={pins ?? []}
            pinEnabled={Boolean(pinEnabled)}
          />
        )}

        {viewState === 'chat' && (
          <ChatView onReturn={() => setViewState('overview')} />
        )}
      </AnimatePresence>

      {isCustom && (
        <LibraryDrawer
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          userCaps={userCaps ?? []}
          currentCardIds={activeLayout.cardIds}
          cap={LOBBY_CARD_CAP}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
