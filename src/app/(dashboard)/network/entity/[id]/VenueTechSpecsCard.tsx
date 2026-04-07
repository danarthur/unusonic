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
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Technical specs</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Capacity</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-full rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
            placeholder="e.g. 500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Load-in notes</label>
          <textarea
            value={loadInNotes}
            onChange={(e) => setLoadInNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
            placeholder="Dock access, elevator, stairs..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Power notes</label>
          <input
            type="text"
            value={powerNotes}
            onChange={(e) => setPowerNotes(e.target.value)}
            className="w-full rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
            placeholder="200A 3-phase, 4× 20A circuits..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Stage dimensions</label>
          <input
            type="text"
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            className="w-full rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
            placeholder="40ft W × 30ft D × 20ft H"
          />
        </div>
      </div>
      {saveError && (
        <p role="alert" className="mt-2 text-xs text-[var(--color-unusonic-error)]">{saveError}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-[var(--stage-accent)]/10 py-2 text-sm font-medium text-[var(--stage-accent)] transition-colors hover:bg-[oklch(1_0_0/0.08)] disabled:opacity-[0.45]"
      >
        {saving ? 'Saving…' : 'Save specs'}
      </button>
    </div>
  );
}
