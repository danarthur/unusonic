'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Phone,
  Mail,
  MessageSquare,
  Send,
  Loader2,
  Clock,
  Ghost,
  Briefcase,
  Wrench,
  DollarSign,
  Package,
  Check,
  Plus,
  UserRoundX,
  CheckCheck,
  Trash2,
  ChevronDown,
  AlertTriangle,
  Shield,
  CalendarClock,
  Activity as ActivityIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { formatTime12h } from '@/shared/lib/parse-time';
import { cn } from '@/shared/lib/utils';
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
import { CrewPicker } from './crew-picker';
import { TimePicker } from '@/shared/ui/time-picker';

// =============================================================================
// Event-type rendering table — keeps the activity feed copy in one place.
// =============================================================================

const EVENT_LABELS: Record<CrewCommsLogEntry['event_type'], string> = {
  day_sheet_sent: 'Day sheet sent',
  day_sheet_delivered: 'Day sheet delivered',
  day_sheet_bounced: 'Day sheet bounced',
  schedule_update_sent: 'Schedule update sent',
  schedule_update_delivered: 'Schedule update delivered',
  schedule_update_bounced: 'Schedule update bounced',
  manual_nudge_sent: 'Nudge sent',
  phone_call_logged: 'Phone call',
  note_added: 'Note',
  confirmation_received: 'Confirmed',
  decline_received: 'Declined',
  status_changed: 'Status changed',
  rate_changed: 'Rate changed',
};

const STATUS_COLORS: Record<DealCrewRow['status'], string> = {
  pending: 'oklch(1 0 0 / 0.06)',
  offered: 'oklch(0.75 0.15 240 / 0.12)',
  tentative: 'oklch(0.80 0.16 85 / 0.12)',
  confirmed: 'oklch(0.75 0.18 145 / 0.14)',
  declined: 'oklch(0.68 0.22 25 / 0.14)',
  replaced: 'oklch(1 0 0 / 0.04)',
};

const DISPATCH_ORDER = ['standby', 'en_route', 'on_site', 'wrapped'] as const;
type DispatchStatus = (typeof DISPATCH_ORDER)[number];
const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En route',
  on_site: 'On site',
  wrapped: 'Wrapped',
};

const PAYMENT_ORDER = ['pending', 'completed', 'submitted', 'approved', 'processing', 'paid'] as const;
type PaymentStatus = (typeof PAYMENT_ORDER)[number];
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  submitted: 'Submitted',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
};

function nextInCycle<T extends readonly string[]>(cycle: T, current: T[number] | null | undefined): T[number] {
  if (!current) return cycle[0];
  const idx = cycle.indexOf(current);
  return idx === -1 || idx === cycle.length - 1 ? cycle[0] : cycle[idx + 1];
}

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
            {/* Header */}
            <div
              className="flex items-start justify-between gap-3 p-4 border-b"
              style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="shrink-0 size-10 rounded-full flex items-center justify-center"
                  style={{
                    background: 'oklch(1 0 0 / 0.06)',
                    color: 'var(--stage-text-secondary)',
                  }}
                >
                  {isGhost ? <Ghost className="size-4" /> : (
                    <span className="text-sm font-medium tracking-tight">
                      {(row.first_name?.[0] ?? name[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
                      {name}
                    </span>
                    <span
                      className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                      style={{
                        background: STATUS_COLORS[row.status] ?? STATUS_COLORS.pending,
                        color: 'var(--stage-text-secondary)',
                      }}
                    >
                      {row.status}
                    </span>
                    {isContractor && (
                      <span
                        className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1"
                        style={{
                          background: 'oklch(0.80 0.16 85 / 0.12)',
                          color: 'var(--color-unusonic-warning)',
                        }}
                      >
                        <Briefcase className="size-2.5" />
                        Contractor
                      </span>
                    )}
                    {isGhost && (
                      <span
                        className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                        style={{
                          background: 'oklch(1 0 0 / 0.04)',
                          color: 'var(--stage-text-tertiary)',
                        }}
                        title="Ghost — no user account yet"
                      >
                        Ghost
                      </span>
                    )}
                  </div>
                  {role && (
                    <span className="text-sm tracking-tight text-[var(--stage-text-secondary)]">
                      {role}
                    </span>
                  )}
                  {row.call_time && (
                    <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] flex items-center gap-1 tabular-nums">
                      <Clock className="size-2.5" />
                      Call {formatTime12h(row.call_time)}
                    </span>
                  )}
                  {/* Phase indicator — tells the PM whether they're planning
                      ("T-3 days") or executing ("LIVE · Show day"). */}
                  {phase && (
                    <span
                      className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1 w-fit"
                      style={{
                        background:
                          phase.tone === 'live'
                            ? 'color-mix(in oklch, var(--color-unusonic-success) 18%, transparent)'
                            : phase.tone === 'soon'
                              ? 'color-mix(in oklch, var(--color-unusonic-warning) 14%, transparent)'
                              : 'oklch(1 0 0 / 0.04)',
                        color:
                          phase.tone === 'live'
                            ? 'var(--color-unusonic-success)'
                            : phase.tone === 'soon'
                              ? 'var(--color-unusonic-warning)'
                              : 'var(--stage-text-tertiary)',
                      }}
                    >
                      <CalendarClock className="size-2.5" />
                      {phase.label}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
                aria-label="Close"
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Compliance strip — only renders when something needs attention
                (conflict, missing W-9, expiring COI). Silent by design when
                everything's in order. */}
            {compliance.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b"
                style={{
                  background: 'color-mix(in oklch, var(--color-unusonic-warning) 4%, transparent)',
                  borderColor: 'oklch(1 0 0 / 0.06)',
                }}
              >
                {compliance.map((chip) => {
                  const Icon = chip.icon === 'conflict'
                    ? AlertTriangle
                    : chip.icon === 'shield'
                      ? Shield
                      : CalendarClock;
                  const color = chip.severity === 'error'
                    ? 'var(--color-unusonic-error)'
                    : 'var(--color-unusonic-warning)';
                  return (
                    <span
                      key={chip.key}
                      className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1"
                      style={{
                        color,
                        background: `color-mix(in oklch, ${color === 'var(--color-unusonic-error)' ? 'var(--color-unusonic-error)' : 'var(--color-unusonic-warning)'} 12%, transparent)`,
                      }}
                      title={chip.title ?? chip.label}
                    >
                      <Icon className="size-2.5" />
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

              {/* ── Quick actions ──────────────────────────────────── */}
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {row.phone && (
                    <a
                      href={`tel:${row.phone}`}
                      className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
                    >
                      <Phone className="size-3" />
                      Call
                    </a>
                  )}
                  {row.email && (
                    <a
                      href={`mailto:${row.email}`}
                      className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
                    >
                      <Mail className="size-3" />
                      Email
                    </a>
                  )}
                  {row.phone && (
                    <a
                      href={`sms:${row.phone}`}
                      className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
                    >
                      <MessageSquare className="size-3" />
                      Text
                    </a>
                  )}
                  {!row.phone && !row.email && (
                    <span className="stage-badge-text text-[var(--stage-text-tertiary)]">
                      No contact info on file.
                    </span>
                  )}
                  {/* Confirm override — only surfaces for assignees who haven't confirmed yet.
                      Stays in the friendly top bar because it's a committing action, not a
                      destructive one. */}
                  {row.entity_id && !row.confirmed_at && row.status !== 'replaced' && row.status !== 'declined' && (
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
                      title="Manually confirm this crew member"
                    >
                      {confirming ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
                      Confirm
                    </button>
                  )}
                </div>

              </section>

              {/* ── Agreed ───────────────────────────────────────────
                  Planning surface — what's been committed between the PM and
                  this crew member. Call time, pay, (later) schedule and gear
                  summaries. This is what the crew sees via day sheet / portal
                  once sent. Stable, stable-looking. */}
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="stage-label">Agreed</h3>
                  <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
                    What the crew sees
                  </span>
                </div>

                {/* Times — primary call + per-person waypoints. The primary
                    call (deal_crew.call_time) stays pinned first; waypoints
                    augment with anything else the crew needs to hit today. */}
                <TimesStack
                  primaryCallTime={row.call_time ?? null}
                  primaryCallSaving={callTimeSaving}
                  onPrimaryCallChange={handleCallTimeChange}
                  waypoints={waypoints}
                  onAddWaypoint={handleAddWaypoint}
                  onUpdateWaypoint={handleUpdateWaypoint}
                  onRemoveWaypoint={handleRemoveWaypoint}
                />

                {/* Expandable pay editor. Collapsed state shows the total; clicking
                    opens the per-field form. Auto-saves on blur via handleSavePay
                    — rate changes flow through updateCrewDispatch which writes a
                    rate_changed row to crew_comms_log. */}
                <div
                  className="flex flex-col rounded-lg"
                  style={{
                    background: 'oklch(1 0 0 / 0.03)',
                    border: '1px solid oklch(1 0 0 / 0.06)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPayExpanded((v) => !v)}
                    className="flex items-center gap-2 px-2.5 py-1.5 focus:outline-none"
                  >
                    <DollarSign className="size-3 text-[var(--stage-text-tertiary)]" />
                    <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
                      {payIsPaid ? 'Paid' : 'Owed'}
                    </span>
                    <span
                      className="ml-auto text-sm tabular-nums tracking-tight"
                      style={{
                        color: payIsPaid
                          ? 'var(--color-unusonic-success)'
                          : 'var(--stage-text-primary)',
                      }}
                    >
                      ${payTotal.toLocaleString()}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-3 text-[var(--stage-text-tertiary)] transition-transform',
                        payExpanded && 'rotate-180',
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {payExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={STAGE_MEDIUM}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="px-2.5 pb-2.5 pt-1 grid grid-cols-2 gap-2">
                          <PayField
                            label="Base"
                            value={payDraft.base}
                            onChange={(v) => setPayDraft((p) => ({ ...p, base: v }))}
                            onBlur={handleSavePay}
                          />
                          <PayField
                            label="Travel"
                            value={payDraft.travel}
                            onChange={(v) => setPayDraft((p) => ({ ...p, travel: v }))}
                            onBlur={handleSavePay}
                          />
                          <PayField
                            label="Per diem"
                            value={payDraft.diem}
                            onChange={(v) => setPayDraft((p) => ({ ...p, diem: v }))}
                            onBlur={handleSavePay}
                          />
                          <PayField
                            label="Kit fee"
                            value={payDraft.kit}
                            onChange={(v) => setPayDraft((p) => ({ ...p, kit: v }))}
                            onBlur={handleSavePay}
                          />
                        </div>
                        {paySaving && (
                          <div className="px-2.5 pb-2 flex items-center gap-1 stage-badge-text text-[var(--stage-text-tertiary)]">
                            <Loader2 className="size-3 animate-spin" />
                            Saving...
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

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
                <section className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <h3 className="stage-label">Gear</h3>
                    {kitCompliance && kitCompliance.total > 0 && (
                      <span
                        className="stage-badge-text tracking-tight tabular-nums"
                        style={{
                          color:
                            kitCompliance.matched === kitCompliance.total
                              ? 'var(--color-unusonic-success)'
                              : 'var(--stage-text-tertiary)',
                        }}
                        title={
                          kitCompliance.matched === kitCompliance.total
                            ? 'Role kit complete'
                            : `Missing: ${kitCompliance.missing.map((i) => i.name).join(', ')}`
                        }
                      >
                        {kitCompliance.matched}/{kitCompliance.total} kit items ready
                      </span>
                    )}
                  </div>

                  {loadingGear ? (
                    <div className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" />
                      Loading gear...
                    </div>
                  ) : (
                    <>
                      {/* Bringing to this show */}
                      {eventId && suppliedGear.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {suppliedGear.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-2 py-1 text-sm"
                            >
                              <Package className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" />
                              <span className="text-[var(--stage-text-primary)] min-w-0 truncate">
                                {item.name}
                                {item.quantity > 1 && (
                                  <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                                    {' '}× {item.quantity}
                                  </span>
                                )}
                              </span>
                              <span className="ml-auto flex items-center gap-2">
                                {item.kit_fee != null && (
                                  <span className="stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
                                    ${item.kit_fee.toLocaleString()}
                                  </span>
                                )}
                                <span
                                  className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                                  style={{
                                    background: 'oklch(1 0 0 / 0.04)',
                                    color: 'var(--stage-text-secondary)',
                                  }}
                                >
                                  {item.status.replace('_', ' ')}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* gear_notes freetext — from the row */}
                      {row.gear_notes && (
                        <p className="text-label leading-relaxed text-[var(--stage-text-tertiary)]">
                          <Wrench className="size-2.5 inline mr-1" />
                          {row.gear_notes}
                        </p>
                      )}

                      {/* Empty state */}
                      {eventId && suppliedGear.length === 0 && !row.gear_notes && (
                        <p className="text-sm leading-relaxed text-[var(--stage-text-tertiary)]">
                          Not bringing any gear to this show yet.
                        </p>
                      )}

                      {/* Bring from kit — picker */}
                      {eventId && ownedKit.length > 0 && (
                        <div className="mt-1">
                          {!kitPickerOpen ? (
                            <button
                              type="button"
                              onClick={() => setKitPickerOpen(true)}
                              className="stage-btn stage-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-sm"
                            >
                              <Plus className="size-3" />
                              Bring from kit ({ownedKit.filter((k) => !k.alreadyOnEvent).length} available)
                            </button>
                          ) : (
                            <div
                              className="flex flex-col gap-2 p-3 rounded-lg"
                              style={{
                                background: 'oklch(1 0 0 / 0.03)',
                                border: '1px solid oklch(1 0 0 / 0.06)',
                              }}
                            >
                              <span className="stage-label">Choose from {name}&apos;s kit</span>
                              <ul className="flex flex-col gap-1">
                                {ownedKit.map((kit) => {
                                  const selected = selectedKitIds.has(kit.equipmentId);
                                  const disabled = kit.alreadyOnEvent;
                                  return (
                                    <li key={kit.equipmentId}>
                                      <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => !disabled && toggleKitSelection(kit.equipmentId)}
                                        className="w-full flex items-center gap-2 py-1 text-left text-sm transition-colors focus:outline-none disabled:opacity-45 disabled:cursor-not-allowed"
                                        style={{
                                          color: selected
                                            ? 'var(--stage-text-primary)'
                                            : 'var(--stage-text-secondary)',
                                        }}
                                      >
                                        <span
                                          className="size-4 rounded shrink-0 flex items-center justify-center"
                                          style={{
                                            background: selected
                                              ? 'oklch(0.85 0 0)'
                                              : 'oklch(1 0 0 / 0.04)',
                                            border: '1px solid oklch(1 0 0 / 0.12)',
                                          }}
                                        >
                                          {selected && <Check className="size-3 text-[oklch(0.15_0_0)]" />}
                                        </span>
                                        <span className="min-w-0 truncate">
                                          {kit.name}
                                          {kit.quantity > 1 && (
                                            <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                                              {' '}× {kit.quantity}
                                            </span>
                                          )}
                                        </span>
                                        <span
                                          className="ml-auto stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]"
                                          title={kit.category}
                                        >
                                          {disabled ? 'Already on show' : kit.category}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                              <div className="flex justify-end gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setKitPickerOpen(false);
                                    setSelectedKitIds(new Set());
                                  }}
                                  className="stage-btn stage-btn-ghost text-sm px-2.5 py-1"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleBringFromKit}
                                  disabled={selectedKitIds.size === 0 || bringingFromKit}
                                  className="stage-btn stage-btn-primary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
                                >
                                  {bringingFromKit ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Package className="size-3" />
                                  )}
                                  Bring {selectedKitIds.size > 0 ? `${selectedKitIds.size} item${selectedKitIds.size > 1 ? 's' : ''}` : 'selected'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Kit compliance gaps (read-only display) */}
                      {kitCompliance &&
                        kitCompliance.missing.length > 0 &&
                        kitCompliance.missing.length < kitCompliance.total && (
                          <details className="mt-1">
                            <summary className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] cursor-pointer">
                              {kitCompliance.missing.length} kit item{kitCompliance.missing.length > 1 ? 's' : ''} missing for this role
                            </summary>
                            <ul className="flex flex-col gap-0.5 mt-1 pl-4">
                              {kitCompliance.missing.map((miss, i) => (
                                <li key={`${miss.name}-${i}`} className="text-label leading-relaxed text-[var(--stage-text-secondary)]">
                                  {miss.name}
                                  {miss.quantity > 1 && (
                                    <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                                      {' '}× {miss.quantity}
                                    </span>
                                  )}
                                  {miss.optional && (
                                    <span className="text-[var(--stage-text-tertiary)]"> (optional)</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                    </>
                  )}
                </section>
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
              <section className="flex flex-col gap-2">
                <h3 className="stage-label">Timeline</h3>

                {/* Inline add — Log a call. Single most common manual entry;
                    future passes can add a [+ Note] / [+ Send message] sibling. */}
                <div
                  className="flex flex-col gap-1.5 p-2 rounded-lg"
                  style={{
                    background: 'oklch(1 0 0 / 0.03)',
                    border: '1px solid oklch(1 0 0 / 0.06)',
                  }}
                >
                  <textarea
                    value={callDraft}
                    onChange={(e) => setCallDraft(e.target.value)}
                    placeholder="Log a phone call — what you spoke about"
                    rows={1}
                    className="text-sm leading-relaxed px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.18)] resize-none"
                    style={{
                      background: 'var(--ctx-well)',
                      border: '1px solid oklch(1 0 0 / 0.06)',
                      borderRadius: 'var(--stage-radius-input, 6px)',
                      color: 'var(--stage-text-primary)',
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleLogCall}
                      disabled={!callDraft.trim() || callSaving}
                      className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
                    >
                      {callSaving ? <Loader2 className="size-3 animate-spin" /> : <Phone className="size-3" />}
                      Log call
                    </button>
                  </div>
                </div>

                {loadingLog ? (
                  <div className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-2">
                    <Loader2 className="size-3 animate-spin" />
                    Loading history...
                  </div>
                ) : log.length === 0 ? (
                  <p className="text-sm leading-relaxed text-[var(--stage-text-tertiary)]">
                    No comms yet. Day sheets, status changes, rate edits, and phone calls land here.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {log.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex flex-col gap-0.5 py-1.5 border-b last:border-0"
                        style={{ borderColor: 'oklch(1 0 0 / 0.04)' }}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm tracking-tight text-[var(--stage-text-primary)]">
                            {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                          </span>
                          <span className="stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
                            {formatRelative(entry.occurred_at)}
                          </span>
                        </div>
                        {entry.summary && (
                          <span className="text-label leading-relaxed text-[var(--stage-text-secondary)]">
                            {entry.summary}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ── Danger zone ─────────────────────────────────────
                  Replace + Remove separated from the friendly top bar so
                  destructive actions aren't one accidental tap from a call
                  or email. Muted visual weight; confirmation on Remove. */}
              {row.entity_id && (
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
                      onClick={handleRemove}
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
                        onSelect={async (result) => handleReplacePick({ entity_id: result.entity_id })}
                        onClose={() => setReplacePickerOpen(false)}
                        placeholder={`Replace ${row.entity_name ?? 'this person'}\u2026`}
                        roleHint={row.role_note ?? undefined}
                        eventDate={eventDate}
                        workspaceId={workspaceId}
                      />
                    </div>
                  )}
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Cyclable status tile for the Show-day grid. Tap to advance through the
// cycle. Mirrors the pattern from the list row's dispatch button.
function CyclableTile({
  label,
  value,
  onClick,
  hint,
}: {
  label: string;
  value: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[oklch(1_0_0/0.05)] active:bg-[oklch(1_0_0/0.07)] focus:outline-none"
      style={{
        background: 'oklch(1 0 0 / 0.03)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}
      title={hint}
    >
      <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
        {label}
      </span>
      <span className="text-sm tabular-nums tracking-tight text-[var(--stage-text-primary)]">
        {value}
      </span>
    </button>
  );
}

// Small currency input for the expandable pay grid.
function PayField({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">{label}</label>
      <div className="flex items-center gap-1">
        <span className="stage-badge-text text-[var(--stage-text-tertiary)]">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="0"
          className="w-full text-sm tabular-nums px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
          style={{
            background: 'var(--ctx-well)',
            border: '1px solid oklch(1 0 0 / 0.06)',
            borderRadius: 'var(--stage-radius-input, 6px)',
            color: 'var(--stage-text-primary)',
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// TimesStack — primary call + per-person waypoints
//
// Primary call pinned at the top (deal_crew.call_time). Waypoints render
// below in sort_order. Adding or editing a waypoint uses a small inline
// form — keeps the UI self-contained inside the Agreed section.
// =============================================================================

const WAYPOINT_KIND_LABELS: Record<WaypointKind, string> = {
  truck_pickup: 'Truck pickup',
  gear_pickup: 'Gear pickup',
  depart: 'Depart',
  venue_arrival: 'Venue arrival',
  setup: 'Setup',
  set_by: 'Set by',
  doors: 'Doors',
  wrap: 'Wrap',
  custom: 'Custom',
};

function TimesStack({
  primaryCallTime,
  primaryCallSaving,
  onPrimaryCallChange,
  waypoints,
  onAddWaypoint,
  onUpdateWaypoint,
  onRemoveWaypoint,
}: {
  primaryCallTime: string | null;
  primaryCallSaving: boolean;
  onPrimaryCallChange: (value: string | null) => void;
  waypoints: CrewWaypoint[];
  onAddWaypoint: (input: {
    kind: WaypointKind;
    customLabel?: string | null;
    time: string;
    locationName?: string | null;
    locationAddress?: string | null;
    notes?: string | null;
  }) => void;
  onUpdateWaypoint: (id: string, patch: Parameters<typeof updateCrewWaypoint>[0]['patch']) => void;
  onRemoveWaypoint: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{
    kind: WaypointKind;
    customLabel: string;
    time: string;
    locationName: string;
  }>({ kind: 'venue_arrival', customLabel: '', time: '', locationName: '' });

  const resetDraft = () => setDraft({ kind: 'venue_arrival', customLabel: '', time: '', locationName: '' });

  const submitAdd = () => {
    if (!draft.time) return;
    if (draft.kind === 'custom' && !draft.customLabel.trim()) return;
    onAddWaypoint({
      kind: draft.kind,
      customLabel: draft.kind === 'custom' ? draft.customLabel.trim() : null,
      time: draft.time,
      locationName: draft.locationName.trim() || null,
    });
    resetDraft();
    setAddOpen(false);
  };

  return (
    <div
      className="flex flex-col rounded-lg"
      style={{
        background: 'oklch(1 0 0 / 0.03)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}
    >
      {/* Primary call row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Clock className="size-3 text-[var(--stage-text-tertiary)]" />
        <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
          Primary call
        </span>
        {primaryCallSaving && (
          <Loader2 className="size-3 animate-spin text-[var(--stage-text-tertiary)]" />
        )}
        <div className="ml-auto w-28">
          <TimePicker
            value={primaryCallTime}
            onChange={onPrimaryCallChange}
            placeholder="Set time"
            variant="ghost"
          />
        </div>
      </div>

      {/* Waypoints */}
      {waypoints.length > 0 && (
        <div
          className="border-t flex flex-col"
          style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}
        >
          {waypoints.map((wp) => (
            <WaypointRow
              key={wp.id}
              waypoint={wp}
              onUpdate={onUpdateWaypoint}
              onRemove={onRemoveWaypoint}
            />
          ))}
        </div>
      )}

      {/* Add waypoint */}
      <div
        className="border-t"
        style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}
      >
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          >
            <Plus className="size-3" />
            Add waypoint
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-2.5">
            <div className="flex items-center gap-2">
              <select
                value={draft.kind}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as WaypointKind }))}
                className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
                style={{
                  background: 'var(--ctx-well)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  borderRadius: 'var(--stage-radius-input, 6px)',
                  color: 'var(--stage-text-primary)',
                }}
              >
                {(Object.keys(WAYPOINT_KIND_LABELS) as WaypointKind[]).map((k) => (
                  <option key={k} value={k}>{WAYPOINT_KIND_LABELS[k]}</option>
                ))}
              </select>
              <div className="w-28">
                <TimePicker
                  value={draft.time || null}
                  onChange={(v) => setDraft((d) => ({ ...d, time: v ?? '' }))}
                  placeholder="Time"
                  variant="ghost"
                />
              </div>
            </div>
            {draft.kind === 'custom' && (
              <input
                type="text"
                value={draft.customLabel}
                onChange={(e) => setDraft((d) => ({ ...d, customLabel: e.target.value }))}
                placeholder="Label (e.g. Meet with client)"
                className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
                style={{
                  background: 'var(--ctx-well)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  borderRadius: 'var(--stage-radius-input, 6px)',
                  color: 'var(--stage-text-primary)',
                }}
              />
            )}
            <input
              type="text"
              value={draft.locationName}
              onChange={(e) => setDraft((d) => ({ ...d, locationName: e.target.value }))}
              placeholder="Location (optional)"
              className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
              style={{
                background: 'var(--ctx-well)',
                border: '1px solid oklch(1 0 0 / 0.06)',
                borderRadius: 'var(--stage-radius-input, 6px)',
                color: 'var(--stage-text-primary)',
              }}
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => { resetDraft(); setAddOpen(false); }}
                className="stage-btn stage-btn-ghost text-sm px-2.5 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={!draft.time || (draft.kind === 'custom' && !draft.customLabel.trim())}
                className="stage-btn stage-btn-primary text-sm px-2.5 py-1 disabled:opacity-45 disabled:pointer-events-none"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WaypointRow({
  waypoint,
  onUpdate,
  onRemove,
}: {
  waypoint: CrewWaypoint;
  onUpdate: (id: string, patch: Parameters<typeof updateCrewWaypoint>[0]['patch']) => void;
  onRemove: (id: string) => void;
}) {
  const label = waypoint.kind === 'custom' && waypoint.custom_label
    ? waypoint.custom_label
    : WAYPOINT_KIND_LABELS[waypoint.kind];

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 group">
      <span
        className="stage-badge-text tracking-tight text-[var(--stage-text-secondary)] min-w-[6.5rem]"
        title={waypoint.notes ?? undefined}
      >
        {label}
      </span>
      <div className="w-24">
        <TimePicker
          value={waypoint.time}
          onChange={(v) => {
            if (v) onUpdate(waypoint.id, { time: v });
          }}
          variant="ghost"
        />
      </div>
      {waypoint.location_name && (
        <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] min-w-0 truncate">
          {waypoint.location_name}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(waypoint.id)}
        className="ml-auto p-1 text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-unusonic-error)]/60 transition-opacity focus:opacity-100"
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        aria-label="Remove waypoint"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// =============================================================================
// Phase indicator — "how far out is this show from right now?"
//
// Pre-show (> 24h out): "T-3 days" / "Tomorrow"
// Near show (call time today): "2h to call" / "30m to call"
// Show day (past call time, before wrap): "LIVE"
// Wrapped / past: "Wrapped"
//
// callTime is HH:MM (24h, no date). eventStartsAt is the event's starts_at
// timestamp. We use eventStartsAt for the date portion and callTime to
// override time-of-day when present.
// =============================================================================

type PhaseTone = 'idle' | 'soon' | 'live' | 'past';
type Phase = { label: string; tone: PhaseTone };

function computePhase(
  callTime: string | null,
  eventStartsAt: string | null,
  nowTs: number,
): Phase | null {
  if (!eventStartsAt) return null;
  const event = new Date(eventStartsAt);
  if (Number.isNaN(event.getTime())) return null;

  // If we have a per-person call time, override the event's time-of-day.
  let callMoment = event;
  if (callTime && /^\d{1,2}:\d{2}/.test(callTime)) {
    const [hh, mm] = callTime.split(':').map((s) => parseInt(s, 10));
    const base = new Date(event);
    base.setHours(hh, mm, 0, 0);
    callMoment = base;
  }

  const deltaMs = callMoment.getTime() - nowTs;
  const deltaMin = Math.round(deltaMs / 60_000);
  const deltaHr = Math.round(deltaMin / 60);
  const deltaDay = Math.round(deltaHr / 24);

  // Event ended >12h ago → wrapped
  if (deltaMs < -12 * 3600_000) return { label: 'Wrapped', tone: 'past' };
  // Within call-time window but past it → live
  if (deltaMs <= 0) return { label: 'LIVE · Show day', tone: 'live' };
  // Within 4 hours of call → soon
  if (deltaMin < 60) return { label: `${deltaMin}m to call`, tone: 'soon' };
  if (deltaHr < 4) return { label: `${deltaHr}h to call`, tone: 'soon' };
  // Today
  if (deltaHr < 24) return { label: 'Show day', tone: 'soon' };
  // Tomorrow
  if (deltaDay === 1) return { label: 'Tomorrow', tone: 'idle' };
  // Further out
  return { label: `T-${deltaDay} days`, tone: 'idle' };
}

// =============================================================================
// Compliance strip — the header's "risk at a glance" summary.
// Returns only the chips that actually matter (conflict, missing W-9, expiring
// COI). Silence when everything checks out — don't decorate green.
// =============================================================================

type ComplianceChip = {
  key: string;
  label: string;
  severity: 'warning' | 'error' | 'info';
  icon: 'conflict' | 'shield' | 'calendar';
  title?: string;
};

function computeCompliance(
  row: DealCrewRow,
  availability: CrewAvailabilityResult | null,
): ComplianceChip[] {
  const chips: ComplianceChip[] = [];

  // Cross-show conflict — only for 'booked' or 'held' elsewhere on this date.
  if (availability && availability.conflicts.length > 0 && availability.status !== 'available') {
    const count = availability.conflicts.length;
    chips.push({
      key: 'conflict',
      label: count === 1 ? `1 conflict · ${availability.conflicts[0].label}` : `${count} conflicts`,
      severity: availability.status === 'booked' ? 'error' : 'warning',
      icon: 'conflict',
      title: availability.conflicts.map((c) => c.label).join(' · '),
    });
  }

  // W-9 status — only flag when missing (freelancer/contractor context)
  if (row.employment_status === 'external_contractor' && !row.w9_status) {
    chips.push({
      key: 'w9',
      label: 'No W-9',
      severity: 'warning',
      icon: 'shield',
      title: 'Contractor has no W-9 on file',
    });
  }

  // COI expiry — warn at ≤ 30 days, error if expired.
  if (row.coi_expiry) {
    const expiry = new Date(row.coi_expiry);
    if (!Number.isNaN(expiry.getTime())) {
      const daysLeft = Math.round((expiry.getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        chips.push({
          key: 'coi',
          label: 'COI expired',
          severity: 'error',
          icon: 'calendar',
          title: `COI expired ${Math.abs(daysLeft)} days ago`,
        });
      } else if (daysLeft <= 30) {
        chips.push({
          key: 'coi',
          label: `COI ${daysLeft}d`,
          severity: 'warning',
          icon: 'calendar',
          title: `COI expires in ${daysLeft} days (${row.coi_expiry})`,
        });
      }
    }
  }

  return chips;
}

// Compact relative-time formatter for the activity feed.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
