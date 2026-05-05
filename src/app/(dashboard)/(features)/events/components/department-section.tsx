'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { type DealCrewRow, type CrewSearchResult } from '../actions/deal-crew';
import { ConfirmedCrewRow } from './confirmed-crew-row';
import { OpenRoleSlotRow } from './open-role-slot-row';
import type { KitComplianceResult } from '@/features/talent-management/api/kit-template-actions';

// =============================================================================
// Types
// =============================================================================

export type DepartmentGroup = {
  department: string;
  rows: DealCrewRow[];
};

// =============================================================================
// DepartmentSection — collapsible group of crew rows within a department
// =============================================================================

export function DepartmentSection({
  group,
  collapsed,
  onToggle,
  sourceOrgId,
  onRemove,
  onConfirm,
  onAssign,
  eventDate,
  workspaceId,
  dealId,
  rateReadOnly = false,
  kitComplianceByKey,
  onOpenDetail,
}: {
  group: DepartmentGroup;
  collapsed: boolean;
  onToggle: () => void;
  sourceOrgId: string | null;
  onRemove: (id: string) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onAssign: (rowId: string, result: CrewSearchResult) => Promise<void>;
  eventDate?: string | null;
  workspaceId?: string | null;
  dealId?: string;
  rateReadOnly?: boolean;
  /** Batch-fetched kit-compliance results keyed by `${entityId}::${roleTag}`. */
  kitComplianceByKey?: Map<string, KitComplianceResult | null>;
  /** When set, the row name click opens the Crew Hub detail rail. */
  onOpenDetail?: (row: DealCrewRow) => void;
}) {
  const { department, rows } = group;

  // Sort within section: confirmed first, then pending (assigned but unconfirmed), then declined, then open slots
  const sorted = useMemo(() => {
    const confirmed: DealCrewRow[] = [];
    const pending: DealCrewRow[] = [];
    const declined: DealCrewRow[] = [];
    const open: DealCrewRow[] = [];
    for (const r of rows) {
      if (r.entity_id === null) open.push(r);
      else if (r.confirmed_at !== null) confirmed.push(r);
      else if (r.declined_at !== null) declined.push(r);
      else pending.push(r);
    }
    return [...confirmed, ...pending, ...declined, ...open];
  }, [rows]);

  const confirmedCount = rows.filter((r) => r.confirmed_at !== null && r.entity_id !== null).length;
  const totalAssignable = rows.filter((r) => r.entity_id !== null || r.confirmed_at !== null).length || rows.length;

  return (
    <div className="border-b border-[oklch(1_0_0_/_0.06)] last:border-0">
      {/* Department header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2.5 px-1 group focus:outline-none"
      >
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={STAGE_LIGHT}
          className="shrink-0"
        >
          <ChevronDown className="size-3 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors" />
        </motion.div>
        <span className="stage-label tracking-tight">
          {department}
        </span>
        <span className="text-label text-[var(--stage-text-tertiary)] tabular-nums">
          {rows.length}
        </span>
        <span className="flex-1" />
        <span className="text-label text-[var(--stage-text-tertiary)] tracking-tight tabular-nums">
          {confirmedCount}/{totalAssignable} confirmed
        </span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <div className="pb-2 flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {sorted.map((row) =>
                  row.entity_id === null ? (
                    <OpenRoleSlotRow
                      key={row.id}
                      row={row}
                      sourceOrgId={sourceOrgId}
                      onAssign={onAssign}
                      onRemove={onRemove}
                      eventDate={eventDate}
                      workspaceId={workspaceId}
                    />
                  ) : (
                    <ConfirmedCrewRow
                      key={row.id}
                      row={row}
                      onRemove={onRemove}
                      onConfirm={row.confirmed_at === null ? onConfirm : undefined}
                      proposedDate={eventDate}
                      dealId={dealId}
                      rateReadOnly={rateReadOnly}
                      onOpenDetail={onOpenDetail}
                      kitCompliancePrefetched={
                        kitComplianceByKey && row.entity_id && row.role_note
                          ? kitComplianceByKey.get(`${row.entity_id}::${row.role_note}`) ?? null
                          : undefined
                      }
                    />
                  ),
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
