'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Plus, Loader2, RefreshCw, Bell, CalendarDays } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import {
  getDealCrew,
  addManualDealCrew,
  addManualOpenRole,
  confirmDealCrew,
  removeDealCrew,
  assignDealCrewEntity,
  remindAllUnconfirmed,
  type DealCrewRow,
  type CrewSearchResult,
} from '../actions/deal-crew';
import { DEPARTMENT_ORDER, inferDepartment } from '../lib/department-mapping';
import { CrewPicker } from './crew-picker';
import { DepartmentSection, type DepartmentGroup } from './department-section';
import { ConfirmationFunnel } from './confirmation-funnel';
import { CrossShowResourceModal } from './cross-show-resource-modal';
import {
  getKitComplianceBatch,
  type KitComplianceResult,
} from '@/features/talent-management/api/kit-template-actions';

// =============================================================================
// ProductionTeamCard
// =============================================================================

export type ProductionTeamCardProps = {
  dealId: string;
  sourceOrgId: string | null;
  /** Deal proposed_date — passed to CrewPicker for conflict checking. */
  eventDate?: string | null;
  /** Active workspace ID — passed to CrewPicker for decision data fetch. */
  workspaceId?: string | null;
  /** When true, rate fields become read-only (deal has been handed off to production). */
  isLocked?: boolean;
};

export function ProductionTeamCard({ dealId, sourceOrgId, eventDate, workspaceId, isLocked = false }: ProductionTeamCardProps) {
  const [crew, setCrew] = useState<DealCrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [dayViewOpen, setDayViewOpen] = useState(false);
  const [kitComplianceByKey, setKitComplianceByKey] = useState<Map<string, KitComplianceResult | null>>(
    new Map(),
  );

  // ── Computed aggregates ─────────────────────────────────────────────────────

  const confirmed = crew.filter((r) => r.confirmed_at !== null && r.entity_id !== null);
  const pending = crew.filter((r) => r.entity_id !== null && r.confirmed_at === null && r.declined_at === null);
  const declined = crew.filter((r) => r.declined_at !== null);
  const openSlots = crew.filter((r) => r.entity_id === null);

  const isEmpty = confirmed.length === 0 && pending.length === 0 && declined.length === 0 && openSlots.length === 0;

  // ── Department groups ───────────────────────────────────────────────────────

  const departmentGroups = useMemo((): DepartmentGroup[] => {
    const groups = new Map<string, DealCrewRow[]>();
    for (const row of crew) {
      const dept = row.department ?? inferDepartment(row.role_note, row.job_title);
      const list = groups.get(dept) ?? [];
      list.push(row);
      groups.set(dept, list);
    }
    // Sort by DEPARTMENT_ORDER, unknown departments after 'General'
    const ordered = (DEPARTMENT_ORDER as readonly string[])
      .filter((d) => groups.has(d))
      .map((d) => ({ department: d, rows: groups.get(d)! }));
    const extras = [...groups.entries()]
      .filter(([d]) => !(DEPARTMENT_ORDER as readonly string[]).includes(d))
      .map(([department, rows]) => ({ department, rows }));
    return [...ordered, ...extras];
  }, [crew]);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchCrew = useCallback(async () => {
    const rows = await getDealCrew(dealId);
    setCrew(rows);
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchCrew();
  }, [fetchCrew]);

  // Batch-fetch kit compliance for every (entity, role_note) pair in one pass
  // instead of N parallel per-row fetches. Keyed by \`${entityId}::${roleTag}\`.
  useEffect(() => {
    const pairs = crew
      .filter((r): r is DealCrewRow & { entity_id: string; role_note: string } =>
        !!r.entity_id && !!r.role_note,
      )
      .map((r) => ({ entityId: r.entity_id, roleTag: r.role_note }));
    if (pairs.length === 0) {
      setKitComplianceByKey(new Map());
      return;
    }
    let cancelled = false;
    getKitComplianceBatch(pairs).then((map) => {
      if (!cancelled) setKitComplianceByKey(map);
    });
    return () => { cancelled = true; };
  }, [crew]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAdd = async (result: CrewSearchResult) => {
    setAddPickerOpen(false);
    const res = await addManualDealCrew(dealId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      await fetchCrew();
    } else {
      toast.error(res.error);
    }
  };

  const handleConfirm = async (rowId: string) => {
    const result = await confirmDealCrew(rowId);
    if (result.success) {
      await fetchCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (rowId: string) => {
    const result = await removeDealCrew(rowId);
    if (result.success) {
      setCrew((prev) => prev.filter((r) => r.id !== rowId));
    } else {
      toast.error(result.error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetchCrew();
    setSyncing(false);
  };

  const handleAddRole = async () => {
    const trimmed = roleInput.trim();
    if (!trimmed) return;
    setRoleAdding(true);
    const result = await addManualOpenRole(dealId, trimmed);
    setRoleAdding(false);
    if (result.success) {
      setRoleInput('');
      setAddRoleOpen(false);
      await fetchCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleAssign = async (rowId: string, result: CrewSearchResult) => {
    const res = await assignDealCrewEntity(rowId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      await fetchCrew();
    } else {
      toast.error(res.error);
    }
  };

  const handleRemindAll = async () => {
    setReminding(true);
    const result = await remindAllUnconfirmed(dealId);
    setReminding(false);
    const { sent, skipped, notHandedOff } = result;
    if (sent === 0 && skipped === 0) {
      toast('No pending crew to remind');
      return;
    }
    if (notHandedOff) {
      toast('Reminders unavailable — hand over to production first.', {
        description: `${skipped} pending crew waiting.`,
      });
      return;
    }
    const parts: string[] = [];
    if (sent > 0) parts.push(`Reminded ${sent} crew`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    toast(parts.join(' \u2014 '));
  };

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <StagePanel elevated className="p-5 shrink-0">
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <p className="stage-label">
          Production team
        </p>
        <div className="flex items-center gap-2">
          {/* Day view — only when event date is available */}
          {eventDate && (
            <button
              type="button"
              onClick={() => setDayViewOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-label font-medium tracking-tight text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              title="View all shows on this date"
            >
              <CalendarDays className="size-3" />
              <span>Day view</span>
            </button>
          )}
          {/* Remind all — only when there are pending crew */}
          {!loading && pending.length > 0 && (
            <button
              type="button"
              onClick={handleRemindAll}
              disabled={reminding}
              className="flex items-center gap-1 px-2 py-1 text-label font-medium tracking-tight text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none disabled:opacity-45"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              title="Send reminders to all unconfirmed crew"
            >
              {reminding ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Bell className="size-3" />
              )}
              <span>Remind all</span>
            </button>
          )}
          {loading || syncing ? (
            <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
          ) : (
            <button
              type="button"
              onClick={handleSync}
              className="p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              aria-label="Resync from proposal"
              title="Resync from proposal"
            >
              <RefreshCw className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Confirmation funnel ────────────────────────────────────────── */}
      {!loading && crew.length > 0 && (
        <ConfirmationFunnel
          confirmed={confirmed.length}
          pending={pending.length}
          declined={declined.length}
          total={crew.length}
        />
      )}

      {/* Empty state — only when all tiers are empty. Copy branches post-handoff
       *  because the "Build a proposal" nudge is stale once the deal is won. */}
      {!loading && isEmpty && (
        <div className="mb-4">
          <p className="stage-field-label text-[var(--stage-text-secondary)] mb-1">
            No crew yet
          </p>
          <p className="stage-badge-text text-[var(--stage-text-tertiary)] leading-relaxed">
            {isLocked
              ? 'No crew was assigned on the deal. Add crew here — assignments live on the Plan tab only; they do not flow back to the signed proposal.'
              : 'Build a proposal with package assignments to get crew suggestions, or add crew directly. Manual additions here won\u2019t appear on the proposal line items.'}
          </p>
        </div>
      )}

      {/* ── Department groups ──────────────────────────────────────────── */}
      {!loading && departmentGroups.length > 0 && (
        <div>
          {departmentGroups.map((group) => (
            <DepartmentSection
              key={group.department}
              group={group}
              collapsed={collapsedDepts.has(group.department)}
              onToggle={() => toggleDept(group.department)}
              sourceOrgId={sourceOrgId}
              onRemove={handleRemove}
              onConfirm={handleConfirm}
              onAssign={handleAssign}
              eventDate={eventDate}
              workspaceId={workspaceId}
              dealId={dealId}
              rateReadOnly={isLocked}
              kitComplianceByKey={kitComplianceByKey}
            />
          ))}
        </div>
      )}

      {/* ── Add crew / Add role ─────────────────────────────────────────────── */}
      {/* Post-handoff (isLocked=true) the scalar confirmation lives in Plan Lens;
       *  hide the add-crew / add-role affordances entirely so a PM can't bypass
       *  the confirmation modal by adding fresh rows here. Rate editing stays
       *  gated by rateReadOnly on existing rows. */}
      {!isLocked && (
      <div className={cn(!isEmpty && 'mt-4 pt-4 border-t border-[oklch(1_0_0_/_0.04)]')}>
        <div className="flex items-center gap-3">
          {sourceOrgId && (
            <button
              type="button"
              onClick={() => { setAddPickerOpen((v) => !v); setAddRoleOpen(false); }}
              className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
            >
              <Plus size={13} />
              <span>Add crew</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setAddRoleOpen((v) => !v); setAddPickerOpen(false); }}
            className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          >
            <Plus size={13} />
            <span>Add role</span>
          </button>
        </div>

        {/* Inline crew picker */}
        {addPickerOpen && sourceOrgId && (
          <>
            {createPortal(
              <div className="fixed inset-0 z-40" onClick={() => setAddPickerOpen(false)} />,
              document.body,
            )}
            <div className="relative z-50">
              <CrewPicker
                sourceOrgId={sourceOrgId}
                onSelect={handleAdd}
                onClose={() => setAddPickerOpen(false)}
                eventDate={eventDate}
                workspaceId={workspaceId}
              />
            </div>
          </>
        )}

        {/* Inline role name input */}
        {addRoleOpen && (
          <>
            {createPortal(
              <div className="fixed inset-0 z-40" onClick={() => { setAddRoleOpen(false); setRoleInput(''); }} />,
              document.body,
            )}
            <div className="relative z-50 flex items-center gap-2 mt-2.5">
              <input
                autoFocus
                type="text"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRole();
                  if (e.key === 'Escape') { setAddRoleOpen(false); setRoleInput(''); }
                }}
                placeholder="Role name (e.g. Stage Manager)"
                className="flex-1 bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)]"
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              />
              <button
                type="button"
                onClick={handleAddRole}
                disabled={!roleInput.trim() || roleAdding}
                className="stage-btn stage-btn-secondary px-3 py-1.5 text-sm disabled:opacity-45 disabled:pointer-events-none"
              >
                {roleAdding ? <Loader2 className="size-3.5 animate-spin" /> : 'Add'}
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* CrossShowResourceModal — portaled to body */}
      {eventDate && (
        <AnimatePresence>
          {dayViewOpen && (
            <CrossShowResourceModal
              open={dayViewOpen}
              onClose={() => setDayViewOpen(false)}
              date={eventDate}
              sourceOrgId={sourceOrgId}
            />
          )}
        </AnimatePresence>
      )}
    </StagePanel>
  );
}
