'use client';

/**
 * Pipeline-editor stage-row family.
 *
 * Extracted from pipeline-editor.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns the in-list rendering of each pipeline stage:
 *   - SortableStageRow — the working-stage row with drag handle + archive.
 *   - TerminalStageRow — won/lost row with no drag affordance.
 *   - StageRowInner — shared row body for both above. Renders the inline
 *     edit field, FlagToggle pills, archive button, and the collapsible
 *     <TriggersSection>.
 *   - FlagToggle — the small on/off pill for confirmation/handoff/portal.
 *   - AddStageForm — single-input "create new stage" form.
 */

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { EditorStage, StagePatch } from './shared';
import type { TriggerEntry } from '@/features/pipeline-settings/api/actions';
import { TriggersSection } from './triggers';

export function SortableStageRow({
  stage,
  editing,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onUpdateTriggers,
  onArchive,
  disabled,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: StagePatch) => void;
  onUpdateTriggers: (next: TriggerEntry[]) => void;
  onArchive: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border border-[var(--stage-edge-subtle)]',
        'bg-[var(--stage-surface)]',
        isDragging && 'ring-2 ring-[var(--stage-edge-strong)]',
      )}
    >
      <StageRowInner
        stage={stage}
        editing={editing}
        onStartEdit={onStartEdit}
        onStopEdit={onStopEdit}
        onUpdate={onUpdate}
        onUpdateTriggers={onUpdateTriggers}
        onArchive={onArchive}
        disabled={disabled}
        dragHandle={
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] px-1"
            aria-label={`Drag ${stage.label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        }
      />
    </li>
  );
}

// ── Terminal stage row (won/lost — no drag, no archive) ───────────────────

export function TerminalStageRow({
  stage,
  editing,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onUpdateTriggers,
  disabled,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: StagePatch) => void;
  onUpdateTriggers: (next: TriggerEntry[]) => void;
  disabled: boolean;
}) {
  return (
    <li className="rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]">
      <StageRowInner
        stage={stage}
        editing={editing}
        onStartEdit={onStartEdit}
        onStopEdit={onStopEdit}
        onUpdate={onUpdate}
        onUpdateTriggers={onUpdateTriggers}
        disabled={disabled}
        dragHandle={<div className="w-6" aria-hidden />}
      />
    </li>
  );
}

// ── Row body (shared by working + terminal) ────────────────────────────────

function StageRowInner({
  stage,
  editing,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onUpdateTriggers,
  onArchive,
  disabled,
  dragHandle,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: StagePatch) => void;
  onUpdateTriggers: (next: TriggerEntry[]) => void;
  onArchive?: () => void;
  disabled: boolean;
  dragHandle: React.ReactNode;
}) {
  const [labelDraft, setLabelDraft] = useState(stage.label);
  const [rottingDraft, setRottingDraft] = useState<string>(stage.rotting_days?.toString() ?? '');
  const [triggersOpen, setTriggersOpen] = useState(false);

  const saveLabel = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelDraft(stage.label);
      onStopEdit();
      return;
    }
    if (trimmed !== stage.label) onUpdate({ label: trimmed });
    onStopEdit();
  };

  const saveRotting = () => {
    const parsed = rottingDraft === '' ? null : parseInt(rottingDraft, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setRottingDraft(stage.rotting_days?.toString() ?? '');
      return;
    }
    if (parsed !== stage.rotting_days) onUpdate({ rotting_days: parsed });
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {dragHandle}

        <div className="flex-1 min-w-0 flex items-center gap-4">
          {editing ? (
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveLabel();
                if (e.key === 'Escape') { setLabelDraft(stage.label); onStopEdit(); }
              }}
              autoFocus
              className="flex-1 min-w-0 bg-transparent border-b border-[var(--stage-edge-strong)] px-0 py-0.5 text-sm text-[var(--stage-text-primary)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="flex items-center gap-1.5 text-left text-sm text-[var(--stage-text-primary)] hover:text-[var(--stage-text-primary)] group"
            >
              <span>{stage.label}</span>
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" aria-hidden />
            </button>
          )}

          {stage.kind === 'working' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="stage-micro text-[var(--stage-text-tertiary)]">Stalls after</span>
              <input
                type="number"
                min={0}
                value={rottingDraft}
                onChange={(e) => setRottingDraft(e.target.value)}
                onBlur={saveRotting}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="—"
                className="w-14 bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] rounded px-1.5 py-0.5 text-sm text-right text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
              />
              <span className="stage-micro text-[var(--stage-text-tertiary)]">days</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <FlagToggle
            label="Confirm"
            title="Require confirmation before moving a deal into this stage"
            checked={stage.requires_confirmation}
            onChange={(v) => onUpdate({ requires_confirmation: v })}
            disabled={disabled}
          />
          {stage.kind === 'working' && (
            <FlagToggle
              label="Handoff"
              title="Open the deal-to-event handoff wizard when a deal enters this stage"
              checked={stage.opens_handoff_wizard}
              onChange={(v) => onUpdate({ opens_handoff_wizard: v })}
              disabled={disabled}
            />
          )}
          <FlagToggle
            label="Hide portal"
            title="Hide deals in this stage from the employee portal"
            checked={stage.hide_from_portal}
            onChange={(v) => onUpdate({ hide_from_portal: v })}
            disabled={disabled}
          />

          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              disabled={disabled}
              aria-label={`Archive ${stage.label}`}
              className="p-1.5 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <TriggersSection
        stage={stage}
        open={triggersOpen}
        onToggle={() => setTriggersOpen((v) => !v)}
        onUpdateTriggers={onUpdateTriggers}
        disabled={disabled}
      />
    </div>
  );
}

// ── Flag toggle pill ───────────────────────────────────────────────────────

function FlagToggle({
  label,
  title,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'stage-micro px-2 py-0.5 rounded-full border transition-colors',
        checked
          ? 'border-[var(--stage-edge-strong)] bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)]'
          : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
      )}
    >
      {label}
    </button>
  );
}

// ── Add stage form ─────────────────────────────────────────────────────────

export function AddStageForm({
  onSubmit,
  onCancel,
  disabled,
}: {
  onSubmit: (label: string) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-[var(--stage-edge-subtle)]">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSubmit(value);
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        placeholder="Stage name, e.g. Discovery Call"
        className="flex-1 bg-transparent border-b border-[var(--stage-edge-subtle)] focus:border-[var(--stage-edge-strong)] px-0 py-0.5 text-sm text-[var(--stage-text-primary)] outline-none"
      />
      <button
        type="button"
        onClick={() => value.trim() && onSubmit(value)}
        disabled={disabled || !value.trim()}
        className="p-1.5 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Create stage"
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1.5 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
        aria-label="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
