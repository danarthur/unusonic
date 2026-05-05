'use client';

/**
 * CrewDetailRail — right-side drawer (desktop) / bottom sheet (mobile)
 *
 * Orchestrator shell. Owns:
 *   - All row-scoped state (notes, calls, gear, schedule, waypoints, pay).
 *   - All async handlers (confirm, remove, replace, dispatch, payment cycles).
 *   - The portal/animation shell + slide-in chrome.
 *
 * Sub-components live under ./crew-detail-rail/:
 *   - shared.tsx        constants, types, computePhase / computeCompliance,
 *                       formatRelative, nextInCycle, WaypointPatch alias.
 *   - header.tsx        RailHeader + ComplianceStrip.
 *   - cells.tsx         CyclableTile (Live grid) + PayField (pay editor).
 *   - times-stack.tsx   TimesStack — primary call + per-person waypoints.
 *   - gear-section.tsx  GearSection — supplied gear + bring-from-kit picker.
 *
 * Public API: CrewDetailRail (re-exported below for backward compatibility
 * with `import { CrewDetailRail } from './crew-detail-rail'` callers).
 *
 * Internal helpers (CyclableTile, PayField, TimesStack, computePhase,
 * computeCompliance, formatRelative) are also re-exported so any future
 * direct caller of those names continues to compile. They were not exported
 * from this module before the split, so this is purely a future-safety net.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Activity as ActivityIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { formatTime12h } from '@/shared/lib/parse-time';
import type { DealCrewRow } from '../actions/deal-crew';
import {
  confirmDealCrew,
  removeDealCrew,
  updateCrewDispatch,
} from '../actions/deal-crew';
import type { EventGearItem } from '../actions/event-gear-items';
import {
  getCrewCommsLog,
  getCueScheduleForCrew,
  getCrewSuppliedGear,
  getCrewOwnedKit,
  bringKitItemsToEvent,
  replaceCrewMember,
  updateCrewNotes,
  logCrewPhoneCall,
  listCrewWaypoints,
  addCrewWaypoint,
  updateCrewWaypoint,
  removeCrewWaypoint,
  type CrewCommsLogEntry,
  type CueAssignment,
  type CrewOwnedKit,
  type CrewWaypoint,
  type WaypointKind,
} from '../actions/crew-hub';
import { getKitComplianceForEntity, type KitComplianceResult } from '@/features/talent-management/api/kit-template-actions';
import { checkCrewAvailability, type CrewAvailabilityResult } from '@/features/ops/actions/check-crew-availability';
import {
  DISPATCH_ORDER,
  DISPATCH_LABELS,
  PAYMENT_ORDER,
  PAYMENT_LABELS,
  computePhase,
  computeCompliance,
  nextInCycle,
  type DispatchStatus,
  type PaymentStatus,
} from './crew-detail-rail/shared';
import { RailHeader, ComplianceStrip } from './crew-detail-rail/header';
import { CyclableTile } from './crew-detail-rail/cells';
import { GearSection } from './crew-detail-rail/gear-section';
import { AgreedSection } from './crew-detail-rail/agreed-section';
import { TimelineSection } from './crew-detail-rail/timeline-section';
import { QuickActions } from './crew-detail-rail/quick-actions';
import { DangerZone } from './crew-detail-rail/danger-zone';

// =============================================================================
// CrewDetailRail — right-side drawer (desktop) / bottom sheet (mobile)
// =============================================================================

export function CrewDetailRail({
  row,
  eventId,
  sourceOrgId = null,
  workspaceId = null,
  eventDate = null,
  eventStartsAt = null,
  dealId = null,
  onClose,
  onRowChanged,
}: {
  row: DealCrewRow | null;
  eventId: string | null;
  /** Org ID for the replace-picker's search. Required for the picker to work. */
  sourceOrgId?: string | null;
  workspaceId?: string | null;
  /** Event date (YYYY-MM-DD) — fed to the picker for conflict checking and
   *  the cross-show availability check in the header. */
  eventDate?: string | null;
  /** Full ISO timestamp — used to compute the header phase indicator
   *  (T-N days / hours to call / SHOW DAY / WRAPPED). */
  eventStartsAt?: string | null;
  /** Deal ID — used to exclude the current deal from conflict checks so
   *  the rail doesn't flag itself. */
  dealId?: string | null;
  onClose: () => void;
  /** Called after mutations so the parent list can refetch. */
  onRowChanged: () => void;
}) {
  const open = row !== null;

  const [log, setLog] = useState<CrewCommsLogEntry[]>([]);
  const [schedule, setSchedule] = useState<CueAssignment[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [callDraft, setCallDraft] = useState('');
  const [callSaving, setCallSaving] = useState(false);

  const [suppliedGear, setSuppliedGear] = useState<EventGearItem[]>([]);
  const [ownedKit, setOwnedKit] = useState<CrewOwnedKit[]>([]);
  const [kitCompliance, setKitCompliance] = useState<KitComplianceResult | null>(null);
  const [loadingGear, setLoadingGear] = useState(false);
  const [bringingFromKit, setBringingFromKit] = useState(false);
  const [kitPickerOpen, setKitPickerOpen] = useState(false);
  const [selectedKitIds, setSelectedKitIds] = useState<Set<string>>(new Set());

  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  // Cross-show availability for this entity on this event date. Powers the
  // "2 shows Sat" warning in the header compliance strip.
  const [availability, setAvailability] = useState<CrewAvailabilityResult | null>(null);

  // Phase indicator recalculates on a 60s interval so "2h to call" decays
  // without needing a manual refresh. Cleared when the rail is closed.
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Show-day cyclable tile state. We mirror the row's dispatch cycle pattern
  // from ConfirmedCrewRow — same cycle order, optimistic UI.
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [callTimeSaving, setCallTimeSaving] = useState(false);
  const [waypoints, setWaypoints] = useState<CrewWaypoint[]>([]);
  const [payExpanded, setPayExpanded] = useState(false);
  const [payDraft, setPayDraft] = useState({ base: '', travel: '', diem: '', kit: '' });
  const [paySaving, setPaySaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Refresh the phase indicator clock every minute while the rail is open.
  useEffect(() => {
    if (!row) return;
    const i = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(i);
  }, [row]);

  // Cross-show availability check — fires when the rail opens on an assigned
  // entity with an event date. excludeDealId prevents the rail from flagging
  // its own deal as a conflict.
  useEffect(() => {
    if (!row || !row.entity_id || !eventDate) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    checkCrewAvailability(
      row.entity_id,
      eventDate,
      dealId ?? undefined,
      eventId ?? undefined,
    ).then((r) => {
      if (!cancelled) setAvailability(r);
    });
    return () => { cancelled = true; };
  }, [row, eventDate, dealId, eventId]);

  // Slide-from-right on desktop, slide-from-bottom on mobile. Matches the
  // pattern used by production-grid-shell and aligns with what PMs expect on
  // their phones (bottom sheet).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Refresh data when the selected row changes.
  useEffect(() => {
    if (!row) return;
    setNoteDraft(row.crew_notes ?? '');
    setCallDraft('');
    setKitPickerOpen(false);
    setSelectedKitIds(new Set());
    setReplacePickerOpen(false);
    setDispatchStatus((row.dispatch_status as DispatchStatus | null) ?? null);
    setPaymentStatus((row.payment_status as PaymentStatus | null) ?? 'pending');
    setCallTimeSaving(false);
    setPayExpanded(false);
    // Waypoint load happens here rather than its own effect so it clears
    // alongside the rest of the row-scoped state when the selection changes.
    listCrewWaypoints(row.id).then(setWaypoints);
    setPayDraft({
      base: row.day_rate != null ? String(row.day_rate) : '',
      travel: row.travel_stipend != null ? String(row.travel_stipend) : '',
      diem: row.per_diem != null ? String(row.per_diem) : '',
      kit: row.kit_fee != null ? String(row.kit_fee) : '',
    });

    let cancelled = false;
    setLoadingLog(true);
    getCrewCommsLog(row.id).then((entries) => {
      if (!cancelled) {
        setLog(entries);
        setLoadingLog(false);
      }
    });

    if (eventId && row.entity_id) {
      setLoadingSchedule(true);
      getCueScheduleForCrew(eventId, row.entity_id).then((cues) => {
        if (!cancelled) {
          setSchedule(cues);
          setLoadingSchedule(false);
        }
      });
    } else {
      setSchedule([]);
    }

    // Gear: supplied-to-this-event + owned kit + kit compliance against the role
    if (row.entity_id) {
      setLoadingGear(true);
      const entityId = row.entity_id;
      const promises: Promise<unknown>[] = [
        getCrewOwnedKit({ entityId, eventId }).then((kit) => {
          if (!cancelled) setOwnedKit(kit);
        }),
      ];
      if (eventId) {
        promises.push(
          getCrewSuppliedGear({ eventId, entityId }).then((items) => {
            if (!cancelled) setSuppliedGear(items);
          }),
        );
      } else {
        setSuppliedGear([]);
      }
      if (row.role_note) {
        promises.push(
          getKitComplianceForEntity(entityId, row.role_note).then((result) => {
            if (!cancelled) setKitCompliance(result);
          }),
        );
      } else {
        setKitCompliance(null);
      }
      Promise.all(promises).finally(() => {
        if (!cancelled) setLoadingGear(false);
      });
    } else {
      setSuppliedGear([]);
      setOwnedKit([]);
      setKitCompliance(null);
    }

    return () => { cancelled = true; };
  }, [row, eventId]);

  // Escape-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const refreshLog = useCallback(() => {
    if (!row) return;
    getCrewCommsLog(row.id).then(setLog);
  }, [row]);

  const refreshGear = useCallback(() => {
    if (!row || !row.entity_id) return;
    const entityId = row.entity_id;
    if (eventId) getCrewSuppliedGear({ eventId, entityId }).then(setSuppliedGear);
    getCrewOwnedKit({ entityId, eventId }).then(setOwnedKit);
    if (row.role_note) {
      getKitComplianceForEntity(entityId, row.role_note).then(setKitCompliance);
    }
  }, [row, eventId]);

  const handleBringFromKit = async () => {
    if (!row || !row.entity_id || !eventId) return;
    const ids = Array.from(selectedKitIds);
    if (ids.length === 0) return;
    setBringingFromKit(true);
    const result = await bringKitItemsToEvent({
      eventId,
      entityId: row.entity_id,
      equipmentIds: ids,
    });
    setBringingFromKit(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const parts: string[] = [];
    if (result.created > 0) parts.push(`Added ${result.created}`);
    if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
    toast(parts.join(' \u2014 ') || 'Nothing changed');
    setKitPickerOpen(false);
    setSelectedKitIds(new Set());
    refreshGear();
    onRowChanged();
  };

  const toggleKitSelection = (equipmentId: string) => {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (next.has(equipmentId)) next.delete(equipmentId);
      else next.add(equipmentId);
      return next;
    });
  };

  const handleCycleDispatch = async () => {
    if (!row) return;
    const next = nextInCycle(DISPATCH_ORDER, dispatchStatus);
    setDispatchStatus(next);
    await updateCrewDispatch(row.id, { dispatch_status: next });
    onRowChanged();
  };

  const handleCyclePayment = async () => {
    if (!row) return;
    const next = nextInCycle(PAYMENT_ORDER, paymentStatus);
    setPaymentStatus(next);
    await updateCrewDispatch(row.id, {
      payment_status: next,
      payment_date: next === 'paid' ? new Date().toISOString() : null,
    });
    onRowChanged();
  };

  const refreshWaypoints = useCallback(() => {
    if (!row) return;
    listCrewWaypoints(row.id).then(setWaypoints);
  }, [row]);

  const handleAddWaypoint = async (input: {
    kind: WaypointKind;
    customLabel?: string | null;
    time: string;
    locationName?: string | null;
    locationAddress?: string | null;
    notes?: string | null;
  }) => {
    if (!row) return;
    const result = await addCrewWaypoint({
      dealCrewId: row.id,
      ...input,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    refreshWaypoints();
  };

  const handleUpdateWaypoint = async (id: string, patch: Parameters<typeof updateCrewWaypoint>[0]['patch']) => {
    const result = await updateCrewWaypoint({ id, patch });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    refreshWaypoints();
  };

  const handleRemoveWaypoint = async (id: string) => {
    const result = await removeCrewWaypoint({ id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    refreshWaypoints();
  };

  const handleCallTimeChange = async (nextValue: string | null) => {
    if (!row) return;
    if ((row.call_time ?? null) === nextValue) return;
    setCallTimeSaving(true);
    const result = await updateCrewDispatch(row.id, { call_time: nextValue });
    setCallTimeSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onRowChanged();
  };

  const handleSavePay = async () => {
    if (!row) return;
    setPaySaving(true);
    const result = await updateCrewDispatch(row.id, {
      day_rate: payDraft.base ? Number(payDraft.base) : null,
      travel_stipend: payDraft.travel ? Number(payDraft.travel) : null,
      per_diem: payDraft.diem ? Number(payDraft.diem) : null,
      kit_fee: payDraft.kit ? Number(payDraft.kit) : null,
    });
    setPaySaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    refreshLog();
    onRowChanged();
  };

  const handleConfirm = async () => {
    if (!row) return;
    setConfirming(true);
    const result = await confirmDealCrew(row.id);
    setConfirming(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast('Confirmed');
    refreshLog();
    onRowChanged();
  };

  const handleRemove = async () => {
    if (!row) return;
    if (!window.confirm(`Remove ${row.entity_name ?? 'this person'} from the crew?`)) return;
    setRemoving(true);
    const result = await removeDealCrew(row.id);
    setRemoving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast('Removed from crew');
    onRowChanged();
    onClose();
  };

  const handleReplacePick = async (pick: { entity_id: string }) => {
    if (!row) return;
    setReplacePickerOpen(false);
    setReplacing(true);
    const result = await replaceCrewMember({
      dealCrewId: row.id,
      newEntityId: pick.entity_id,
    });
    setReplacing(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast(`Replaced ${row.entity_name ?? 'crew member'}`);
    onRowChanged();
    onClose();
  };

  const handleSaveNote = async () => {
    if (!row) return;
    const trimmed = noteDraft.trim();
    // Avoid spurious writes when the user tabs away without changes.
    if ((row.crew_notes ?? '') === trimmed) return;
    setNoteSaving(true);
    const result = await updateCrewNotes({
      dealCrewId: row.id,
      note: trimmed.length ? trimmed : null,
    });
    setNoteSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast('Note saved');
    onRowChanged();
  };

  const handleLogCall = async () => {
    if (!row) return;
    const trimmed = callDraft.trim();
    if (!trimmed) return;
    setCallSaving(true);
    const result = await logCrewPhoneCall({
      dealCrewId: row.id,
      eventId,
      summary: trimmed,
    });
    setCallSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCallDraft('');
    refreshLog();
  };

  const name = row?.entity_name ?? 'Unnamed';
  const role = row?.role_note ?? row?.job_title ?? null;
  const isGhost = row?.is_ghost ?? false;
  const isContractor = row?.employment_status === 'external_contractor';

  // ── Phase indicator ────────────────────────────────────────────────────────
  // Answers "how far out is this show?" so the PM knows whether they're
  // planning (edit everything) or executing (dispatch/arrive mode). Tone
  // changes with phase — gentle pre-show, loud on show day.
  const phase = computePhase(row?.call_time ?? null, eventStartsAt ?? null, nowTs);

  // ── Compliance summary ─────────────────────────────────────────────────────
  // Rolls up three things the PM genuinely worries about: cross-show conflict,
  // W-9 on file, COI expiry. Each renders as a chip only when relevant.
  const compliance = row ? computeCompliance(row, availability) : [];

  // ── Pay split (owed vs paid) ───────────────────────────────────────────────
  const payTotal = row
    ? (row.day_rate ?? 0) + (row.travel_stipend ?? 0) + (row.per_diem ?? 0) + (row.kit_fee ?? 0)
    : 0;
  const payIsPaid = row?.payment_status === 'paid';

  // AnimatePresence needs to wrap the render path even when closed so the
  // exit animation plays. createPortal always mounts; AnimatePresence gates
  // the children on `open && row`.
  return createPortal(
    <AnimatePresence>
      {open && row && (
        <>
          {/* Invisible dismiss backdrop — no tint so the Plan tab stays readable */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
            aria-hidden
          />

          {/* Rail — right drawer on md+, bottom sheet on mobile */}
          <motion.aside
            key={row.id}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={STAGE_MEDIUM}
            className={
              isMobile
                ? 'fixed z-50 bottom-0 left-0 right-0 flex flex-col rounded-t-2xl'
                : 'fixed z-50 top-0 right-0 h-full w-full max-w-[460px] flex flex-col'
            }
            style={{
              background: 'var(--stage-surface-raised, oklch(0.18 0 0))',
              borderLeft: isMobile ? undefined : '1px solid oklch(1 0 0 / 0.08)',
              borderTop: isMobile ? '1px solid oklch(1 0 0 / 0.08)' : undefined,
              boxShadow: isMobile
                ? '0 -12px 48px oklch(0 0 0 / 0.45)'
                : '-12px 0 48px oklch(0 0 0 / 0.35)',
              maxHeight: isMobile ? '85vh' : undefined,
            }}
            data-surface="raised"
            role="dialog"
            aria-label={`${name} detail`}
          >
            {/* Mobile grab handle */}
            {isMobile && (
              <div className="flex justify-center pt-2 pb-1">
                <div
                  className="h-1 w-10 rounded-full"
                  style={{ background: 'oklch(1 0 0 / 0.18)' }}
                  aria-hidden
                />
              </div>
            )}

            <RailHeader
              row={row}
              name={name}
              role={role}
              isGhost={isGhost}
              isContractor={isContractor}
              phase={phase}
              onClose={onClose}
            />

            {/* Compliance strip — silent by design when nothing needs attention. */}
            <ComplianceStrip compliance={compliance} />

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

              {/* ── Quick actions ──────────────────────────────────── */}
              <QuickActions row={row} confirming={confirming} onConfirm={handleConfirm} />

              {/* ── Agreed ───────────────────────────────────────────
                  Planning surface — what's been committed between the PM and
                  this crew member. Call time, pay, (later) schedule and gear
                  summaries. This is what the crew sees via day sheet / portal
                  once sent. Stable, stable-looking. */}
              <AgreedSection
                primaryCallTime={row.call_time ?? null}
                primaryCallSaving={callTimeSaving}
                onPrimaryCallChange={handleCallTimeChange}
                waypoints={waypoints}
                onAddWaypoint={handleAddWaypoint}
                onUpdateWaypoint={handleUpdateWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                payTotal={payTotal}
                payIsPaid={payIsPaid}
                payExpanded={payExpanded}
                setPayExpanded={setPayExpanded}
                payDraft={payDraft}
                setPayDraft={setPayDraft}
                paySaving={paySaving}
                onSavePay={handleSavePay}
              />

              {/* ── Live ─────────────────────────────────────────────
                  Execution surface — dispatcher state the crew never sees.
                  Elevates visually on show day via the phase indicator in
                  the header; quiet pre-show. */}
              {row.confirmed_at && (
                <section className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <h3 className="stage-label flex items-center gap-1.5">
                      <ActivityIcon className="size-3 text-[var(--stage-text-tertiary)]" />
                      Live
                    </h3>
                    <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
                      Dispatcher view
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CyclableTile
                      label="Dispatch"
                      value={dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Standby'}
                      onClick={handleCycleDispatch}
                      hint="Tap to cycle"
                    />
                    <CyclableTile
                      label="Payment"
                      value={PAYMENT_LABELS[paymentStatus]}
                      onClick={handleCyclePayment}
                      hint="Tap to cycle"
                    />
                  </div>
                </section>
              )}

              {/* ── Gear ───────────────────────────────────────────── */}
              {row.entity_id && (eventId || ownedKit.length > 0) && (
                <GearSection
                  row={row}
                  eventId={eventId}
                  name={name}
                  loadingGear={loadingGear}
                  suppliedGear={suppliedGear}
                  ownedKit={ownedKit}
                  kitCompliance={kitCompliance}
                  kitPickerOpen={kitPickerOpen}
                  setKitPickerOpen={setKitPickerOpen}
                  selectedKitIds={selectedKitIds}
                  setSelectedKitIds={setSelectedKitIds}
                  toggleKitSelection={toggleKitSelection}
                  bringingFromKit={bringingFromKit}
                  onBringFromKit={handleBringFromKit}
                />
              )}

              {/* ── Schedule ───────────────────────────────────────── */}
              {eventId && row.entity_id && (
                <section className="flex flex-col gap-2">
                  <h3 className="stage-label">Schedule</h3>
                  {loadingSchedule ? (
                    <div className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" />
                      Loading cues...
                    </div>
                  ) : schedule.length === 0 ? (
                    <p className="text-sm leading-relaxed text-[var(--stage-text-tertiary)]">
                      {row.call_time
                        ? `Call time ${formatTime12h(row.call_time)}. No ROS cues assigned to ${name} yet.`
                        : 'No call time set and no ROS cues assigned yet.'}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {schedule.map((cue) => (
                        <li
                          key={cue.cue_id}
                          className="flex items-baseline gap-3 py-1 text-sm"
                        >
                          <span className="tabular-nums text-[var(--stage-text-primary)] w-12 shrink-0">
                            {cue.start_time ? formatTime12h(cue.start_time) : '—'}
                          </span>
                          <span className="text-[var(--stage-text-primary)] min-w-0">
                            {cue.title ?? 'Untitled cue'}
                          </span>
                          {cue.duration_minutes > 0 && (
                            <span className="ml-auto text-[var(--stage-text-tertiary)] tabular-nums stage-badge-text">
                              {cue.duration_minutes}m
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* ── Pinned note ─────────────────────────────────────
                  The PM's persistent note on this person for this show. Lives
                  separate from the append-only Timeline because it's the
                  "remember this about Marcus" field you edit in place, not
                  a new log entry each time. */}
              <section className="flex flex-col gap-2">
                <h3 className="stage-label">Pinned note</h3>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={handleSaveNote}
                  placeholder="e.g. Loads in from rear dock, allergic to shellfish…"
                  rows={2}
                  className="text-sm leading-relaxed px-3 py-2 outline-none focus-visible:border-[oklch(1_0_0/0.18)] resize-none"
                  style={{
                    background: 'var(--ctx-well)',
                    border: '1px solid oklch(1 0 0 / 0.06)',
                    borderRadius: 'var(--stage-radius-input, 6px)',
                    color: 'var(--stage-text-primary)',
                  }}
                />
                {noteSaving && (
                  <span className="stage-badge-text text-[var(--stage-text-tertiary)] flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Saving...
                  </span>
                )}
              </section>

              {/* ── Timeline ────────────────────────────────────────
                  Unified append-only history of everything that's happened on
                  this show for this person: day sheets, status changes, rate
                  edits, phone calls, replacements. Ordered newest-first. The
                  inline "Log call" form sits at the top as the primary new-
                  entry affordance — eliminates the old Log-a-call section. */}
              <TimelineSection
                log={log}
                loadingLog={loadingLog}
                callDraft={callDraft}
                setCallDraft={setCallDraft}
                callSaving={callSaving}
                onLogCall={handleLogCall}
              />

              {/* ── Danger zone ─────────────────────────────────────
                  Replace + Remove separated from the friendly top bar so
                  destructive actions aren't one accidental tap from a call
                  or email. Muted visual weight; confirmation on Remove. */}
              {row.entity_id && (
                <DangerZone
                  row={row}
                  sourceOrgId={sourceOrgId}
                  workspaceId={workspaceId}
                  eventDate={eventDate}
                  replacing={replacing}
                  removing={removing}
                  replacePickerOpen={replacePickerOpen}
                  setReplacePickerOpen={setReplacePickerOpen}
                  onRemove={handleRemove}
                  onReplacePick={handleReplacePick}
                />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// =============================================================================
// Backward-compat re-exports
//
// These were not exported from this module before the split, but re-exporting
// from the orchestrator keeps any future direct-import callers working without
// having to know about the sibling folder. Pure mechanical safety net.
// =============================================================================

export { CyclableTile, PayField } from './crew-detail-rail/cells';
export { TimesStack } from './crew-detail-rail/times-stack';
export { GearSection } from './crew-detail-rail/gear-section';
export { RailHeader, ComplianceStrip } from './crew-detail-rail/header';
export { AgreedSection } from './crew-detail-rail/agreed-section';
export { TimelineSection } from './crew-detail-rail/timeline-section';
export { QuickActions } from './crew-detail-rail/quick-actions';
export { DangerZone } from './crew-detail-rail/danger-zone';
export {
  computePhase,
  computeCompliance,
  formatRelative,
  nextInCycle,
  EVENT_LABELS,
  STATUS_COLORS,
  DISPATCH_ORDER,
  DISPATCH_LABELS,
  PAYMENT_ORDER,
  PAYMENT_LABELS,
  WAYPOINT_KIND_LABELS,
} from './crew-detail-rail/shared';
export type {
  DispatchStatus,
  PaymentStatus,
  Phase,
  PhaseTone,
  ComplianceChip,
  WaypointPatch,
  AddWaypointInput,
} from './crew-detail-rail/shared';
