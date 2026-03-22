'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Calendar,
  MapPin,
  Clock,
  Car,
  Truck,
  Package,
  ChevronDown,
  ExternalLink,
  Pencil,
  Check,
  X as XIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../actions/update-flight-check-status';
import { updateCallTimeSlots } from '../actions/update-call-time-slots';
import { updateEventDates } from '../actions/update-event-dates';
import { updateEventVenue } from '../actions/update-event-venue';
import { updateEventCommand } from '@/features/event-dashboard';
import { getVenueSuggestions, type VenueSuggestion } from '../actions/lookup';
import { normalizeLogistics } from './flight-checks/types';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { CallTimeSlot, TransportMode, TransportStatus } from '@/entities/event/api/get-event-summary';

const CALL_TIME_BUFFER_HOURS = 2;

/** Status flow for Personal Vehicle and Company Van. */
const VAN_STATUS_FLOW: TransportStatus[] = [
  'pending',
  'loading',
  'dispatched',
  'on_site',
  'returning',
  'complete',
];

/** Status flow for Rental Truck (rental-specific checkpoints). */
const RENTAL_STATUS_FLOW: TransportStatus[] = [
  'pending_rental',
  'truck_picked_up',
  'loading',
  'dispatched',
  'on_site',
  'returning',
  'truck_returned',
];

const TRANSPORT_MODE_OPTIONS: { value: TransportMode; label: string }[] = [
  { value: 'personal_vehicle', label: 'Personal' },
  { value: 'company_van', label: 'Company' },
  { value: 'rental_truck', label: 'Rental' },
];

function getStatusFlow(mode: TransportMode): TransportStatus[] {
  return mode === 'rental_truck' ? RENTAL_STATUS_FLOW : VAN_STATUS_FLOW;
}

function getFirstStatusForMode(mode: TransportMode): TransportStatus {
  return getStatusFlow(mode)[0];
}

const TRANSPORT_STATUS_LABELS: Record<TransportStatus, string> = {
  pending: 'Pending',
  loading: 'Loading',
  dispatched: 'Dispatched',
  on_site: 'On Site',
  returning: 'Returning',
  complete: 'Complete',
  pending_rental: 'Pending Rental',
  truck_picked_up: 'Truck Picked Up',
  truck_returned: 'Truck Returned',
};

const TRANSPORT_STATUS_STYLES: Record<
  TransportStatus,
  { bg: string; border: string; text: string }
> = {
  pending: {
    bg: 'bg-white/5',
    border: 'border-white/10',
    text: 'text-ink-muted',
  },
  pending_rental: {
    bg: 'bg-white/5',
    border: 'border-white/10',
    text: 'text-ink-muted',
  },
  truck_picked_up: {
    bg: 'bg-[var(--color-neon-amber)]/10',
    border: 'border-[var(--color-neon-amber)]/40',
    text: 'text-[var(--color-neon-amber)]',
  },
  loading: {
    bg: 'bg-[var(--color-signal-warning)]/10',
    border: 'border-[var(--color-signal-warning)]/40',
    text: 'text-[var(--color-signal-warning)]',
  },
  dispatched: {
    bg: 'bg-[var(--color-signal-info)]/10',
    border: 'border-[var(--color-signal-info)]/40',
    text: 'text-[var(--color-signal-info)]',
  },
  on_site: {
    bg: 'bg-[var(--color-signal-success)]/10',
    border: 'border-[var(--color-signal-success)]/40',
    text: 'text-[var(--color-signal-success)]',
  },
  returning: {
    bg: 'bg-[var(--color-neon-blue)]/10',
    border: 'border-[var(--color-neon-blue)]/40',
    text: 'text-[var(--color-neon-blue)]',
  },
  complete: {
    bg: 'bg-[var(--color-signal-success)]/10',
    border: 'border-[var(--color-signal-success)]/40',
    text: 'text-[var(--color-signal-success)]',
  },
  truck_returned: {
    bg: 'bg-[var(--color-signal-success)]/10',
    border: 'border-[var(--color-signal-success)]/40',
    text: 'text-[var(--color-signal-success)]',
  },
};

function getDefaultCallTime(startsAt: string | null): string {
  if (!startsAt) return 'TBD';
  const d = new Date(startsAt);
  d.setHours(d.getHours() - CALL_TIME_BUFFER_HOURS);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCallTimeDisplay(
  startsAt: string | null,
  callTimeOverride: string | null | undefined
): string {
  if (callTimeOverride) {
    return new Date(callTimeOverride).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return getDefaultCallTime(startsAt);
}

function getCallTimeOffset(
  startsAt: string | null,
  callTimeOverride: string | null | undefined
): string | null {
  if (!startsAt) return null;
  const showMs = new Date(startsAt).getTime();
  const callMs = callTimeOverride
    ? new Date(callTimeOverride).getTime()
    : showMs - CALL_TIME_BUFFER_HOURS * 60 * 60 * 1000;
  const diffMs = showMs - callMs;
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours === 0) return `${mins}m before show`;
  if (mins === 0) return `${hours}h before show`;
  return `${hours}h ${mins}m before show`;
}

function googleMapsUrl(address: string): string {
  if (!address || address === '—') return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function formatEventDateTime(startsAt: string | null, endsAt: string | null): {
  date: string;
  startTime: string;
  endTime: string | null;
  multiDay: boolean;
} {
  if (!startsAt) {
    return { date: 'TBD', startTime: '', endTime: null, multiDay: false };
  }
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  const multiDay =
    end != null &&
    (end.getDate() !== start.getDate() ||
      end.getMonth() !== start.getMonth() ||
      end.getFullYear() !== start.getFullYear());

  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = end
    ? end.toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        // Show the date on the end time only if the event crosses into another day
        ...(multiDay ? { month: 'short', day: 'numeric' } : {}),
      })
    : null;

  return { date, startTime, endTime, multiDay };
}

function toDatePart(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimePart(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateAndTime(datePart: string, timePart: string): string {
  return new Date(`${datePart}T${timePart}`).toISOString();
}

/** Resolve effective transport mode and status from run_of_show_data (with legacy truck_status fallback). */
function resolveTransport(
  runOfShowData: EventSummaryForPrism['run_of_show_data'],
  logistics: Record<string, unknown>
): { mode: TransportMode; status: TransportStatus } {
  const mode = (runOfShowData?.transport_mode ?? 'company_van') as TransportMode;
  const flow = getStatusFlow(mode);
  const raw = runOfShowData?.transport_status ?? logistics.truck_status ?? null;
  const validStatus = raw && flow.includes(raw as TransportStatus) ? (raw as TransportStatus) : flow[0];
  return { mode, status: validStatus };
}

const MODE_ICONS = {
  personal_vehicle: Car,
  company_van: Truck,
  rental_truck: Package,
} as const;

type TransportLogisticsCardProps = {
  eventId: string;
  runOfShowData: EventSummaryForPrism['run_of_show_data'];
  onUpdated: () => void;
};

function TransportLogisticsCard({
  eventId,
  runOfShowData,
  onUpdated,
}: TransportLogisticsCardProps) {
  const logistics = normalizeLogistics(runOfShowData);
  const { mode: initialMode, status: initialStatus } = resolveTransport(runOfShowData, logistics);

  const [optimisticMode, setOptimisticMode] = useState<TransportMode | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<TransportStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);

  const displayMode = optimisticMode ?? initialMode;
  const flow = getStatusFlow(displayMode);
  const displayStatus = optimisticStatus ?? initialStatus;
  const style = TRANSPORT_STATUS_STYLES[displayStatus];
  const ModeIcon = MODE_ICONS[displayMode];

  const cycleStatus = useCallback(async () => {
    const idx = flow.indexOf(displayStatus);
    const nextIdx = (idx + 1) % flow.length;
    const next = flow[nextIdx];
    setOptimisticStatus(next);
    setUpdating(true);
    const result = await updateFlightCheckStatus(eventId, {
      transport_status: next,
    });
    setUpdating(false);
    setOptimisticStatus(null);
    if (result.success) {
      onUpdated();
    } else {
      toast.error(result.error ?? 'Failed to update transport status.');
    }
  }, [eventId, displayStatus, flow, onUpdated]);

  const setMode = useCallback(
    async (newMode: TransportMode) => {
      setModeOpen(false);
      if (newMode === displayMode) return;
      const firstStatus = getFirstStatusForMode(newMode);
      setOptimisticMode(newMode);
      setOptimisticStatus(firstStatus);
      setUpdating(true);
      const result = await updateFlightCheckStatus(eventId, {
        transport_mode: newMode,
        transport_status: firstStatus,
      });
      setUpdating(false);
      setOptimisticMode(null);
      setOptimisticStatus(null);
      if (result.success) {
        onUpdated();
      } else {
        toast.error(result.error ?? 'Failed to update transport mode.');
      }
    },
    [eventId, displayMode, onUpdated]
  );

  return (
    <motion.div
      layout
      transition={UNUSONIC_PHYSICS}
      className={`rounded-[28px] border ${style.border} ${style.bg} transition-colors`}
    >
      <LiquidPanel className="p-6 sm:p-7 rounded-[28px] flex flex-col gap-5 min-h-[130px]">
        <div className="flex items-center gap-4">
          <ModeIcon
            size={22}
            className={`shrink-0 ${style.text}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/80 mb-2">
              Transport
            </p>
            <Popover open={modeOpen} onOpenChange={setModeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-ceramic font-medium tracking-tight leading-snug hover:text-[var(--color-neon-blue)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded disabled:opacity-60"
                >
                  {TRANSPORT_MODE_OPTIONS.find((o) => o.value === displayMode)?.label ?? displayMode}
                  <ChevronDown size={14} className="opacity-70" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1">
                {TRANSPORT_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-ceramic hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <button
          type="button"
          onClick={updating ? undefined : cycleStatus}
          disabled={updating}
          className="mt-3 flex items-center justify-between gap-3 w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 text-left"
        >
          <motion.span
            key={displayStatus}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={UNUSONIC_PHYSICS}
            className={`font-medium tracking-tight text-base truncate ${style.text}`}
          >
            {updating ? '…' : TRANSPORT_STATUS_LABELS[displayStatus]}
          </motion.span>
          <span className="text-xs text-ink-muted/70 shrink-0">Next</span>
        </button>
      </LiquidPanel>
    </motion.div>
  );
}

// ─── DateFieldRow ─────────────────────────────────────────────────────────────

type DateFieldRowProps = {
  inputType: 'date' | 'time';
  prefix?: string;
  display: string;
  isEditing: boolean;
  value: string;
  saving: boolean;
  className?: string;
  onChange: (v: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onCancel: () => void;
};

function DateFieldRow({
  inputType, prefix, display, isEditing, value, saving, className = '',
  onChange, onOpen, onSave, onCancel,
}: DateFieldRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when focus leaves this row entirely (e.g. clicking outside)
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    onCancel();
  };

  return (
    // group is on the outer div so hover applies to the whole row
    <div
      ref={containerRef}
      className="group flex items-center gap-1.5 min-w-0"
      onBlur={isEditing ? handleBlur : undefined}
    >
      {prefix && (
        <span className="text-[10px] font-mono text-ink-muted/50 uppercase tracking-wider shrink-0 leading-none mt-px select-none">
          {prefix}
        </span>
      )}
      {isEditing ? (
        <>
          <input
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onSave(); }
              if (e.key === 'Escape') onCancel();
            }}
            autoFocus
            className="min-w-0 flex-1 bg-white/5 border border-white/15 rounded-md px-1.5 py-0.5 text-ceramic text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          {/* onMouseDown prevent keeps input focused so the click event fires */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSave}
            disabled={saving}
            aria-label="Save"
            className="shrink-0 p-0.5 rounded text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 transition-colors"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            aria-label="Cancel"
            className="shrink-0 p-0.5 rounded text-ink-muted hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
          >
            <XIcon size={13} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={`flex items-center gap-1.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded ${className}`}
        >
          <span className="text-sm text-ceramic group-hover:text-[var(--color-neon-blue)] transition-colors truncate">
            {display}
          </span>
          <Pencil
            size={11}
            className="shrink-0 text-ink-muted opacity-0 group-hover:opacity-50 transition-opacity"
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}

// ─── CallTimesCard ────────────────────────────────────────────────────────────

const DEFAULT_SLOT_TEMPLATES = [
  { id: 'load_in', label: 'Load-in', offsetHours: -4 },
  { id: 'av', label: 'AV / Production', offsetHours: -2 },
  { id: 'doors', label: 'Doors', offsetHours: -0.5 },
];

function makeDefaultSlots(startsAt: string): CallTimeSlot[] {
  const base = new Date(startsAt).getTime();
  return DEFAULT_SLOT_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    time: new Date(base + t.offsetHours * 60 * 60 * 1000).toISOString(),
  }));
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDatetimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

type CallTimesCardProps = {
  eventId: string;
  runOfShowData: EventSummaryForPrism['run_of_show_data'];
  startsAt: string | null;
  onUpdated: () => void;
};

function CallTimesCard({ eventId, runOfShowData, startsAt, onUpdated }: CallTimesCardProps) {
  const rawSlots = (runOfShowData?.call_time_slots ?? null) as CallTimeSlot[] | null;
  const legacyOverride = runOfShowData?.call_time_override ?? null;

  const [slots, setSlots] = useState<CallTimeSlot[]>(rawSlots ?? []);
  const [saving, setSaving] = useState(false);
  // editing: 'new' = new row being entered, or slot id = that row in edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editTime, setEditTime] = useState('');

  const openEdit = (slot: CallTimeSlot) => {
    setEditingId(slot.id);
    setEditLabel(slot.label);
    setEditTime(toDatetimeLocal(slot.time));
  };

  const openNew = () => {
    const defaultTime = startsAt
      ? new Date(new Date(startsAt).getTime() - 2 * 60 * 60 * 1000).toISOString().slice(0, 16)
      : '';
    setEditingId('new');
    setEditLabel('');
    setEditTime(defaultTime);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel('');
    setEditTime('');
  };

  const saveEdit = async () => {
    if (!editLabel.trim() || !editTime) return;
    const isoTime = new Date(editTime).toISOString();
    let next: CallTimeSlot[];
    if (editingId === 'new') {
      const newId = editLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      // Dedupe id
      const id = slots.some((s) => s.id === newId) ? `${newId}_${Date.now()}` : newId;
      next = [...slots, { id, label: editLabel.trim(), time: isoTime }];
    } else {
      next = slots.map((s) => s.id === editingId ? { ...s, label: editLabel.trim(), time: isoTime } : s);
    }
    setSlots(next);
    cancelEdit();
    setSaving(true);
    const result = await updateCallTimeSlots(eventId, next);
    setSaving(false);
    if (result.success) onUpdated();
  };

  const deleteSlot = async (id: string) => {
    const next = slots.filter((s) => s.id !== id);
    setSlots(next);
    setSaving(true);
    const result = await updateCallTimeSlots(eventId, next);
    setSaving(false);
    if (result.success) onUpdated();
  };

  const addDefaults = async () => {
    if (!startsAt) return;
    const next = makeDefaultSlots(startsAt);
    setSlots(next);
    setSaving(true);
    const result = await updateCallTimeSlots(eventId, next);
    setSaving(false);
    if (result.success) onUpdated();
  };

  // Keep local state in sync when data reloads
  const prevRaw = useRef(rawSlots);
  if (prevRaw.current !== rawSlots) {
    prevRaw.current = rawSlots;
    setSlots(rawSlots ?? []);
  }

  const hasSlots = slots.length > 0;

  return (
    <LiquidPanel className="p-6 sm:p-7 rounded-[28px] flex flex-col gap-5 min-h-[130px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="shrink-0 text-ink-muted/70" aria-hidden />
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/80">
            Call times
          </p>
          {saving && (
            <span className="text-[10px] text-ink-muted/50">saving…</span>
          )}
        </div>
        {hasSlots && (
          <button
            type="button"
            onClick={openNew}
            disabled={editingId !== null}
            className="p-1 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
            title="Add slot"
          >
            <Plus size={14} aria-hidden />
          </button>
        )}
      </div>

      {hasSlots ? (
        <div className="flex flex-col gap-2">
          {slots.map((slot) =>
            editingId === slot.id ? (
              <div key={slot.id} className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Slot label (e.g. Load-in)"
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <div className="flex gap-1.5 items-center">
                  <input
                    type="datetime-local"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10 focus:outline-none disabled:opacity-50 transition-colors">
                    <Check size={14} />
                  </button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-ink-muted hover:bg-white/5 focus:outline-none transition-colors">
                    <XIcon size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div key={slot.id} className="group flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-ink-muted/60 uppercase tracking-wider leading-none">{slot.label}</p>
                  <p className="text-sm text-ceramic font-medium tracking-tight mt-0.5">{formatSlotTime(slot.time)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    disabled={editingId !== null}
                    className="p-1 rounded text-ink-muted hover:text-ceramic hover:bg-white/5 focus:outline-none disabled:opacity-40 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={11} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSlot(slot.id)}
                    disabled={saving || editingId !== null}
                    className="p-1 rounded text-ink-muted hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 focus:outline-none disabled:opacity-40 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                </div>
              </div>
            )
          )}
          {editingId === 'new' && (
            <div className="flex flex-col gap-1.5 mt-1">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Slot label (e.g. Soundcheck)"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <div className="flex gap-1.5 items-center">
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10 focus:outline-none disabled:opacity-50 transition-colors">
                  <Check size={14} />
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-ink-muted hover:bg-white/5 focus:outline-none transition-colors">
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty state — no slots configured yet */
        <div className="flex flex-col gap-3 flex-1">
          {legacyOverride ? (
            <div>
              <p className="text-ceramic font-medium tracking-tight leading-snug">
                {getCallTimeDisplay(startsAt, legacyOverride)}
              </p>
              <p className="text-xs text-ink-muted/60 mt-0.5">
                {getCallTimeOffset(startsAt, legacyOverride) ?? 'Single call time'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-ceramic font-medium tracking-tight leading-snug">
                {getCallTimeDisplay(startsAt, null)}
              </p>
              <p className="text-xs text-ink-muted/60 mt-0.5">
                Auto · {getCallTimeOffset(startsAt, null) ?? '—'}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {startsAt && (
              <button
                type="button"
                onClick={addDefaults}
                disabled={saving}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium tracking-tight text-ceramic border border-white/10 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 transition-colors"
              >
                <Plus size={12} aria-hidden />
                Add slots
              </button>
            )}
            <button
              type="button"
              onClick={openNew}
              disabled={saving}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium tracking-tight text-ink-muted border border-white/10 hover:bg-white/5 hover:text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 transition-colors"
            >
              Custom slot
            </button>
          </div>
          {editingId === 'new' && (
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Slot label (e.g. Load-in)"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <div className="flex gap-1.5 items-center">
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10 focus:outline-none disabled:opacity-50 transition-colors">
                  <Check size={14} />
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-ink-muted hover:bg-white/5 focus:outline-none transition-colors">
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </LiquidPanel>
  );
}

// ─── PlanVitalsRow ────────────────────────────────────────────────────────────

type PlanVitalsRowProps = {
  eventId: string;
  event: EventSummaryForPrism;
  datesLoadIn?: string | null;
  datesLoadOut?: string | null;
  onEventUpdated?: () => void;
};

export function PlanVitalsRow({
  eventId,
  event,
  datesLoadIn,
  datesLoadOut,
  onEventUpdated,
}: PlanVitalsRowProps) {
  const runOfShowData = event.run_of_show_data ?? null;
  const logistics = normalizeLogistics(runOfShowData);

  const venueEntityId = event.venue_entity_id ?? null;
  const locationName =
    event.venue_name ?? event.location_name ?? null;
  const locationAddress =
    event.venue_address ?? event.location_address ?? event.location_name ?? '';
  const hasAddress = Boolean(
    locationAddress && locationAddress !== '—' && locationAddress.trim()
  );

  // Location card — venue search state
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<'view' | 'search'>('view');
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const venueSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVenueQueryChange = useCallback((q: string) => {
    setVenueQuery(q);
    if (venueSearchRef.current) clearTimeout(venueSearchRef.current);
    venueSearchRef.current = setTimeout(async () => {
      if (!q.trim()) { setVenueResults([]); return; }
      setVenueSearching(true);
      const results = await getVenueSuggestions(q);
      setVenueSearching(false);
      setVenueResults(results);
    }, 200);
  }, []);

  const selectVenue = useCallback(async (venueId: string) => {
    setSavingVenue(true);
    const result = await updateEventVenue(eventId, venueId);
    setSavingVenue(false);
    if (result.success) {
      setLocationOpen(false);
      setLocationMode('view');
      setVenueQuery('');
      setVenueResults([]);
      onEventUpdated?.();
    }
  }, [eventId, onEventUpdated]);

  const clearVenue = useCallback(async () => {
    setSavingVenue(true);
    const result = await updateEventVenue(eventId, null);
    setSavingVenue(false);
    if (result.success) {
      setLocationOpen(false);
      setLocationMode('view');
      onEventUpdated?.();
    }
  }, [eventId, onEventUpdated]);

  const openLocationSearch = useCallback(() => {
    setLocationMode('search');
    setVenueQuery('');
    setVenueResults([]);
  }, []);

  const dateTime = formatEventDateTime(
    event.starts_at ?? null,
    event.ends_at ?? null
  );

  type DateField = 'date' | 'startTime' | 'endTime';
  const [editingField, setEditingField] = useState<DateField | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const openField = useCallback((field: DateField) => {
    let val = '';
    if (field === 'date')       val = event.starts_at ? toDatePart(event.starts_at) : '';
    if (field === 'startTime')  val = event.starts_at ? toTimePart(event.starts_at) : '';
    if (field === 'endTime')    val = event.ends_at   ? toTimePart(event.ends_at)   : '';
    setFieldValue(val);
    setEditingField(field);
    setFieldError(null);
  }, [event.starts_at, event.ends_at]);

  const saveField = useCallback(async () => {
    if (!editingField || !event.starts_at) return;
    let newStartsAt = event.starts_at;
    let newEndsAt   = event.ends_at ?? null;

    if (editingField === 'date' && fieldValue) {
      newStartsAt = combineDateAndTime(fieldValue, toTimePart(event.starts_at));
      if (event.ends_at) newEndsAt = combineDateAndTime(fieldValue, toTimePart(event.ends_at));
    } else if (editingField === 'startTime' && fieldValue) {
      newStartsAt = combineDateAndTime(toDatePart(event.starts_at), fieldValue);
    } else if (editingField === 'endTime') {
      newEndsAt = fieldValue
        ? combineDateAndTime(event.ends_at ? toDatePart(event.ends_at) : toDatePart(event.starts_at), fieldValue)
        : null;
    }

    setSavingField(true);
    const result = await updateEventDates(eventId, newStartsAt, newEndsAt);
    setSavingField(false);
    if (!result.success) { setFieldError(result.error); return; }
    setEditingField(null);
    onEventUpdated?.();
  }, [editingField, fieldValue, event.starts_at, event.ends_at, eventId, onEventUpdated]);

  const cancelField = useCallback(() => {
    setEditingField(null);
    setFieldError(null);
  }, []);

  // Load-in / Load-out — separate datetime-local fields
  const [editingLoadField, setEditingLoadField] = useState<'loadIn' | 'loadOut' | null>(null);
  const [loadFieldValue, setLoadFieldValue] = useState('');
  const [savingLoadField, setSavingLoadField] = useState(false);
  const [loadFieldError, setLoadFieldError] = useState<string | null>(null);

  const openLoadField = useCallback((field: 'loadIn' | 'loadOut') => {
    const iso = field === 'loadIn' ? datesLoadIn : datesLoadOut;
    setLoadFieldValue(iso ? iso.slice(0, 16) : '');
    setEditingLoadField(field);
    setLoadFieldError(null);
  }, [datesLoadIn, datesLoadOut]);

  const saveLoadField = useCallback(async () => {
    if (!editingLoadField) return;
    const iso = loadFieldValue ? new Date(loadFieldValue).toISOString() : null;
    setSavingLoadField(true);
    const result = await updateEventCommand(eventId, {
      dates_load_in: editingLoadField === 'loadIn' ? iso : (datesLoadIn ?? null),
      dates_load_out: editingLoadField === 'loadOut' ? iso : (datesLoadOut ?? null),
    });
    setSavingLoadField(false);
    if (!result.ok) { setLoadFieldError(result.error); return; }
    setEditingLoadField(null);
    onEventUpdated?.();
  }, [editingLoadField, loadFieldValue, datesLoadIn, datesLoadOut, eventId, onEventUpdated]);

  const cancelLoadField = useCallback(() => {
    setEditingLoadField(null);
    setLoadFieldError(null);
  }, []);

  // Legacy single-override kept for backward compat (CallTimesCard handles the new slot system)

  return (
    <>
      {/* Event Date/Time — each field independently editable */}
      <LiquidPanel className="p-6 sm:p-7 rounded-[28px] flex flex-col gap-6 min-h-[200px]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="shrink-0 text-ink-muted/70" aria-hidden />
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/80">
            Event date / time
          </p>
        </div>
        {/* Values — stacked vertically so date and times don't get cut off */}
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <DateFieldRow
            inputType="date"
            display={dateTime.date || 'Set date'}
            isEditing={editingField === 'date'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('date')}
            onSave={saveField}
            onCancel={cancelField}
            className="font-medium"
          />
          <DateFieldRow
            inputType="time"
            prefix="Start"
            display={dateTime.startTime || '—'}
            isEditing={editingField === 'startTime'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('startTime')}
            onSave={saveField}
            onCancel={cancelField}
          />
          <DateFieldRow
            inputType="time"
            prefix="End"
            display={dateTime.endTime ?? '—'}
            isEditing={editingField === 'endTime'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('endTime')}
            onSave={saveField}
            onCancel={cancelField}
          />
          {dateTime.multiDay && (
            <span className="inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-signal-warning)]/15 text-[var(--color-signal-warning)]">
              Multi-day
            </span>
          )}
          {fieldError && (
            <p className="text-[10px] text-[var(--color-unusonic-error)]">{fieldError}</p>
          )}
          <div className="border-t border-white/5 pt-3 flex flex-col gap-3">
            {(['loadIn', 'loadOut'] as const).map((field) => {
              const iso = field === 'loadIn' ? datesLoadIn : datesLoadOut;
              const label = field === 'loadIn' ? 'Load-in' : 'Load-out';
              const display = iso
                ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : '—';
              const isEditing = editingLoadField === field;
              return (
                <div key={field} className="group flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-mono text-ink-muted/50 uppercase tracking-wider shrink-0 leading-none mt-px select-none">
                    {label}
                  </span>
                  {isEditing ? (
                    <>
                      <input
                        type="datetime-local"
                        value={loadFieldValue}
                        onChange={(e) => setLoadFieldValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveLoadField(); }
                          if (e.key === 'Escape') cancelLoadField();
                        }}
                        autoFocus
                        className="min-w-0 flex-1 bg-white/5 border border-white/15 rounded-md px-1.5 py-0.5 text-ceramic text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={saveLoadField}
                        disabled={savingLoadField}
                        aria-label="Save"
                        className="shrink-0 p-0.5 rounded text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 transition-colors"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={cancelLoadField}
                        aria-label="Cancel"
                        className="shrink-0 p-0.5 rounded text-ink-muted hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
                      >
                        <XIcon size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openLoadField(field)}
                      className="flex items-center gap-1.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
                    >
                      <span className="text-sm text-ceramic group-hover:text-[var(--color-neon-blue)] transition-colors truncate">
                        {display}
                      </span>
                      <Pencil size={11} className="shrink-0 text-ink-muted opacity-0 group-hover:opacity-50 transition-opacity" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}
            {loadFieldError && (
              <p className="text-[10px] text-[var(--color-unusonic-error)]">{loadFieldError}</p>
            )}
          </div>
        </div>
      </LiquidPanel>

      {/* Location — linked to directory.entities venue */}
      <Popover open={locationOpen} onOpenChange={(o) => {
        setLocationOpen(o);
        if (!o) { setLocationMode('view'); setVenueQuery(''); setVenueResults([]); }
      }}>
        <PopoverTrigger asChild>
          {locationName ? (
            /* Venue set */
            <LiquidPanel
              hoverEffect
              className="p-6 sm:p-7 rounded-[28px] flex flex-col gap-5 min-h-[130px] cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-ink-muted/70" aria-hidden />
                <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/80">
                  Location
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-ceramic font-medium tracking-tight leading-snug truncate group-hover:text-[var(--color-neon-blue)] transition-colors">
                  {locationName}
                </p>
                {locationAddress && locationAddress !== locationName && (
                  <p className="text-xs text-ink-muted mt-1 truncate leading-relaxed">
                    {locationAddress}
                  </p>
                )}
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted/60 group-hover:text-[var(--color-neon-blue)]/60 transition-colors">
                  <Pencil size={9} aria-hidden />
                  Edit
                </span>
              </div>
            </LiquidPanel>
          ) : (
            /* Empty state — dashed invite affordance */
            <button
              type="button"
              className="w-full min-h-[130px] rounded-[28px] border-2 border-dashed border-[var(--glass-border)] hover:border-[var(--color-neon-blue)]/40 hover:bg-[var(--color-neon-blue)]/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] flex flex-col gap-5 p-6 sm:p-7 group text-left"
            >
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-ink-muted/50 group-hover:text-[var(--color-neon-blue)]/60 transition-colors" aria-hidden />
                <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/60 group-hover:text-[var(--color-neon-blue)]/50 transition-colors">
                  Location
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-ink-muted group-hover:text-[var(--color-neon-blue)]/80 transition-colors">
                  Set venue
                </p>
                <p className="text-xs text-ink-muted/50 mt-0.5">
                  Search your venue network
                </p>
              </div>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-4">
          {locationMode === 'view' && locationName ? (
            <>
              <p className="text-ceramic font-medium tracking-tight mb-1">{locationName}</p>
              {locationAddress && locationAddress !== locationName && (
                <p className="text-sm text-ink-muted mb-3">{locationAddress}</p>
              )}
              <div className="flex flex-col gap-2">
                <a
                  href={googleMapsUrl(locationAddress || locationName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-neon-blue)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
                >
                  Open in Google Maps
                  <ExternalLink size={14} aria-hidden />
                </a>
                <div className="flex gap-2 mt-2 pt-2 border-t border-white/10">
                  {venueEntityId && (
                    <a
                      href={`/network/entity/${venueEntityId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded-lg border border-white/10 text-[var(--color-neon-blue)] hover:bg-[var(--color-neon-blue)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      View in Network
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={openLocationSearch}
                    className="flex-1 text-xs py-1.5 px-2 rounded-lg border border-white/10 text-ink-muted hover:bg-white/5 hover:text-ceramic transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Change venue
                  </button>
                  {venueEntityId && (
                    <button
                      type="button"
                      onClick={clearVenue}
                      disabled={savingVenue}
                      className="text-xs py-1.5 px-2 rounded-lg border border-white/10 text-ink-muted hover:bg-white/5 hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
                    >
                      {savingVenue ? '…' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Search mode */
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-muted/80 mb-3">
                {locationMode === 'search' && locationName ? 'Change venue' : 'Set venue'}
              </p>
              <input
                autoFocus
                type="text"
                value={venueQuery}
                onChange={(e) => handleVenueQueryChange(e.target.value)}
                placeholder="Search venues…"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ceramic placeholder:text-ink-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              {venueSearching && (
                <p className="text-xs text-ink-muted px-1">Searching…</p>
              )}
              {venueResults.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                  {venueResults.map((r) =>
                    r.type === 'venue' ? (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={savingVenue}
                          onClick={() => selectVenue(r.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
                        >
                          <p className="text-sm text-ceramic font-medium truncate">{r.name}</p>
                          {r.address && (
                            <p className="text-xs text-ink-muted truncate mt-0.5">{r.address}</p>
                          )}
                        </button>
                      </li>
                    ) : (
                      <li key="create">
                        <a
                          href="/network"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--color-neon-blue)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          Add &quot;{r.query}&quot; in Network
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      </li>
                    )
                  )}
                </ul>
              )}
              {!venueSearching && venueQuery.length >= 2 && venueResults.length === 0 && (
                <p className="text-xs text-ink-muted px-1">
                  No venues found.{' '}
                  <a
                    href="/network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-neon-blue)] hover:underline"
                  >
                    Add one in Network →
                  </a>
                </p>
              )}
              {locationName && locationMode === 'search' && (
                <button
                  type="button"
                  onClick={() => setLocationMode('view')}
                  className="text-xs text-ink-muted hover:text-ceramic mt-1 ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Call Times — named slots + per-crew assignment */}
      <CallTimesCard
        eventId={eventId}
        runOfShowData={runOfShowData}
        startsAt={event.starts_at ?? null}
        onUpdated={onEventUpdated ?? (() => {})}
      />

      {/* Transport (mode + contextual status flow) */}
      <TransportLogisticsCard
        eventId={eventId}
        runOfShowData={runOfShowData}
        onUpdated={onEventUpdated ?? (() => {})}
      />
    </>
  );
}
