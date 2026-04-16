'use client';

/**
 * LobbyOverviewView — the hub-overview render branch for LobbyClient.
 *
 * Extracted so the client component stays under the file-size ratchet.
 * Owns the banner + three-row header composition (identity / view tabs /
 * controls) + urgency strip + bento grid + pins. State is fully lifted;
 * this is a pure presentational shell.
 *
 * Three-row header composition (top-to-bottom):
 *   Row 1 — LobbyHeader        (h1 title + fire-dot + capture mic + ⌘K)
 *   Row 2 — LobbyViewTabs       (tab strip; replaces the old switcher chip)
 *   Row 3 — LobbyControlsBar    (time range + custom-view edit controls)
 *
 * @module app/(dashboard)/lobby/LobbyOverviewView
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { M3_FADE_THROUGH_EXIT } from '@/shared/lib/motion-constants';
import { PinnedAnswersWidget } from '@/widgets/pinned-answers';
import type { DashboardData } from '@/widgets/dashboard/api';
import type { WorkspaceUsage } from '@/app/(dashboard)/settings/plan/actions';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import { LOBBY_CARD_CAP } from '@/shared/lib/lobby-layouts/presets';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { PlanPromptBanner } from './PlanPromptBanner';
import { LobbyHeader } from './LobbyHeader';
import { LobbyViewTabs } from './LobbyViewTabs';
import { LobbyControlsBar } from './LobbyControlsBar';

// ── Overview view ────────────────────────────────────────────────────────────

export interface LobbyOverviewViewProps {
  dashboardData: DashboardData | undefined;
  usage: WorkspaceUsage | null | undefined;
  activeLayout: LobbyLayout;
  layouts: LobbyLayout[];
  editMode: boolean;
  onToggleEdit: () => void;
  onOpenLibrary: () => void;
  onReorder: (newOrder: string[]) => void;
  onRemove: (id: string) => void;
  onActivate: (id: string) => Promise<void>;
  onDuplicateActive: () => void;
  onDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void>;
  onCreateBlank: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pins: LobbyPin[];
  pinEnabled: boolean;
  captureEnabled: boolean;
  workspaceId: string | null;
}

export function LobbyOverviewView(props: LobbyOverviewViewProps) {
  const {
    dashboardData,
    usage,
    activeLayout,
    layouts,
    editMode,
    onToggleEdit,
    onOpenLibrary,
    onReorder,
    onRemove,
    onActivate,
    onDuplicateActive,
    onDuplicatePreset,
    onCreateBlank,
    onRename,
    onDelete,
    pins,
    pinEnabled,
    captureEnabled,
    workspaceId,
  } = props;
  const showPinsAbove = pinEnabled && pins.length > 0;
  const isCustom = activeLayout.kind === 'custom';
  const alerts = dashboardData?.alerts ?? [];

  return (
    <motion.div
      key="hub-overview"
      className="relative z-10 flex-1 min-h-0 flex flex-col overflow-auto"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: M3_FADE_THROUGH_EXIT }}
    >
      <motion.div
        key="hub-view"
        className="flex flex-col gap-2 p-3 md:gap-[var(--stage-gap,8px)] md:p-[var(--stage-padding,16px)]"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={{
          visible: { transition: { staggerChildren: 0.03 } },
          hidden: {},
          exit: { opacity: 0, transition: M3_FADE_THROUGH_EXIT },
        }}
      >
        <PlanPromptBanner
          billingStatus={usage?.billingStatus}
          seatUsage={usage?.seatUsage}
          seatLimit={usage?.seatLimit}
          showUsage={usage?.showUsage}
          showLimit={usage?.showLimit}
        />

        <LobbyHeader
          title={activeLayout.name}
          alerts={alerts}
          captureEnabled={captureEnabled}
          workspaceId={workspaceId}
        />

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

        <LobbyControlsBar
          isCustom={isCustom}
          editMode={editMode}
          onToggleEdit={onToggleEdit}
          onOpenLibrary={onOpenLibrary}
          onReset={() => {
            /* Reset-to-preset-defaults is not meaningful on a custom — the
             * user created this view. Left as a no-op; the tab's ⋯ Delete is
             * the graceful exit path. */
          }}
          cardCount={activeLayout.cardIds.length}
          cap={LOBBY_CARD_CAP}
        />

        {showPinsAbove && <PinnedAnswersWidget pins={pins} />}

        <LobbyBentoGrid
          dashboardData={dashboardData}
          rendererMode={activeLayout.rendererMode}
          cardIds={activeLayout.cardIds}
          editMode={editMode && isCustom}
          onReorder={onReorder}
          onRemove={onRemove}
        />
      </motion.div>
    </motion.div>
  );
}
