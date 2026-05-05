'use client';

/**
 * KitSyncPicker — inline dropdown for selecting a crew member whose verified
 * kit will be materialized as children of a service parent gear row.
 *
 * Phase 5b of the proposal→gear lineage plan. Rendered by GearFlightCheck
 * inside an AnimatePresence height-collapse beneath a service parent row.
 */

import type { DealCrewRow } from '../../../actions/deal-crew';
import { getInitials } from './shared';

type KitSyncPickerProps = {
  /** All crew rows on the deal — filtered internally to those with an entity assigned. */
  crewRows: DealCrewRow[];
  /** Called with the picked person's entity_id; the orchestrator runs the materialize action. */
  onPick: (entityId: string) => void;
  onClose: () => void;
  /** True while the materialize action is in flight — disables the buttons. */
  pending?: boolean;
};

export function KitSyncPicker({ crewRows, onPick, onClose, pending = false }: KitSyncPickerProps) {
  const eligible = crewRows.filter((c) => !!c.entity_id);

  return (
    <div className="mt-1 mb-2 ml-6 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] overflow-hidden">
      <div className="px-3 py-2 border-b border-[oklch(1_0_0_/_0.06)] flex items-center justify-between">
        <span className="stage-label tracking-tight text-[var(--stage-text-secondary)]">
          Sync from a crew member's kit
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-label text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
        >
          Cancel
        </button>
      </div>
      {eligible.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--stage-text-tertiary)] tracking-tight">
          No crew assigned yet. Assign a person to this deal&apos;s crew, then come back.
        </p>
      ) : (
        <div className="max-h-[200px] overflow-y-auto">
          {eligible.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() => onPick(c.entity_id!)}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[oklch(1_0_0_/_0.06)] transition-colors disabled:opacity-45 disabled:cursor-default"
            >
              <div className="size-5 rounded-full bg-[oklch(1_0_0_/_0.08)] border border-[oklch(1_0_0_/_0.12)] flex items-center justify-center shrink-0">
                <span className="text-micro font-medium text-[var(--stage-text-tertiary)]">
                  {getInitials(c.entity_name)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="stage-readout truncate">{c.entity_name ?? 'Unknown'}</p>
                {c.role_note && (
                  <p className="text-label text-[var(--stage-text-tertiary)] tracking-tight truncate">
                    {c.role_note}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
