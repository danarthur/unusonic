'use client';

/**
 * DangerZone — Replace + Remove actions, separated from the friendly top bar.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Muted visual weight; confirmation on Remove. The Replace picker opens
 * inline below the action row when toggled. Suppresses Replace when status
 * is 'replaced' (already swapped) and when sourceOrgId is missing (the
 * picker can't search without it).
 */

import { Loader2, Trash2, UserRoundX } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { DealCrewRow } from '../../actions/deal-crew';
import { CrewPicker } from '../crew-picker';

export function DangerZone({
  row,
  sourceOrgId,
  workspaceId,
  eventDate,
  replacing,
  removing,
  replacePickerOpen,
  setReplacePickerOpen,
  onRemove,
  onReplacePick,
}: {
  row: DealCrewRow;
  sourceOrgId: string | null;
  workspaceId: string | null;
  eventDate: string | null;
  replacing: boolean;
  removing: boolean;
  replacePickerOpen: boolean;
  setReplacePickerOpen: Dispatch<SetStateAction<boolean>>;
  onRemove: () => void;
  onReplacePick: (pick: { entity_id: string }) => Promise<void>;
}) {
  return (
    <section
      className="flex flex-col gap-2 pt-3 border-t mt-2"
      style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
    >
      <h3 className="stage-label text-[var(--stage-text-tertiary)]">Actions</h3>
      <div className="flex flex-wrap gap-2">
        {sourceOrgId && row.status !== 'replaced' && (
          <button
            type="button"
            onClick={() => setReplacePickerOpen((v) => !v)}
            disabled={replacing}
            className="stage-btn stage-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
            title="Swap this person for someone else — keeps history"
          >
            {replacing ? <Loader2 className="size-3 animate-spin" /> : <UserRoundX className="size-3" />}
            Replace
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="stage-btn stage-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none ml-auto"
          style={{ color: 'var(--color-unusonic-error)' }}
          title="Remove this person from the crew"
        >
          {removing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          Remove
        </button>
      </div>

      {/* Replace picker — opens inline below the action row */}
      {replacePickerOpen && sourceOrgId && (
        <div className="relative mt-2">
          <CrewPicker
            sourceOrgId={sourceOrgId}
            onSelect={async (result) => onReplacePick({ entity_id: result.entity_id })}
            onClose={() => setReplacePickerOpen(false)}
            placeholder={`Replace ${row.entity_name ?? 'this person'}\u2026`}
            roleHint={row.role_note ?? undefined}
            eventDate={eventDate}
            workspaceId={workspaceId}
          />
        </div>
      )}
    </section>
  );
}
