'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Loader2, RefreshCw, Bell, CalendarDays, Send, Package, X } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { formatTime12h } from '@/shared/lib/parse-time';
import { normalizeHumanName } from '@/shared/lib/normalize-human-name';
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
  /**
   * Crew rows from the parent's Plan bundle. Phase 1 cold-paint collapse
   * (2026-05-07): the Plan tab passes the bundle's `crew` field directly,
   * deduplicating the previous `getDealCrew(dealId)` round-trip. Optional
   * because the Deal lens still mounts this card without a bundle — when
   * undefined, the component fetches its own crew on mount (legacy
   * Deal-tab path).
   */
  crew?: DealCrewRow[];
  /** Whether the parent's bundle is still loading. Drives the spinner only — rows render against placeholder/keepPreviousData when available. */
  crewLoading?: boolean;
  /**
   * Kit-compliance results keyed by `${entityId}::${roleTag}` (matching
   * `getKitComplianceBatch` convention). Computed server-side inside the
   * Plan bundle so cold paint no longer fans out a client-side batch.
   * Optional for the same reason as `crew`.
   */
  kitComplianceByKey?: Record<string, KitComplianceResult | null>;
  /** Called after a successful crew mutation; parent invalidates the bundle. */
  onCrewChanged?: () => void;
};

const EMPTY_KIT_COMPLIANCE: Record<string, KitComplianceResult | null> = {};

type CrewFilter = 'all' | 'pending' | 'declined' | 'no_phone';

// Empty Map fallback so the legacy `Map`-based prop in `DepartmentSection`
// receives a stable reference. Built once per render from the Record passed
// by the parent — small allocation, scoped to crew sizes (typically <30).
function recordToMap(rec: Record<string, KitComplianceResult | null>): Map<string, KitComplianceResult | null> {
  return new Map(Object.entries(rec));
}

export function ProductionTeamCard({
  dealId,
  sourceOrgId,
  eventDate,
  workspaceId,
  isLocked = false,
  eventId = null,
  onOpenCrewDetail,
  crew: crewProp,
  crewLoading = false,
  kitComplianceByKey: kitComplianceByKeyProp,
  onCrewChanged,
}: ProductionTeamCardProps) {
  // Two consumption modes:
  //   1. Plan lens — passes `crew` + `kitComplianceByKey` from the Plan
  //      bundle. Mutations call `onCrewChanged` to invalidate the bundle.
  //   2. Deal lens — does not pass props; this component falls back to
  //      fetching its own crew + kit compliance on mount (legacy path).
  //
  // Using `crewProp !== undefined` rather than truthy check so an empty
  // array from the parent is honored as "bundle returned, no crew" and
  // doesn't trigger the legacy fetch.
  const usingBundle = crewProp !== undefined;
  const [localCrew, setLocalCrew] = useState<DealCrewRow[]>([]);
  const [localLoading, setLocalLoading] = useState(!usingBundle);
  const [localKitCompliance, setLocalKitCompliance] = useState<Record<string, KitComplianceResult | null>>(EMPTY_KIT_COMPLIANCE);

  const crew = usingBundle ? (crewProp as DealCrewRow[]) : localCrew;
  const kitComplianceByKey = usingBundle
    ? (kitComplianceByKeyProp ?? EMPTY_KIT_COMPLIANCE)
    : localKitCompliance;
  const loading = usingBundle ? crewLoading : localLoading;

  const fetchCrewLegacy = useCallback(async () => {
    const rows = await getDealCrew(dealId);
    setLocalCrew(rows);
    setLocalLoading(false);
  }, [dealId]);

  // Legacy mount fetch — Deal lens path only. When `crewProp` is set we
  // never fire this; the Plan bundle is the source of truth.
  useEffect(() => {
    if (usingBundle) return;
    fetchCrewLegacy();
  }, [usingBundle, fetchCrewLegacy]);

  // Legacy kit-compliance batch — Deal lens path only.
  useEffect(() => {
    if (usingBundle) return;
    const pairs = localCrew
      .filter((r): r is DealCrewRow & { entity_id: string; role_note: string } =>
        !!r.entity_id && !!r.role_note,
      )
      .map((r) => ({ entityId: r.entity_id, roleTag: r.role_note }));
    if (pairs.length === 0) {
      setLocalKitCompliance(EMPTY_KIT_COMPLIANCE);
      return;
    }
    let cancelled = false;
    getKitComplianceBatch(pairs).then((map) => {
      if (!cancelled) setLocalKitCompliance(Object.fromEntries(map));
    });
    return () => {
      cancelled = true;
    };
  }, [usingBundle, localCrew]);

  // Unified mutation refresher: bundle path bubbles to parent; legacy
  // path refetches locally. Mutation handlers below call this.
  const refreshCrew = useCallback(() => {
    if (usingBundle) {
      onCrewChanged?.();
    } else {
      void fetchCrewLegacy();
    }
  }, [usingBundle, onCrewChanged, fetchCrewLegacy]);

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [sendingDaySheet, setSendingDaySheet] = useState(false);
  const [daySheetPreviewOpen, setDaySheetPreviewOpen] = useState(false);
  // CSS-driven mount/slide for the day-sheet preview modal. Plan tab cold-paint
  // can stall the JS thread for several seconds (26+ server actions); framer-
  // motion's rAF-driven springs crawl when the thread is starved, leaving the
  // modal off-screen even though the state flipped. Same fix as
  // crew-detail-rail.tsx and cross-show-resource-modal.tsx (batch C precedent).
  const [daySheetMounted, setDaySheetMounted] = useState(false);
  const [daySheetSlideIn, setDaySheetSlideIn] = useState(false);
  const daySheetExitTimeoutRef = useRef<number | null>(null);
  const [filter, setFilter] = useState<CrewFilter>('all');
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [dayViewOpen, setDayViewOpen] = useState(false);
  // DepartmentSection still consumes a Map; materialize from the Record
  // prop. Memoized on the prop reference — bundle invalidation produces
  // a fresh Record only when the underlying compliance actually changes.
  const kitComplianceMap = useMemo(() => recordToMap(kitComplianceByKey), [kitComplianceByKey]);

  // ── Computed aggregates ─────────────────────────────────────────────────────

  const confirmed = crew.filter((r) => r.confirmed_at !== null && r.entity_id !== null);
  const pending = crew.filter((r) => r.entity_id !== null && r.confirmed_at === null && r.declined_at === null);
  const declined = crew.filter((r) => r.declined_at !== null);
  const openSlots = crew.filter((r) => r.entity_id === null);

  const isEmpty = confirmed.length === 0 && pending.length === 0 && declined.length === 0 && openSlots.length === 0;

  // ── Crew Hub coverage metrics ───────────────────────────────────────────────
  // "Positions" = all deal_crew rows (filled + holes). A hole is a row without
  // an entity_id. "Reachable" = has an entity + email (eligible for day sheet).
  // "Missing phone" = has an entity but no phone number on file.
  const positionsTotal = crew.length;
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
  // `crew` and `kitComplianceByKey` are now props from the parent's Plan
  // bundle (Phase 1 cold-paint collapse, 2026-05-07). The local fetch +
  // kit-compliance effect that lived here previously fired two extra
  // round-trips per cold paint on top of the bundle. Mutations call
  // `onCrewChanged` → parent `refreshBundle` → invalidation → re-render
  // with the updated `crew` prop.

  // ── Day-sheet preview mount/slide ───────────────────────────────────────────
  // Mount on open, then on the next animation frame flip slideIn = true so a
  // CSS transition runs. On close, flip slideIn = false and unmount after the
  // transition completes. CSS transforms are GPU-composited and animate
  // independently of JS pressure, so the modal still appears immediately
  // even during a cold Plan-tab paint.
  useEffect(() => {
    if (daySheetPreviewOpen) {
      if (daySheetExitTimeoutRef.current !== null) {
        window.clearTimeout(daySheetExitTimeoutRef.current);
        daySheetExitTimeoutRef.current = null;
      }
      setDaySheetMounted(true);
      let id2: number | null = null;
      const id1 = window.requestAnimationFrame(() => {
        id2 = window.requestAnimationFrame(() => setDaySheetSlideIn(true));
      });
      return () => {
        window.cancelAnimationFrame(id1);
        if (id2 !== null) window.cancelAnimationFrame(id2);
      };
    }
    setDaySheetSlideIn(false);
    daySheetExitTimeoutRef.current = window.setTimeout(() => {
      setDaySheetMounted(false);
      daySheetExitTimeoutRef.current = null;
    }, 240);
    return undefined;
  }, [daySheetPreviewOpen]);

  useEffect(() => {
    return () => {
      if (daySheetExitTimeoutRef.current !== null) {
        window.clearTimeout(daySheetExitTimeoutRef.current);
      }
    };
  }, []);

  // Escape closes the preview modal — standard modal expectation.
  useEffect(() => {
    if (!daySheetMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDaySheetPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [daySheetMounted]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAdd = async (result: CrewSearchResult) => {
    setAddPickerOpen(false);
    const res = await addManualDealCrew(dealId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      refreshCrew();
    } else {
      toast.error(res.error);
    }
  };

  const handleConfirm = async (rowId: string) => {
    const result = await confirmDealCrew(rowId);
    if (result.success) {
      refreshCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (rowId: string) => {
    const result = await removeDealCrew(rowId);
    if (result.success) {
      // Remote write succeeded — invalidate the bundle so the row drops
      // from the next render. Used to splice locally with setCrew; now the
      // single source of truth is the parent bundle.
      refreshCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    refreshCrew();
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
      refreshCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleAssign = async (rowId: string, result: CrewSearchResult) => {
    const res = await assignDealCrewEntity(rowId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      refreshCrew();
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
    refreshCrew();
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
          The "am I covered?" first glance. Single source of truth — the
          ConfirmationFunnel bar below shows confirmed/pending/declined/
          unassigned segments that always sum to `positionsTotal`, so we
          don't repeat the "X of Y filled" headline here. This row carries
          two things the bar can't: which roles are unassigned (specific
          labels) and operational chips (missing phone, bringing gear). */}
      {!loading && positionsTotal > 0 && (holeLabels.length > 0 || noPhoneCount > 0 || bringingGearCount > 0) && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {holeLabels.length > 0 && (
            <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
              {holeLabels.length === 1 ? '1 unassigned' : `${holeLabels.length} unassigned`}: {holeLabels.slice(0, 3).join(', ')}{holeLabels.length > 3 ? '…' : ''}
            </span>
          )}
          {noPhoneCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter((f) => (f === 'no_phone' ? 'all' : 'no_phone'))}
              className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              style={{
                color: 'var(--color-unusonic-warning)',
                background: 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
              }}
              title="Filter to crew without a phone number on file"
            >
              {noPhoneCount} missing phone
            </button>
          )}
          {bringingGearCount > 0 && (
            <span
              className="stage-badge-text tracking-tight px-1.5 py-0.0 rounded-md flex items-center gap-1"
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

      {/* ── Confirmation funnel ──────────────────────────────────────────
          Four-segment bar: confirmed / pending / declined / unassigned.
          The four counts always reconcile to crew.length, so there's a
          single internally-consistent readout of where every position
          stands. */}
      {!loading && crew.length > 0 && (
        <ConfirmationFunnel
          confirmed={confirmed.length}
          pending={pending.length}
          declined={declined.length}
          unassigned={openSlots.length}
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
              'Missing phone';
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
              ? 'Add crew here. Changes stay on the Plan tab and won\u2019t update the signed proposal.'
              : 'Add crew directly, or build a proposal with packages to auto-suggest them.'}
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
              kitComplianceByKey={kitComplianceMap}
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

      {/* CrossShowResourceModal — portaled to body. Always mounted so the
          modal can manage its own enter/exit transitions internally (CSS-
          driven, resilient to Plan-tab cold-paint thread starvation). */}
      {eventDate && (
        <CrossShowResourceModal
          open={dayViewOpen}
          onClose={() => setDayViewOpen(false)}
          date={eventDate}
          sourceOrgId={sourceOrgId}
        />
      )}

      {/* Day sheet send — personalization preview modal. Portaled so the
          overlay can escape StagePanel's stacking context. CSS-driven
          mount/slide for main-thread-resilience (see useEffect block above). */}
      {daySheetMounted && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60] bg-[var(--stage-scrim)]"
            style={{
              opacity: daySheetSlideIn ? 1 : 0,
              transition: 'opacity 200ms ease-out',
            }}
            onClick={() => setDaySheetPreviewOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Preview day sheet recipients"
            aria-modal="true"
            className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-md max-h-[80vh] flex flex-col rounded-2xl"
            style={{
              background: 'var(--stage-surface-raised, oklch(0.18 0 0))',
              border: '1px solid oklch(1 0 0 / 0.08)',
              boxShadow: '0 24px 64px oklch(0 0 0 / 0.45)',
              transform: daySheetSlideIn
                ? 'translate3d(-50%, -50%, 0) scale(1)'
                : 'translate3d(-50%, calc(-50% + 8px), 0) scale(0.98)',
              opacity: daySheetSlideIn ? 1 : 0,
              transition:
                'transform 220ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out',
              willChange: 'transform, opacity',
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
                            {r.entity_name ? normalizeHumanName(r.entity_name) : 'Unnamed'}
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
                            <span className="min-w-0 truncate">{r.entity_name ? normalizeHumanName(r.entity_name) : 'Unnamed'}</span>
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
          </div>
        </>,
        document.body,
      )}
    </StagePanel>
  );
}
