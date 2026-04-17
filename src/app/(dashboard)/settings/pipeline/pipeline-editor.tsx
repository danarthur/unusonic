'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ChevronRight, GripVertical, Plus, Trash2, Check, X, Pencil, Zap } from 'lucide-react';
import {
  createPipelineStage,
  updatePipelineStage,
  archivePipelineStage,
  reorderPipelineStages,
  updatePipelineStageTriggers,
  type TriggerEntry,
} from '@/features/pipeline-settings/api/actions';
import { listAllPrimitives, getPrimitive } from '@/shared/lib/triggers';
import type { TriggerPrimitive, TriggerTier } from '@/shared/lib/triggers';
import { cn } from '@/shared/lib/utils';

type EditorStage = {
  id: string;
  slug: string;
  label: string;
  kind: 'working' | 'won' | 'lost';
  sort_order: number;
  requires_confirmation: boolean;
  opens_handoff_wizard: boolean;
  hide_from_portal: boolean;
  tags: string[];
  color_token: string | null;
  rotting_days: number | null;
  triggers: TriggerEntry[];
};

type PipelineEditorProps = {
  pipeline: {
    id: string;
    name: string;
    stages: EditorStage[];
  };
};

export function PipelineEditor({ pipeline }: PipelineEditorProps) {
  const router = useRouter();
  const [stages, setStages] = useState(pipeline.stages);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const workingStages = stages.filter((s) => s.kind === 'working');
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');

  // ── Drag reorder ────────────────────────────────────────────────────────

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = workingStages.findIndex((s) => s.id === active.id);
    const newIndex = workingStages.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(workingStages, oldIndex, newIndex);

    // Optimistic local update
    const nextAllStages = [
      ...reordered.map((s, i) => ({ ...s, sort_order: i + 1 })),
      ...(wonStage ? [{ ...wonStage, sort_order: reordered.length + 1 }] : []),
      ...(lostStage ? [{ ...lostStage, sort_order: reordered.length + 2 }] : []),
    ];
    setStages(nextAllStages);

    const orderedIds = nextAllStages.map((s) => s.id);
    startTransition(async () => {
      const result = await reorderPipelineStages(pipeline.id, orderedIds);
      if (!result.success) {
        toast.error(result.error);
        setStages(pipeline.stages); // revert
      } else {
        router.refresh();
      }
    });
  };

  // ── Mutations ────────────────────────────────────────────────────────────

  const handleUpdate = (stageId: string, patch: Parameters<typeof updatePipelineStage>[1]) => {
    const before = stages.find((s) => s.id === stageId);
    if (!before) return;

    // Optimistic
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, ...patch } : s)));
    startTransition(async () => {
      const result = await updatePipelineStage(stageId, patch);
      if (!result.success) {
        toast.error(result.error);
        setStages((prev) => prev.map((s) => (s.id === stageId ? before : s)));
      }
    });
  };

  const handleUpdateTriggers = (stageId: string, nextTriggers: TriggerEntry[]) => {
    const before = stages.find((s) => s.id === stageId);
    if (!before) return;

    // Optimistic
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, triggers: nextTriggers } : s)));
    startTransition(async () => {
      const result = await updatePipelineStageTriggers(stageId, nextTriggers);
      if (!result.success) {
        toast.error(result.error);
        setStages((prev) => prev.map((s) => (s.id === stageId ? before : s)));
      }
    });
  };

  const handleArchive = (stageId: string) => {
    if (!confirm('Archive this stage? Deals currently in this stage will remain, but new deals will not land here.')) return;

    const before = stages;
    setStages((prev) => prev.filter((s) => s.id !== stageId));
    startTransition(async () => {
      const result = await archivePipelineStage(stageId);
      if (!result.success) {
        toast.error(result.error);
        setStages(before);
      } else {
        router.refresh();
      }
    });
  };

  const handleAdd = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!slug) {
      toast.error('Label must contain letters or numbers.');
      return;
    }

    startTransition(async () => {
      const result = await createPipelineStage({
        pipelineId: pipeline.id,
        label: trimmed,
        slug,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAddingStage(false);
      router.refresh();
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="stage-micro text-[var(--stage-text-secondary)]">Working stages</h2>
          <span className="stage-micro text-[var(--stage-text-tertiary)]">
            {workingStages.length} {workingStages.length === 1 ? 'stage' : 'stages'}
          </span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={workingStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {workingStages.map((stage) => (
                <SortableStageRow
                  key={stage.id}
                  stage={stage}
                  editing={editingId === stage.id}
                  onStartEdit={() => setEditingId(stage.id)}
                  onStopEdit={() => setEditingId(null)}
                  onUpdate={(patch) => handleUpdate(stage.id, patch)}
                  onUpdateTriggers={(next) => handleUpdateTriggers(stage.id, next)}
                  onArchive={() => handleArchive(stage.id)}
                  disabled={pending}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {addingStage ? (
          <AddStageForm onSubmit={handleAdd} onCancel={() => setAddingStage(false)} disabled={pending} />
        ) : (
          <button
            type="button"
            onClick={() => setAddingStage(true)}
            disabled={pending}
            className="mt-3 flex items-center gap-2 px-3 py-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors rounded-lg border border-dashed border-[var(--stage-edge-subtle)] hover:border-[var(--stage-edge-strong)] w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Add stage
          </button>
        )}
      </section>

      {(wonStage || lostStage) && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="stage-micro text-[var(--stage-text-secondary)]">Terminal stages</h2>
            <span className="stage-micro text-[var(--stage-text-tertiary)]">
              Cannot be reordered or removed
            </span>
          </div>
          <ul className="space-y-1">
            {wonStage && (
              <TerminalStageRow
                stage={wonStage}
                editing={editingId === wonStage.id}
                onStartEdit={() => setEditingId(wonStage.id)}
                onStopEdit={() => setEditingId(null)}
                onUpdate={(patch) => handleUpdate(wonStage.id, patch)}
                onUpdateTriggers={(next) => handleUpdateTriggers(wonStage.id, next)}
                disabled={pending}
              />
            )}
            {lostStage && (
              <TerminalStageRow
                stage={lostStage}
                editing={editingId === lostStage.id}
                onStartEdit={() => setEditingId(lostStage.id)}
                onStopEdit={() => setEditingId(null)}
                onUpdate={(patch) => handleUpdate(lostStage.id, patch)}
                onUpdateTriggers={(next) => handleUpdateTriggers(lostStage.id, next)}
                disabled={pending}
              />
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Working stage row (sortable) ───────────────────────────────────────────

function SortableStageRow({
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
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
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

function TerminalStageRow({
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
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
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
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
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

function AddStageForm({
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

// ── Triggers section ──────────────────────────────────────────────────────
//
// Inline collapsible under each stage row. Lists existing triggers with a
// concise readonly render, supports inline edit/remove, and opens a picker
// for adding a new one from the primitive registry.
//
// Zod configSchemas don't self-render — each primitive has a hand-rolled
// config form in TriggerConfigForm. The registry is the source of truth for
// which primitives exist; the form switch is the source of truth for how
// each one collects input. If a new primitive is registered without a
// matching form branch, the picker hides it (see `CONFIGURABLE_TYPES`).

const CONFIGURABLE_TYPES = new Set<string>([
  'trigger_handoff',
  'send_deposit_invoice',
  'notify_role',
  'create_task',
  'update_deal_field',
]);

function TriggersSection({
  stage,
  open,
  onToggle,
  onUpdateTriggers,
  disabled,
}: {
  stage: EditorStage;
  open: boolean;
  onToggle: () => void;
  onUpdateTriggers: (next: TriggerEntry[]) => void;
  disabled: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const triggers = stage.triggers;
  const count = triggers.length;

  const handleRemove = (index: number) => {
    const entry = triggers[index];
    const primitive = entry ? getPrimitive(entry.type) : undefined;
    const needsConfirm = primitive?.tier === 'outbound';
    if (
      needsConfirm &&
      !confirm(
        `Remove outbound trigger "${primitive?.label ?? entry?.type}"? This trigger touches external parties when the stage fires.`,
      )
    ) {
      return;
    }
    onUpdateTriggers(triggers.filter((_, i) => i !== index));
  };

  const handleReplace = (index: number, next: TriggerEntry) => {
    onUpdateTriggers(triggers.map((t, i) => (i === index ? next : t)));
    setEditingIndex(null);
  };

  const handleAdd = (entry: TriggerEntry) => {
    onUpdateTriggers([...triggers, entry]);
    setAdding(false);
  };

  return (
    <div className="border-t border-[var(--stage-edge-subtle)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--stage-surface-elevated)] transition-colors"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-[var(--stage-text-tertiary)] transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden
        />
        <Zap className="w-3.5 h-3.5 text-[var(--stage-text-tertiary)]" aria-hidden />
        <span className="stage-micro text-[var(--stage-text-secondary)]">
          Triggers ({count})
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {triggers.length === 0 && !adding && (
            <p className="stage-micro text-[var(--stage-text-tertiary)] py-1">
              No triggers on this stage. Add one to automate work when a deal lands here.
            </p>
          )}

          {triggers.map((entry, index) => (
            <TriggerRow
              key={`${entry.type}-${index}`}
              entry={entry}
              editing={editingIndex === index}
              onStartEdit={() => setEditingIndex(index)}
              onCancelEdit={() => setEditingIndex(null)}
              onSave={(next) => handleReplace(index, next)}
              onRemove={() => handleRemove(index)}
              disabled={disabled}
            />
          ))}

          {adding ? (
            <TriggerPicker
              stageKind={stage.kind}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
              disabled={disabled}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={disabled}
              className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5 stage-micro text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] rounded border border-dashed border-[var(--stage-edge-subtle)] hover:border-[var(--stage-edge-strong)] transition-colors"
            >
              <Plus className="w-3 h-3" aria-hidden />
              Add trigger
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger row (one entry) ───────────────────────────────────────────────

function TriggerRow({
  entry,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  disabled,
}: {
  entry: TriggerEntry;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (next: TriggerEntry) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const primitive = getPrimitive(entry.type);

  if (!primitive) {
    // Stored trigger references a primitive that no longer exists in the
    // registry. Surface it so admins can clean up rather than silently
    // dropping.
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-[var(--color-unusonic-error)]/40 bg-[var(--color-unusonic-error)]/5">
        <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-unusonic-error)] shrink-0" aria-hidden />
        <span className="stage-micro text-[var(--color-unusonic-error)] flex-1">
          Unknown trigger type: {entry.type}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]"
          aria-label="Remove unknown trigger"
        >
          <Trash2 className="w-3 h-3" aria-hidden />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <TriggerConfigForm
        primitive={primitive}
        initialConfig={entry.config}
        onSave={onSave}
        onCancel={onCancelEdit}
        disabled={disabled}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded border',
        primitive.tier === 'outbound'
          ? 'border-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/40 bg-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/5'
          : 'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]',
      )}
    >
      <TierBadge tier={primitive.tier} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--stage-text-primary)] truncate">
          {primitive.label}
        </div>
        <div className="stage-micro text-[var(--stage-text-tertiary)] truncate">
          {renderConfigSummary(entry)}
        </div>
      </div>
      <button
        type="button"
        onClick={onStartEdit}
        disabled={disabled}
        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
        aria-label={`Edit ${primitive.label}`}
      >
        <Pencil className="w-3 h-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]"
        aria-label={`Remove ${primitive.label}`}
      >
        <Trash2 className="w-3 h-3" aria-hidden />
      </button>
    </div>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: TriggerTier }) {
  const isOutbound = tier === 'outbound';
  return (
    <span
      className={cn(
        'stage-micro px-1.5 py-0.5 rounded border shrink-0',
        isOutbound
          ? 'border-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/50 text-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]'
          : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-tertiary)]',
      )}
      title={isOutbound ? 'Touches external parties — user-visible' : 'In-app only — silent with 15s undo'}
    >
      {isOutbound ? 'Outbound' : 'Internal'}
    </span>
  );
}

// ── Concise readonly summary of a stored config ──────────────────────────

function renderConfigSummary(entry: TriggerEntry): string {
  const cfg = entry.config;
  switch (entry.type) {
    case 'trigger_handoff':
      return 'Fires when this stage is entered';
    case 'send_deposit_invoice': {
      const basis = (cfg?.amount_basis as string | undefined) ?? 'deposit';
      return basis === 'balance' ? 'Full balance invoice' : 'Deposit invoice';
    }
    case 'notify_role': {
      const role = (cfg?.role_slug as string | undefined) ?? '(no role)';
      const message = cfg?.message as string | undefined;
      return message ? `Notify ${role} — "${message}"` : `Notify ${role}`;
    }
    case 'create_task': {
      const title = (cfg?.title as string | undefined) ?? '(untitled)';
      const assignee = (cfg?.assignee_rule as string | undefined) ?? 'owner';
      return `Task: "${title}" → ${assignee}`;
    }
    case 'update_deal_field': {
      const field = (cfg?.field as string | undefined) ?? '(field)';
      const value = cfg?.value;
      const shown =
        value === undefined || value === null
          ? 'null'
          : typeof value === 'string'
            ? `"${value}"`
            : JSON.stringify(value);
      return `Set ${field} = ${shown}`;
    }
    default:
      return JSON.stringify(cfg ?? {});
  }
}

// ── Trigger picker (choose primitive, then configure) ────────────────────

function TriggerPicker({
  stageKind,
  onSave,
  onCancel,
  disabled,
}: {
  stageKind: EditorStage['kind'];
  onSave: (entry: TriggerEntry) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Terminal stages can technically take any primitive; we still show all 5.
  // Gated to CONFIGURABLE_TYPES so an unregistered-in-UI primitive doesn't
  // appear with no form. stageKind reserved for future per-kind filtering.
  void stageKind;

  const grouped = useMemo(() => {
    const all = listAllPrimitives().filter((p) => CONFIGURABLE_TYPES.has(p.type));
    return {
      outbound: all.filter((p) => p.tier === 'outbound'),
      internal: all.filter((p) => p.tier === 'internal'),
    };
  }, []);

  if (selectedType) {
    const primitive = getPrimitive(selectedType);
    if (!primitive) return null;
    return (
      <TriggerConfigForm
        primitive={primitive}
        initialConfig={{}}
        onSave={onSave}
        onCancel={onCancel}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="p-2.5 rounded border border-dashed border-[var(--stage-edge-strong)] bg-[var(--stage-surface-elevated)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="stage-micro text-[var(--stage-text-secondary)]">Choose a trigger</span>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {(['outbound', 'internal'] as const).map((tier) => {
        const list = grouped[tier];
        if (list.length === 0) return null;
        return (
          <div key={tier} className="space-y-1">
            <div className="stage-micro text-[var(--stage-text-tertiary)] uppercase tracking-wide">
              {tier === 'outbound' ? 'Outbound — user-visible' : 'Internal — silent'}
            </div>
            <div className="grid gap-1">
              {list.map((primitive) => (
                <button
                  key={primitive.type}
                  type="button"
                  onClick={() => setSelectedType(primitive.type)}
                  disabled={disabled}
                  title={primitive.description}
                  className="flex items-start gap-2 p-2 rounded text-left hover:bg-[var(--stage-surface)] transition-colors"
                >
                  <TierBadge tier={primitive.tier} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--stage-text-primary)]">{primitive.label}</div>
                    <div className="stage-micro text-[var(--stage-text-tertiary)] line-clamp-2">
                      {primitive.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Config form: per-primitive hardcoded inputs ──────────────────────────

function TriggerConfigForm({
  primitive,
  initialConfig,
  onSave,
  onCancel,
  disabled,
}: {
  primitive: TriggerPrimitive<unknown>;
  initialConfig: Record<string, unknown>;
  onSave: (entry: TriggerEntry) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const buildEntry = (config: Record<string, unknown>): TriggerEntry => ({
    type: primitive.type,
    config,
  });

  return (
    <div className="p-2.5 rounded border border-[var(--stage-edge-strong)] bg-[var(--stage-surface-elevated)] space-y-2">
      <div className="flex items-center gap-2">
        <TierBadge tier={primitive.tier} />
        <span className="text-sm text-[var(--stage-text-primary)]">{primitive.label}</span>
      </div>
      <div className="stage-micro text-[var(--stage-text-tertiary)]">{primitive.description}</div>

      {primitive.type === 'trigger_handoff' && (
        <TriggerHandoffForm
          onSave={() => onSave(buildEntry({}))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'send_deposit_invoice' && (
        <SendDepositInvoiceForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'notify_role' && (
        <NotifyRoleForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'create_task' && (
        <CreateTaskForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'update_deal_field' && (
        <UpdateDealFieldForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ── Per-primitive forms ──────────────────────────────────────────────────

function FormActions({
  onSave,
  onCancel,
  disabled,
  canSave,
}: {
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
  canSave: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="px-2.5 py-1 stage-micro text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] rounded"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || !canSave}
        className="px-2.5 py-1 stage-micro rounded bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)] border border-[var(--stage-edge-strong)] hover:bg-[var(--stage-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Save
      </button>
    </div>
  );
}

function TriggerHandoffForm({
  onSave,
  onCancel,
  disabled,
}: {
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <p className="stage-micro text-[var(--stage-text-secondary)]">
        No configuration — fires automatically when a deal enters this stage.
      </p>
      <FormActions onSave={onSave} onCancel={onCancel} disabled={disabled} canSave={true} />
    </>
  );
}

function SendDepositInvoiceForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const initialBasis = initial.amount_basis === 'balance' ? 'balance' : 'deposit';
  const [basis, setBasis] = useState<'deposit' | 'balance'>(initialBasis);

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Amount basis</label>
        <div className="flex gap-2">
          {(['deposit', 'balance'] as const).map((opt) => (
            <label
              key={opt}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 stage-micro rounded border cursor-pointer',
                basis === opt
                  ? 'border-[var(--stage-edge-strong)] bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)]'
                  : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]',
              )}
            >
              <input
                type="radio"
                name="amount_basis"
                value={opt}
                checked={basis === opt}
                onChange={() => setBasis(opt)}
                className="sr-only"
              />
              {opt === 'deposit' ? 'Deposit amount' : 'Full balance'}
            </label>
          ))}
        </div>
      </div>
      <FormActions
        onSave={() => onSave({ amount_basis: basis })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={true}
      />
    </>
  );
}

const ROLE_OPTIONS = ['owner', 'admin', 'crew_chief', 'deal_rep'] as const;

function NotifyRoleForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [roleSlug, setRoleSlug] = useState<string>(
    typeof initial.role_slug === 'string' ? initial.role_slug : ROLE_OPTIONS[0],
  );
  const [message, setMessage] = useState<string>(
    typeof initial.message === 'string' ? initial.message : '',
  );

  const canSave = roleSlug.trim().length > 0;

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Role</label>
        <select
          value={roleSlug}
          onChange={(e) => setRoleSlug(e.target.value)}
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Message (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="e.g. Kick off pre-production for this deal."
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] resize-y"
        />
      </div>
      <FormActions
        onSave={() => {
          const cfg: Record<string, unknown> = { role_slug: roleSlug.trim() };
          if (message.trim()) cfg.message = message.trim();
          onSave(cfg);
        }}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}

const ASSIGNEE_OPTIONS = ['owner', 'deal_rep', 'crew_chief'] as const;

function CreateTaskForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState<string>(
    typeof initial.title === 'string' ? initial.title : '',
  );
  const [assignee, setAssignee] = useState<(typeof ASSIGNEE_OPTIONS)[number]>(
    (ASSIGNEE_OPTIONS as readonly string[]).includes(initial.assignee_rule as string)
      ? (initial.assignee_rule as (typeof ASSIGNEE_OPTIONS)[number])
      : 'owner',
  );

  const canSave = title.trim().length > 0;

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Task title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Confirm venue walk-through"
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        />
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Assign to</label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as (typeof ASSIGNEE_OPTIONS)[number])}
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        >
          {ASSIGNEE_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <FormActions
        onSave={() => onSave({ title: title.trim(), assignee_rule: assignee })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}

function UpdateDealFieldForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [field, setField] = useState<string>(
    typeof initial.field === 'string' ? initial.field : '',
  );
  const [valueText, setValueText] = useState<string>(() => {
    if (initial.value === undefined) return '';
    if (typeof initial.value === 'string') return initial.value;
    try {
      return JSON.stringify(initial.value);
    } catch {
      return '';
    }
  });

  const canSave = field.trim().length > 0;

  const coerceValue = (raw: string): unknown => {
    const trimmed = raw.trim();
    if (trimmed === '') return '';
    // Try JSON first so admins can set numbers, booleans, null, arrays.
    // Fall back to raw string on parse failure.
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  };

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Field</label>
        <input
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="e.g. close_date, won_at"
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] font-mono"
        />
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">
          Value (JSON literals parsed; otherwise stored as string)
        </label>
        <input
          type="text"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          placeholder='e.g. "closed-won", 100, true, null'
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] font-mono"
        />
      </div>
      <FormActions
        onSave={() => onSave({ field: field.trim(), value: coerceValue(valueText) })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}
