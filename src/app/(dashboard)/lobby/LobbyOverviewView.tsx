'use client';

/**
 * LobbyOverviewView — the hub-overview render branch for LobbyClient.
 *
 * Extracted so the client component stays under the file-size ratchet.
 * Owns the banner + urgency strip + header control row + bento grid + pins
 * composition. State is fully lifted; this is a pure presentational shell.
 *
 * @module app/(dashboard)/lobby/LobbyOverviewView
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { M3_FADE_THROUGH_EXIT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { UrgencyStrip } from '@/widgets/urgency-strip';
import { PinnedAnswersWidget } from '@/widgets/pinned-answers';
import type { DashboardData } from '@/widgets/dashboard/api';
import type { WorkspaceUsage } from '@/app/(dashboard)/settings/plan/actions';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import { LOBBY_CARD_CAP } from '@/shared/lib/lobby-layouts/presets';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { LobbyTimeRangePicker } from './LobbyTimeRangePicker';
import { LobbyLayoutSwitcher } from './LobbyLayoutSwitcher';
import { LayoutControls } from './LayoutControls';
import { PlanPromptBanner } from './PlanPromptBanner';

// ── Preset CTA ───────────────────────────────────────────────────────────────

/**
 * Presets are frozen — you can't edit them. When the active layout is a
 * preset, the edit chrome is replaced by a single CTA that duplicates the
 * preset into a custom the user can then edit.
 */
function DuplicatePresetCTA({ onDuplicate }: { onDuplicate: () => void }) {
  return (
    <div
      className="hidden md:flex items-center gap-2"
      data-testid="lobby-preset-cta"
    >
      <button
        type="button"
        onClick={onDuplicate}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--stage-radius-input,10px)]',
          'text-xs font-medium',
          'border border-[var(--stage-edge-subtle)]',
          'bg-[var(--stage-surface-elevated)]',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        )}
        aria-label="Duplicate this view to customize"
      >
        <span>Duplicate this view to customize</span>
      </button>
    </div>
  );
}

// ── Header row ───────────────────────────────────────────────────────────────

function HeaderRow({
  activeLayout,
  layouts,
  editMode,
  onToggleEdit,
  onOpenLibrary,
  onActivate,
  onDuplicateActive,
  onDuplicatePreset,
  onCreateBlank,
  onRename,
  onDelete,
}: {
  activeLayout: LobbyLayout;
  layouts: LobbyLayout[];
  editMode: boolean;
  onToggleEdit: () => void;
  onOpenLibrary: () => void;
  onActivate: (id: string) => Promise<void>;
  onDuplicateActive: () => void;
  onDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void>;
  onCreateBlank: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isCustom = activeLayout.kind === 'custom';
  return (
    <div className="flex items-center justify-end gap-2">
      <LobbyTimeRangePicker />
      <LobbyLayoutSwitcher
        layouts={layouts}
        activeLayoutId={activeLayout.id}
        onActivate={onActivate}
        onDuplicatePreset={onDuplicatePreset}
        onCreateBlank={onCreateBlank}
        onRename={onRename}
        onDelete={onDelete}
      />
      {isCustom ? (
        <LayoutControls
          editMode={editMode}
          onToggleEdit={onToggleEdit}
          onReset={() => {
            /* Reset-to-preset-defaults is not meaningful on a custom — the user
             * created this view. Left as a no-op; the switcher's Delete is the
             * graceful exit path. */
          }}
          onAddCard={onOpenLibrary}
          cardCount={activeLayout.cardIds.length}
          cap={LOBBY_CARD_CAP}
        />
      ) : (
        <DuplicatePresetCTA onDuplicate={onDuplicateActive} />
      )}
    </div>
  );
}

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
  } = props;
  const showPinsAbove = pinEnabled && pins.length > 0;
  const showPinsBelow = false;
  const isCustom = activeLayout.kind === 'custom';
  return (
    <motion.div
      key="hub-overview"
      className="relative flex-1 min-h-0 flex flex-col overflow-auto"
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
        <UrgencyStrip alerts={dashboardData?.alerts ?? []} />
        <HeaderRow
          activeLayout={activeLayout}
          layouts={layouts}
          editMode={editMode}
          onToggleEdit={onToggleEdit}
          onOpenLibrary={onOpenLibrary}
          onActivate={onActivate}
          onDuplicateActive={onDuplicateActive}
          onDuplicatePreset={onDuplicatePreset}
          onCreateBlank={onCreateBlank}
          onRename={onRename}
          onDelete={onDelete}
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
        {showPinsBelow && <PinnedAnswersWidget pins={pins} />}
      </motion.div>
    </motion.div>
  );
}
