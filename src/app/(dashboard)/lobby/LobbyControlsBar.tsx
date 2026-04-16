'use client';

/**
 * LobbyControlsBar — Row 3 of the lobby header composition.
 *
 * Sits directly above the bento grid, not inside the identity header. Groups
 * the time-range picker (lens on the grid data) with the custom-view edit
 * controls (lens on the grid structure). Keeping these next to the grid —
 * rather than in the header — unmuddles "time is a lens on the data" from
 * "capture/search are cross-app actions" (the header).
 *
 * Edit controls only render on md+ viewports and only when a custom layout is
 * active. Presets are frozen — their equivalent affordance is the tab's
 * trailing + menu's "Duplicate" option.
 *
 * @module app/(dashboard)/lobby/LobbyControlsBar
 */

import * as React from 'react';
import { LobbyTimeRangePicker } from './LobbyTimeRangePicker';
import { LayoutControls } from './LayoutControls';

export interface LobbyControlsBarProps {
  /** True when the active layout is a custom — unlocks the edit affordances. */
  isCustom: boolean;
  /** Mirrors LayoutControls' editMode flag. */
  editMode: boolean;
  onToggleEdit: () => void;
  onOpenLibrary: () => void;
  onReset: () => void;
  cardCount: number;
  cap: number;
}

export function LobbyControlsBar({
  isCustom,
  editMode,
  onToggleEdit,
  onOpenLibrary,
  onReset,
  cardCount,
  cap,
}: LobbyControlsBarProps) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      data-testid="lobby-controls-bar"
    >
      <LobbyTimeRangePicker />
      {isCustom && (
        <LayoutControls
          editMode={editMode}
          onToggleEdit={onToggleEdit}
          onReset={onReset}
          onAddCard={onOpenLibrary}
          cardCount={cardCount}
          cap={cap}
        />
      )}
    </div>
  );
}
