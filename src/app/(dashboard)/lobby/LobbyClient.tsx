'use client';

import React from 'react';
import { toast } from 'sonner';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  STAGE_LIGHT,
  M3_FADE_THROUGH_EXIT,
} from '@/shared/lib/motion-constants';
import { UrgencyStrip } from '@/widgets/urgency-strip';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { ChatInterface } from '@/app/(dashboard)/(features)/aion/components/ChatInterface';
import { PlanPromptBanner } from './PlanPromptBanner';
import { dashboardQueries } from '@/widgets/dashboard/api/queries';
import type { DashboardData } from '@/widgets/dashboard/api';
import type { WorkspaceUsage } from '@/app/(dashboard)/settings/plan/actions';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import {
  LobbyTimeRangeProvider,
  useLobbyTimeRange,
} from './LobbyTimeRangeContext';
import { LobbyTimeRangePicker } from './LobbyTimeRangePicker';
import { LayoutControls } from './LayoutControls';
import { LibraryDrawer } from './LibraryDrawer';
import {
  saveLobbyLayout,
  resetLobbyLayout,
} from './actions/lobby-layout';
import { LOBBY_CARD_CAP } from '@/shared/lib/metrics/role-defaults';
import type { CapabilityKey } from '@/shared/lib/permission-registry';
import { PinnedAnswersWidget } from '@/widgets/pinned-answers';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

// ── Props ──────────────────────────────────────────────────────────────────

interface LobbyClientProps {
  /**
   * Resolved Lobby card ordering for the current user. Present only when the
   * `reports.modular_lobby` feature flag is enabled on the workspace; absent
   * when the flag is off (the existing hard-coded layout is used instead).
   */
  cardIds?: string[];
  /**
   * True when the modular Lobby feature flag is enabled. Drives the
   * time-range picker visibility — we don't show the picker on legacy
   * Lobbies because no widget there respects the global range yet.
   */
  modularEnabled?: boolean;
  /**
   * Phase 2.3: capability keys the viewer holds in this workspace. Used by
   * the library drawer to filter the registry. Resolved server-side and
   * passed in as a serializable string array. Absent when the modular
   * Lobby flag is off — in that case the drawer is never opened.
   */
  userCaps?: CapabilityKey[];
  /**
   * Phase 3.2: Lobby pins for the current user in this workspace. When
   * `pinEnabled` is true AND this array has entries, the "Your pins" section
   * renders — above the default grid if any pins exist, below if zero.
   * When `pinEnabled` is false, the section is never rendered regardless.
   */
  pins?: LobbyPin[];
  /**
   * Phase 3.2: mirrors `reports.aion_pin` feature flag. Gates the "Your pins"
   * section independently of the modular-Lobby flag so pins can ship to a
   * workspace before rearrangeable defaults do.
   */
  pinEnabled?: boolean;
}

// ── Chat view ─────────────────────────────────────────────────────────────

/**
 * Aion chat surface and "return to dashboard" affordance. Lifted out so the
 * top-level Lobby component stays under the cyclomatic-complexity ratchet.
 */
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

// ── Overview view ─────────────────────────────────────────────────────────

type OverviewViewProps = {
  dashboardData: DashboardData | undefined;
  usage: WorkspaceUsage | null | undefined;
  cardIds?: string[];
  modularEnabled?: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
  onOpenLibrary: () => void;
  onReorder: (newOrder: string[]) => void;
  onRemove: (id: string) => void;
  pins: LobbyPin[];
  pinEnabled: boolean;
};

/**
 * Hub-overview view — banners, urgency strip, and the bento grid. Lifted out
 * so the parent component stays under the cyclomatic-complexity ratchet.
 */
function OverviewView({
  dashboardData,
  usage,
  cardIds,
  modularEnabled,
  editMode,
  onToggleEdit,
  onReset,
  onOpenLibrary,
  onReorder,
  onRemove,
  pins,
  pinEnabled,
}: OverviewViewProps) {
  // Per design §3: render "Your pins" above defaults when the user has ≥1
  // pin, below defaults when zero. Flag-off workspaces never render either
  // branch. Zero-pin section is hidden today; Phase 3.3 may flip it on as an
  // affordance to nudge users toward the Aion pin flow.
  const showPinsAbove = pinEnabled && pins.length > 0;
  const showPinsBelow = false; // Zero-pin empty section suppressed in 3.2.
  return (
    <motion.div
      key="hub-overview"
      className="relative flex-1 min-h-0 flex flex-col overflow-auto"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: M3_FADE_THROUGH_EXIT }}
    >
      <motion.div
        key="hub-view"
        className="flex flex-col gap-[var(--stage-gap,8px)] p-[var(--stage-padding,16px)]"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={{
          visible: {
            transition: { staggerChildren: 0.03 },
          },
          hidden: {},
          exit: {
            opacity: 0,
            transition: M3_FADE_THROUGH_EXIT,
          },
        }}
      >
        <PlanPromptBanner
          billingStatus={usage?.billingStatus}
          seatUsage={usage?.seatUsage}
          seatLimit={usage?.seatLimit}
          showUsage={usage?.showUsage}
          showLimit={usage?.showLimit}
        />
        <UrgencyStrip alerts={dashboardData?.alerts ?? []} />
        {modularEnabled && (
          <div className="flex items-center justify-end gap-2">
            <LobbyTimeRangePicker />
            <LayoutControls
              editMode={editMode}
              onToggleEdit={onToggleEdit}
              onReset={onReset}
              onAddCard={onOpenLibrary}
              cardCount={cardIds?.length ?? 0}
              cap={LOBBY_CARD_CAP}
            />
          </div>
        )}
        {showPinsAbove && <PinnedAnswersWidget pins={pins} />}
        <LobbyBentoGrid
          dashboardData={dashboardData}
          cardIds={cardIds}
          editMode={editMode}
          onReorder={onReorder}
          onRemove={onRemove}
        />
        {showPinsBelow && <PinnedAnswersWidget pins={pins} />}
      </motion.div>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

/**
 * Unusonic Hub (Lobby) — Temporal Hierarchy Dashboard.
 * Single ambient backdrop, urgency strip at top, bento grid below.
 * Chat view toggles via session viewState.
 *
 * When `cardIds` is provided (modular Lobby feature flag ON), `LobbyBentoGrid`
 * renders exactly those cards in that order. Otherwise it falls back to the
 * legacy hard-coded layout — no visible difference for flag-off workspaces.
 */
export function LobbyClient(props: LobbyClientProps) {
  // The provider mounts unconditionally so context is always available, but
  // the picker only renders when modularEnabled. Picker-less mounts are
  // harmless: useLobbyTimeRange resolves to defaults, and consumers that
  // don't pass `period` to the dashboard query keep their legacy behavior.
  return (
    <LobbyTimeRangeProvider>
      <LobbyClientInner {...props} />
    </LobbyTimeRangeProvider>
  );
}

function LobbyClientInner({
  cardIds,
  modularEnabled,
  userCaps,
  pins,
  pinEnabled,
}: LobbyClientProps) {
  const { viewState, setViewState } = useSession();
  const { workspaceId } = useWorkspace();
  const { resolved } = useLobbyTimeRange();
  const showOverview = viewState !== 'chat';

  // Period is only threaded into the query when the modular Lobby is on —
  // otherwise we keep the legacy queryKey shape so existing cache entries
  // remain warm and behavior is byte-identical for unaffected workspaces.
  const period = modularEnabled
    ? { periodStart: resolved.start, periodEnd: resolved.end }
    : undefined;

  const { data: dashboardData } = useQuery({
    ...dashboardQueries.all(workspaceId ?? '', period),
    enabled: !!workspaceId,
  });
  const { data: usage } = useQuery({
    ...dashboardQueries.usage(workspaceId ?? ''),
    enabled: !!workspaceId,
  });

  // Phase 2.3 — local state for layout, edit mode, and library drawer.
  // cardIds prop is the server-resolved seed; the client owns subsequent
  // mutations and persists them through the existing server actions.
  const [localCardIds, setLocalCardIds] = React.useState<string[] | undefined>(cardIds);
  const [editMode, setEditMode] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);

  // Keep local in sync if the server prop changes (e.g. workspace switch).
  React.useEffect(() => {
    setLocalCardIds(cardIds);
  }, [cardIds]);

  const persistOrThrow = React.useCallback(
    async (newOrder: string[], previous: string[]) => {
      try {
        await saveLobbyLayout(newOrder);
      } catch (err) {
        // Revert on failure — keep the optimistic state honest.
        setLocalCardIds(previous);
        const message =
          err instanceof Error ? err.message : 'Could not save layout';
        toast.error(message);
      }
    },
    [],
  );

  const handleReorder = React.useCallback(
    (newOrder: string[]) => {
      const previous = localCardIds ?? [];
      setLocalCardIds(newOrder);
      void persistOrThrow(newOrder, previous);
    },
    [localCardIds, persistOrThrow],
  );

  const handleRemove = React.useCallback(
    (id: string) => {
      const previous = localCardIds ?? [];
      const newOrder = previous.filter((c) => c !== id);
      setLocalCardIds(newOrder);
      void persistOrThrow(newOrder, previous);
    },
    [localCardIds, persistOrThrow],
  );

  const handleAdd = React.useCallback(
    (id: string) => {
      const previous = localCardIds ?? [];
      if (previous.includes(id)) return;
      const newOrder = [...previous, id];
      setLocalCardIds(newOrder);
      setLibraryOpen(false);
      void persistOrThrow(newOrder, previous);
    },
    [localCardIds, persistOrThrow],
  );

  const handleReset = React.useCallback(async () => {
    const previous = localCardIds ?? [];
    try {
      const layout = await resetLobbyLayout();
      setLocalCardIds(layout.cardIds);
      toast.success('Lobby reset to defaults');
    } catch (err) {
      setLocalCardIds(previous);
      const message =
        err instanceof Error ? err.message : 'Could not reset layout';
      toast.error(message);
    }
  }, [localCardIds]);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col font-sans relative">
      {/* Ambient backdrop — single neutral gradient, no state branching */}
      {showOverview && (
        <div className="absolute inset-0 z-0" aria-hidden>
          <div className="lobby-ambient-growth" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {showOverview && (
          <OverviewView
            dashboardData={dashboardData}
            usage={usage}
            cardIds={localCardIds}
            modularEnabled={modularEnabled}
            editMode={editMode}
            onToggleEdit={() => setEditMode((v) => !v)}
            onReset={handleReset}
            onOpenLibrary={() => setLibraryOpen(true)}
            onReorder={handleReorder}
            onRemove={handleRemove}
            pins={pins ?? []}
            pinEnabled={Boolean(pinEnabled)}
          />
        )}

        {viewState === 'chat' && (
          <ChatView onReturn={() => setViewState('overview')} />
        )}
      </AnimatePresence>

      {modularEnabled && (
        <LibraryDrawer
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          userCaps={userCaps ?? []}
          currentCardIds={localCardIds ?? []}
          cap={LOBBY_CARD_CAP}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
