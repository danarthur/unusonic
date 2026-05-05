'use client';

/**
 * OperatorPicker — inline dropdown for assigning a department-scoped crew
 * member as the operator for a GearItemRow. Rendered by GearItemRow inside
 * an AnimatePresence height-collapse.
 */

import type { DealCrewRow } from '../../../actions/deal-crew';
import { getInitials } from './shared';

type OperatorPickerProps = {
  deptCrew: DealCrewRow[];
  department: string;
  currentOperatorId: string | null;
  onSelect: (entityId: string | null) => void;
  onClose: () => void;
};

export function OperatorPicker({
  deptCrew,
  department,
  currentOperatorId,
  onSelect,
  onClose,
}: OperatorPickerProps) {
  return (
    <div className="mt-1 mb-2 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] overflow-hidden">
      {deptCrew.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--stage-text-tertiary)] tracking-tight">
          No crew in {department}
        </p>
      ) : (
        <div className="max-h-[160px] overflow-y-auto">
          {/* Unassign option when currently assigned */}
          {currentOperatorId && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]"
            >
              Unassign operator
            </button>
          )}
          {deptCrew.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.entity_id);
                onClose();
              }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[oklch(1_0_0_/_0.06)] transition-colors ${
                c.entity_id === currentOperatorId ? 'bg-[oklch(1_0_0_/_0.04)]' : ''
              }`}
            >
              <div className="size-5 rounded-full bg-[oklch(1_0_0_/_0.08)] border border-[oklch(1_0_0_/_0.12)] flex items-center justify-center shrink-0">
                <span className="text-micro font-medium text-[var(--stage-text-tertiary)]">
                  {getInitials(c.entity_name)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="stage-readout truncate">
                  {c.entity_name ?? c.role_note ?? 'Unknown'}
                </p>
                {c.role_note && c.entity_name && (
                  <p className="text-label text-[var(--stage-text-tertiary)] tracking-tight truncate">
                    {c.role_note}
                  </p>
                )}
              </div>
              {c.entity_id === currentOperatorId && (
                <span className="text-label text-[var(--stage-text-tertiary)]">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
