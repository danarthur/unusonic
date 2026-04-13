'use client';

import * as React from 'react';
import {
  updateVenueTechnicalSpecs,
  type VenueTechSpecs,
} from '@/features/network-data/api/entity-context-actions';
import type { NodeDetail } from '@/features/network-data';

export function VenueTechSpecsCard({
  entityId,
  initialSpecs,
}: {
  entityId: string;
  initialSpecs: NonNullable<NodeDetail['orgVenueSpecs']>;
}) {
  const [capacity, setCapacity] = React.useState<string>(
    initialSpecs.capacity != null ? String(initialSpecs.capacity) : ''
  );
  const [loadInNotes, setLoadInNotes] = React.useState(initialSpecs.load_in_notes ?? '');
  const [powerNotes, setPowerNotes] = React.useState(initialSpecs.power_notes ?? '');
  const [stageNotes, setStageNotes] = React.useState(initialSpecs.stage_notes ?? '');
  const [saving, startSave] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function handleSave() {
    setSaveError(null);
    startSave(async () => {
      const specs: VenueTechSpecs = {
        capacity: capacity !== '' ? Math.max(0, parseInt(capacity, 10)) || null : null,
        load_in_notes: loadInNotes || null,
        power_notes: powerNotes || null,
        stage_notes: stageNotes || null,
      };
      const result = await updateVenueTechnicalSpecs(entityId, specs);
      if (!result.ok) setSaveError(result.error);
    });
  }

  return (
    <div className="stage-panel p-5" data-surface="surface">
      <h3 className="mb-4 stage-label">Technical specs</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block stage-label">Capacity</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="stage-input w-full"
            placeholder="e.g. 500"
          />
        </div>
        <div>
          <label className="mb-1 block stage-label">Load-in notes</label>
          <textarea
            value={loadInNotes}
            onChange={(e) => setLoadInNotes(e.target.value)}
            rows={3}
            className="stage-input w-full resize-none"
            placeholder="Dock access, elevator, stairs..."
          />
        </div>
        <div>
          <label className="mb-1 block stage-label">Power notes</label>
          <input
            type="text"
            value={powerNotes}
            onChange={(e) => setPowerNotes(e.target.value)}
            className="stage-input w-full"
            placeholder="200A 3-phase, 4× 20A circuits..."
          />
        </div>
        <div>
          <label className="mb-1 block stage-label">Stage dimensions</label>
          <input
            type="text"
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            className="stage-input w-full"
            placeholder="40ft W × 30ft D × 20ft H"
          />
        </div>
      </div>
      {saveError && (
        <p role="alert" className="mt-2 text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{saveError}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-xl stage-btn stage-btn-primary py-2 text-sm font-medium transition-colors duration-[80ms] disabled:opacity-[0.45]"
      >
        {saving ? 'Saving…' : 'Save specs'}
      </button>
    </div>
  );
}
