'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { type DealCrewRow, type CrewSearchResult } from '../actions/deal-crew';
import { CrewPicker } from './crew-picker';

// =============================================================================
// OpenRoleSlotRow
// =============================================================================

export function OpenRoleSlotRow({
  row,
  sourceOrgId,
  onAssign,
  onRemove,
  eventDate,
  workspaceId,
}: {
  row: DealCrewRow;
  sourceOrgId: string | null;
  onAssign: (rowId: string, result: CrewSearchResult) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  eventDate?: string | null;
  workspaceId?: string | null;
}) {
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close — avoids stacking context issues with portal backdrops
  useEffect(() => {
    if (!assignPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setAssignPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assignPickerOpen]);

  const handlePickerSelect = async (result: CrewSearchResult) => {
    setAssignPickerOpen(false);
    await onAssign(row.id, result);
  };

  return (
    <motion.div
      key={row.id}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={STAGE_LIGHT}
      className="p-3 rounded-xl border border-dashed border-[oklch(1_0_0/0.08)] bg-[var(--ctx-card)]"
    >
      <div className="flex items-center gap-2">
        {/* Clickable field block — matches deal header field pattern */}
        <div
          className={cn(
            'flex-1 min-w-0 px-3 py-2.5',
            sourceOrgId && 'cursor-pointer [border-radius:var(--stage-radius-input,6px)] hover:bg-[var(--stage-accent-muted)] transition-colors',
          )}
          onClick={sourceOrgId ? () => setAssignPickerOpen((v) => !v) : undefined}
        >
          <p className="stage-label text-[var(--stage-text-tertiary)] mb-1 select-none leading-none">
            {row.role_note ?? 'Open role'}
          </p>
          <span className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-1.5">
            <Plus size={9} />assign
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          className="shrink-0 p-1.5 rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-colors focus:outline-none"
          aria-label="Remove role"
        >
          <X className="size-3" />
        </button>
      </div>
      {/* Picker renders inline below the row */}
      <AnimatePresence>
        {assignPickerOpen && sourceOrgId && (
          <div ref={pickerRef} className="relative z-10">
            <CrewPicker
              sourceOrgId={sourceOrgId}
              onSelect={handlePickerSelect}
              onClose={() => setAssignPickerOpen(false)}
              placeholder="Search people\u2026"
              roleHint={row.role_note ?? null}
              eventDate={eventDate}
              workspaceId={workspaceId}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
