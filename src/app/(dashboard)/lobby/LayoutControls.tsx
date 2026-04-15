'use client';

/**
 * LayoutControls — Phase 2.3.
 *
 * Renders next to the LobbyTimeRangePicker in the modular Lobby header.
 * Drives the edit-mode flag the bento grid reads to expose drag handles +
 * remove affordances, fires the reset action (with confirm), and surfaces
 * the cap indicator. Hidden entirely on viewports < 768px — mobile is
 * read-only per the design.
 *
 * @module app/(dashboard)/lobby/LayoutControls
 */

import * as React from 'react';
import { Pencil, Plus, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface LayoutControlsProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
  onAddCard: () => void;
  cardCount: number;
  cap: number;
}

const CHIP_CLASS = cn(
  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--stage-radius-input,10px)]',
  'text-xs font-medium',
  'border border-[var(--stage-edge-subtle)]',
  'bg-[var(--stage-surface-elevated)]',
  'transition-colors',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
);

function CapIndicator({ cardCount, cap, atCap }: { cardCount: number; cap: number; atCap: boolean }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        atCap
          ? 'text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)]',
      )}
      aria-label={`Card count: ${cardCount} of ${cap}`}
    >
      {cardCount} of {cap}
    </span>
  );
}

function AddCardButton({
  onAddCard,
  atCap,
  cap,
}: {
  onAddCard: () => void;
  atCap: boolean;
  cap: number;
}) {
  return (
    <button
      type="button"
      onClick={onAddCard}
      disabled={atCap}
      className={cn(
        CHIP_CLASS,
        'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[var(--stage-text-secondary)]',
      )}
      title={atCap ? `At cap (${cap} cards). Remove one first.` : 'Add card'}
      aria-label={atCap ? `At cap (${cap} cards)` : 'Add card from library'}
    >
      <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
      <span>Add card</span>
    </button>
  );
}

function ResetButton({
  confirming,
  onClick,
}: {
  confirming: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        CHIP_CLASS,
        confirming
          ? 'text-[var(--stage-status-warning,oklch(0.78_0.14_60))] hover:opacity-90'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
      )}
      aria-label={confirming ? 'Confirm reset to defaults' : 'Reset layout to defaults'}
    >
      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
      <span>{confirming ? 'Confirm reset' : 'Reset layout'}</span>
    </button>
  );
}

function EditToggle({
  editMode,
  onToggleEdit,
}: {
  editMode: boolean;
  onToggleEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggleEdit}
      className={cn(
        CHIP_CLASS,
        editMode
          ? 'text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
      )}
      aria-pressed={editMode}
      aria-label={editMode ? 'Done editing layout' : 'Edit layout'}
    >
      {editMode ? (
        <>
          <Check className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          <span>Done</span>
        </>
      ) : (
        <>
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          <span>Edit layout</span>
        </>
      )}
    </button>
  );
}

/**
 * Edit/done toggle, add-card button, reset button, and cap indicator.
 * The reset button asks for confirmation via a small inline two-step UI
 * rather than window.confirm so it stays inside the Stage Engineering
 * surface system.
 */
export function LayoutControls({
  editMode,
  onToggleEdit,
  onReset,
  onAddCard,
  cardCount,
  cap,
}: LayoutControlsProps) {
  const [confirmingReset, setConfirmingReset] = React.useState(false);
  const atCap = cardCount >= cap;

  // Drop the confirm prompt whenever edit mode flips off.
  React.useEffect(() => {
    if (!editMode) setConfirmingReset(false);
  }, [editMode]);

  const handleResetClick = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    onReset();
  };

  return (
    <div
      className="hidden md:flex items-center gap-2"
      data-testid="lobby-layout-controls"
    >
      {editMode && <CapIndicator cardCount={cardCount} cap={cap} atCap={atCap} />}
      {editMode && <AddCardButton onAddCard={onAddCard} atCap={atCap} cap={cap} />}
      {editMode && (
        <ResetButton confirming={confirmingReset} onClick={handleResetClick} />
      )}
      <EditToggle editMode={editMode} onToggleEdit={onToggleEdit} />
    </div>
  );
}
