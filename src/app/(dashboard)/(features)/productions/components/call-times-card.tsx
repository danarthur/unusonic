'use client';

import { useState, useRef } from 'react';
import {
  Clock,
  Pencil,
  Check,
  X as XIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { updateCallTimeSlots } from '../actions/update-call-time-slots';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { CallTimeSlot } from '@/entities/event/api/get-event-summary';

// ─── Call time helpers ───────────────────────────────────────────────────────

const CALL_TIME_BUFFER_HOURS = 2;

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

// ─── Component ───────────────────────────────────────────────────────────────

export type CallTimesCardProps = {
  eventId: string;
  runOfShowData: EventSummaryForPrism['run_of_show_data'];
  startsAt: string | null;
  onUpdated: () => void;
};

export function CallTimesCard({ eventId, runOfShowData, startsAt, onUpdated }: CallTimesCardProps) {
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
      let id = newId;
      let n = 0;
      while (slots.some((s) => s.id === id)) {
        n += 1;
        id = `${newId}_${n}`;
      }
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
    <StagePanel elevated className="p-6 sm:p-7 rounded-[var(--stage-radius-panel)] flex flex-col gap-5 min-h-[130px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="shrink-0 text-[var(--stage-text-secondary)]/70" aria-hidden />
          <p className="stage-label">
            Call times
          </p>
          {saving && (
            <span className="text-label text-[var(--stage-text-secondary)]/50">saving\u2026</span>
          )}
        </div>
        {hasSlots && (
          <button
            type="button"
            onClick={openNew}
            disabled={editingId !== null}
            className="p-1 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
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
                  className="w-full rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                />
                <div className="flex gap-1.5 items-center">
                  <input
                    type="datetime-local"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                    className="flex-1 rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  />
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors">
                    <Check size={14} />
                  </button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors">
                    <XIcon size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div key={slot.id} className="group flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="stage-label text-[var(--stage-text-tertiary)] leading-none">{slot.label}</p>
                  <p className="stage-readout mt-0.5">{formatSlotTime(slot.time)}</p>
                </div>
                <div className="flex items-center gap-1 invisible group-hover:visible transition-[visibility]">
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    disabled={editingId !== null}
                    className="p-1 rounded text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none disabled:opacity-45 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={11} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSlot(slot.id)}
                    disabled={saving || editingId !== null}
                    className="p-1 rounded text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 focus:outline-none disabled:opacity-45 transition-colors"
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
                className="w-full rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              <div className="flex gap-1.5 items-center">
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                  className="flex-1 rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors">
                  <Check size={14} />
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors">
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty state -- no slots configured yet */
        <div className="flex flex-col gap-3 flex-1">
          {legacyOverride ? (
            <div>
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-snug">
                {getCallTimeDisplay(startsAt, legacyOverride)}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)]/60 mt-0.5">
                {getCallTimeOffset(startsAt, legacyOverride) ?? 'Single call time'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-snug">
                {getCallTimeDisplay(startsAt, null)}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)]/60 mt-0.5">
                Auto \u00b7 {getCallTimeOffset(startsAt, null) ?? '\u2014'}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {startsAt && (
              <button
                type="button"
                onClick={addDefaults}
                disabled={saving}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium tracking-tight text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors"
              >
                <Plus size={12} aria-hidden />
                Add slots
              </button>
            )}
            <button
              type="button"
              onClick={openNew}
              disabled={saving}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium tracking-tight text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors"
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
                className="w-full rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              <div className="flex gap-1.5 items-center">
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                  className="flex-1 rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-2.5 py-1.5 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} disabled={saving} aria-label="Save" className="shrink-0 p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors">
                  <Check size={14} />
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} aria-label="Cancel" className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors">
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </StagePanel>
  );
}
