'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Plus, Loader2, RefreshCw, Bell, CalendarDays, Send, Package, X } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { formatTime12h } from '@/shared/lib/parse-time';
import { motion } from 'framer-motion';
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
import { compileAndSendDaySheet } from '../actions/compile-and-send-day-sheet';
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
  /** Set post-handoff. Enables the "Send day sheet to all reachable" bulk action. */
  eventId?: string | null;
  /** Lifted rail handler — when set, row clicks open the Crew Hub detail rail
   *  at the plan-lens level. When not set (Deal tab), rows stay non-clickable. */
  onOpenCrewDetail?: (row: DealCrewRow) => void;
};

type CrewFilter = 'all' | 'pending' | 'declined' | 'no_phone';

export function ProductionTeamCard({ dealId, sourceOrgId, eventDate, workspaceId, isLocked = false, eventId = null, onOpenCrewDetail }: ProductionTeamCardProps) {
  const [crew, setCrew] = useState<DealCrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [sendingDaySheet, setSendingDaySheet] = useState(false);
  const [daySheetPreviewOpen, setDaySheetPreviewOpen] = useState(false);
  const [filter, setFilter] = useState<CrewFilter>('all');
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

  // ── Crew Hub coverage metrics ───────────────────────────────────────────────
  // "Positions" = all deal_crew rows (filled + holes). A hole is a row without
  // an entity_id. "Reachable" = has an entity + email (eligible for day sheet).
  // "No phone" = has an entity but no phone number on file.
  const positionsTotal = crew.length;
  const positionsFilled = crew.filter((r) => r.entity_id).length;
  const holeLabels = openSlots
    .map((r) => (r.role_note ?? '').trim())
    .filter((s) => s.length > 0);
  const reachableCount = crew.filter((r) => r.entity_id && r.email).length;
  const noPhoneCount = crew.filter((r) => r.entity_id && !r.phone).length;
  // brings_own_gear is flipped by sourceGearFromCrew + bringKitItemsToEvent,
  // so counting it gives us "how many crew are contributing gear to this show"
  // without a separate fetch of event_gear_items.
  const bringingGearCount = crew.filter((r) => r.entity_id && r.brings_own_gear).length;

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filteredCrew = useMemo(() => {
    if (filter === 'all') return crew;
    if (filter === 'pending') {
      return crew.filter((r) => r.entity_id && r.confirmed_at === null && r.declined_at === null);
    }
    if (filter === 'declined') {
      return crew.filter((r) => r.declined_at !== null);
    }
    if (filter === 'no_phone') {
      return crew.filter((r) => r.entity_id && !r.phone);
    }
    return crew;
  }, [crew, filter]);

  // ── Department groups (filtered) ────────────────────────────────────────────

  const departmentGroups = useMemo((): DepartmentGroup[] => {
    const groups = new Map<string, DealCrewRow[]>();
    for (const row of filteredCrew) {
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
  }, [filteredCrew]);

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

  const handleSendDaySheet = async () => {
    if (!eventId) return;
    setDaySheetPreviewOpen(false);
    setSendingDaySheet(true);
    const result = await compileAndSendDaySheet({ eventId, dealId });
    setSendingDaySheet(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const parts: string[] = [];
    if (result.sentCount > 0) parts.push(`Sent to ${result.sentCount}`);
    if (result.skippedCount > 0) parts.push(`${result.skippedCount} skipped (no email)`);
    if (result.failedCount > 0) parts.push(`${result.failedCount} failed`);
    toast(parts.join(' \u2014 '));
    await fetchCrew();
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
      <div className="flex items-center justify-between mb-2">
        <p className="stage-label">
          Crew
        </p>
        <div className="flex items-center gap-2">
          {/* Day view — only when event date is available */}
          {eventDate && (
            <button
              type="button"
              onClick={() => setDayViewOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm tracking-tight text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              title="View all shows on this date"
            >
              <CalendarDays className="size-3.5" />
              <span>Day view</span>
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

      {/* ── Coverage summary ────────────────────────────────────────────
          The "am I covered?" first glance: how many positions filled, which
          are holes. Separate from the confirmation funnel below which shows
          the confirm/pending/decline state of the filled positions. */}
      {!loading && positionsTotal > 0 && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm tabular-nums tracking-tight text-[var(--stage-text-primary)]">
            {positionsFilled} of {positionsTotal} positions filled
          </span>
          {holeLabels.length > 0 && (
            <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
              · {holeLabels.length === 1 ? '1 hole' : `${holeLabels.length} holes`}: {holeLabels.slice(0, 3).join(', ')}{holeLabels.length > 3 ? '…' : ''}
            </span>
          )}
          {noPhoneCount > 0 && (
            <span
              className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
              style={{
                color: 'var(--color-unusonic-warning)',
                background: 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
              }}
              title="Crew without a phone number on file"
            >
              ⚠ {noPhoneCount} no phone
            </span>
          )}
          {bringingGearCount > 0 && (
            <span
              className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1"
              style={{
                color: 'var(--stage-text-secondary)',
                background: 'oklch(1 0 0 / 0.04)',
              }}
              title="Crew contributing gear to this show"
            >
              <Package className="size-2.5" />
              {bringingGearCount} bringing gear
            </span>
          )}
        </div>
      )}

      {/* ── Confirmation funnel ────────────────────────────────────────── */}
      {!loading && crew.length > 0 && (
        <ConfirmationFunnel
          confirmed={confirmed.length}
          pending={pending.length}
          declined={declined.length}
          total={crew.length}
        />
      )}

      {/* ── Bulk actions ──────────────────────────────────────────────────
          Absorbs the DaySheetActionStrip that previously lived in plan-lens
          Comms panel. "Send to all reachable" excludes open roles (no entity)
          and crew without email — those surface in the skipped count toast. */}
      {!loading && crew.length > 0 && (eventId || pending.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {eventId && reachableCount > 0 && (
            <button
              type="button"
              onClick={() => setDaySheetPreviewOpen(true)}
              disabled={sendingDaySheet}
              className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
              title="Preview who gets the day sheet before sending"
            >
              {sendingDaySheet ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
              <span>Send day sheet to all reachable ({reachableCount})</span>
            </button>
          )}
          {pending.length > 0 && (
            <button
              type="button"
              onClick={handleRemindAll}
              disabled={reminding}
              className="stage-btn stage-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
              title="Send a reminder to every unconfirmed crew member"
            >
              {reminding ? <Loader2 className="size-3 animate-spin" /> : <Bell className="size-3" />}
              <span>Nudge unconfirmed ({pending.length})</span>
            </button>
          )}
        </div>
      )}

      {/* ── Filter chips ──────────────────────────────────────────────────
          Event-scoped. Scoped to this card to avoid competing with the Stream
          queue and Plan follow-up card as a third "needs attention" surface. */}
      {!loading && crew.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {(['all', 'pending', 'declined', 'no_phone'] as CrewFilter[]).map((f) => {
            const count =
              f === 'all' ? crew.length :
              f === 'pending' ? pending.length :
              f === 'declined' ? declined.length :
              noPhoneCount;
            const label =
              f === 'all' ? 'All' :
              f === 'pending' ? 'Pending' :
              f === 'declined' ? 'Declined' :
              'No phone';
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 py-0.5 rounded-full stage-badge-text tracking-tight transition-colors focus:outline-none',
                  active
                    ? 'text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                )}
                style={{
                  background: active ? 'oklch(1 0 0 / 0.08)' : 'transparent',
                  border: `1px solid ${active ? 'oklch(1 0 0 / 0.12)' : 'oklch(1 0 0 / 0.06)'}`,
                }}
              >
                {label}{count > 0 && <span className="ml-1 tabular-nums opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
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
              rateReadOnly={false}
              kitComplianceByKey={kitComplianceByKey}
              onOpenDetail={onOpenCrewDetail}
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

      {/* Day sheet send — personalization preview modal. Portaled so the
          overlay can escape StagePanel's stacking context. */}
      <AnimatePresence>
        {daySheetPreviewOpen && createPortal(
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50"
              onClick={() => setDaySheetPreviewOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={STAGE_MEDIUM}
              role="dialog"
              aria-label="Preview day sheet recipients"
              className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md max-h-[80vh] flex flex-col rounded-2xl"
              style={{
                background: 'var(--stage-surface-raised, oklch(0.18 0 0))',
                border: '1px solid oklch(1 0 0 / 0.08)',
                boxShadow: '0 24px 64px oklch(0 0 0 / 0.45)',
              }}
              data-surface="raised"
            >
              <div
                className="flex items-center justify-between p-4 border-b"
                style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
              >
                <p className="stage-label">Send day sheet</p>
                <button
                  type="button"
                  onClick={() => setDaySheetPreviewOpen(false)}
                  className="p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] focus:outline-none"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  aria-label="Close preview"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-[var(--stage-text-secondary)]">
                  Each crew member receives their own copy with their personal call time when set.
                </p>
                <div>
                  <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
                    {reachableCount} will receive
                  </span>
                  <ul className="flex flex-col mt-1">
                    {crew
                      .filter((r) => r.entity_id && r.email)
                      .map((r) => (
                        <li key={r.id} className="flex items-center gap-2 py-1 text-sm">
                          <span className="text-[var(--stage-text-primary)] min-w-0 truncate">
                            {r.entity_name ?? 'Unnamed'}
                          </span>
                          {r.role_note && (
                            <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
                              {r.role_note}
                            </span>
                          )}
                          <span className="ml-auto stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
                            {r.call_time ? `Call ${formatTime12h(r.call_time)}` : 'Show call'}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
                {crew.filter((r) => r.entity_id && !r.email).length > 0 && (
                  <div>
                    <span
                      className="stage-badge-text tracking-tight"
                      style={{ color: 'var(--color-unusonic-warning)' }}
                    >
                      {crew.filter((r) => r.entity_id && !r.email).length} skipped — no email
                    </span>
                    <ul className="flex flex-col mt-1">
                      {crew
                        .filter((r) => r.entity_id && !r.email)
                        .map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center gap-2 py-1 text-sm text-[var(--stage-text-tertiary)]"
                          >
                            <span className="min-w-0 truncate">{r.entity_name ?? 'Unnamed'}</span>
                            {r.role_note && (
                              <span className="stage-badge-text tracking-tight">{r.role_note}</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
              <div
                className="flex items-center justify-end gap-2 p-4 border-t"
                style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
              >
                <button
                  type="button"
                  onClick={() => setDaySheetPreviewOpen(false)}
                  className="stage-btn stage-btn-ghost text-sm px-2.5 py-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendDaySheet}
                  disabled={sendingDaySheet || reachableCount === 0}
                  className="stage-btn stage-btn-primary flex items-center gap-1.5 px-3 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
                >
                  {sendingDaySheet ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  Send to {reachableCount}
                </button>
              </div>
            </motion.div>
          </>,
          document.body,
        )}
      </AnimatePresence>
    </StagePanel>
  );
}
