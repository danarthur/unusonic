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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertTriangle, Plus } from 'lucide-react';
import {
  createPipelineStage,
  updatePipelineStage,
  archivePipelineStage,
  reorderPipelineStages,
  updatePipelineStageTriggers,
  type TriggerEntry,
} from '@/features/pipeline-settings/api/actions';
// Sub-components live under ./pipeline-editor/ — split out 2026-04-29.
import type { EditorStage } from './pipeline-editor/shared';
import {
  SortableStageRow,
  TerminalStageRow,
  AddStageForm,
} from './pipeline-editor/stage-row';

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

