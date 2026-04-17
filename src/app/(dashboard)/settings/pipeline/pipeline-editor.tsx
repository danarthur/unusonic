'use client';

import { useState, useTransition } from 'react';
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
import { GripVertical, Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import {
  createPipelineStage,
  updatePipelineStage,
  archivePipelineStage,
  reorderPipelineStages,
} from '@/features/pipeline-settings/api/actions';
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
  onArchive,
  disabled,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
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
  disabled,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
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
  onArchive,
  disabled,
  dragHandle,
}: {
  stage: EditorStage;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: Parameters<typeof updatePipelineStage>[1]) => void;
  onArchive?: () => void;
  disabled: boolean;
  dragHandle: React.ReactNode;
}) {
  const [labelDraft, setLabelDraft] = useState(stage.label);
  const [rottingDraft, setRottingDraft] = useState<string>(stage.rotting_days?.toString() ?? '');

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
