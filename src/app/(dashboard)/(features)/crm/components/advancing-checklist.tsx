'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock, Plus, Trash2, Loader2 } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM, STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import {
  getAdvancingChecklist,
  seedAdvancingChecklist,
  toggleAdvancingItem,
  addAdvancingItem,
  removeAdvancingItem,
} from '../actions/advancing-checklist';
import { updateFlightCheckStatus } from '../actions/update-flight-check-status';
import { normalizeGearItems, normalizeLogistics, GEAR_LIFECYCLE_ORDER, GEAR_BRANCH_STATES } from './flight-checks/types';
import type { AdvancingChecklistItem, AutoKey } from '../lib/advancing-checklist-types';
import type { DealCrewRow } from '../actions/deal-crew';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

type AdvancingChecklistProps = {
  eventId: string;
  crewRows: DealCrewRow[];
  runOfShowData: RunOfShowData | null;
  contractStatus: string | null;
  archetype?: string | null;
  /** Event date (ISO date string, e.g. '2026-04-15') — drives urgency indicators. */
  eventDate?: string | null;
  /** Transport mode — when 'none' or 'personal_vehicle', truck items are excluded. */
  transportMode?: string | null;
};

function computeAutoStates(
  crewRows: DealCrewRow[],
  runOfShowData: RunOfShowData | null,
  contractStatus: string | null,
): Record<AutoKey, boolean> {
  const assigned = crewRows.filter((r) => r.entity_id);
  const gearItems = normalizeGearItems(runOfShowData);
  const logistics = normalizeLogistics(runOfShowData);

  return {
    crew_all_confirmed: assigned.length > 0 && assigned.every((r) => r.confirmed_at),
    gear_all_pulled: gearItems.length > 0 && gearItems.every((g) =>
      GEAR_BRANCH_STATES.includes(g.status) || GEAR_LIFECYCLE_ORDER.indexOf(g.status) >= 1
    ),
    venue_access_confirmed: !!logistics.venue_access_confirmed,
    contract_signed: contractStatus === 'signed',
    truck_loaded: !!logistics.truck_loaded,
    crew_gear_confirmed: !!(logistics as Record<string, unknown>).crew_gear_confirmed,
  };
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Compute days until event. Negative = past. */
function computeDaysUntil(eventDate: string | null | undefined): number | null {
  if (!eventDate) return null;
  const now = new Date();
  const event = new Date(eventDate + 'T00:00:00');
  const diffMs = event.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

type UrgencyLevel = 'green' | 'amber' | 'red' | 'past';

function getUrgency(daysUntil: number | null): UrgencyLevel | null {
  if (daysUntil == null) return null;
  if (daysUntil < 0) return 'past';
  if (daysUntil <= 3) return 'red';
  if (daysUntil <= 7) return 'amber';
  return 'green';
}

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  green: 'var(--color-unusonic-success)',
  amber: 'var(--color-unusonic-warning)',
  red: 'var(--color-unusonic-error)',
  past: 'var(--stage-text-tertiary)',
};

export function AdvancingChecklist({
  eventId,
  crewRows,
  runOfShowData,
  contractStatus,
  archetype,
  eventDate,
  transportMode,
}: AdvancingChecklistProps) {
  const [items, setItems] = useState<AdvancingChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch / seed on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await getAdvancingChecklist(eventId);
        if (!cancelled && list.length === 0) {
          // Seed failures (e.g. unknown archetype on a grandfathered deal) used
          // to bubble out of the effect and leave the checklist spinning forever.
          // Fall back to an empty list so the UI settles; the seeder captures
          // its own errors to Sentry.
          try {
            list = await seedAdvancingChecklist(eventId, archetype, transportMode);
          } catch (seedErr) {
            console.error('[advancing-checklist] seed failed:', seedErr);
            list = [];
          }
        }
        if (!cancelled) {
          setItems(list);
          setLoading(false);
        }
      } catch (err) {
        console.error('[advancing-checklist] fetch failed:', err);
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ── Auto-state sync ──
  const autoStates = computeAutoStates(crewRows, runOfShowData, contractStatus);

  const syncAutoStates = useCallback(async () => {
    let changed = false;
    const updated = items.map((item) => {
      if (!item.auto_key) return item;
      const key = item.auto_key as AutoKey;
      const autoValue = autoStates[key];
      if (autoValue !== undefined && autoValue !== item.done) {
        changed = true;
        return {
          ...item,
          done: autoValue,
          done_by: autoValue ? 'System' : null,
          done_at: autoValue ? new Date().toISOString() : null,
        };
      }
      return item;
    });

    if (changed) {
      setItems(updated);
      // Fire server updates in background
      for (const item of updated) {
        if (!item.auto_key) continue;
        const key = item.auto_key as AutoKey;
        const autoValue = autoStates[key];
        const original = items.find((i) => i.id === item.id);
        if (autoValue !== undefined && original && autoValue !== original.done) {
          toggleAdvancingItem(eventId, item.id, autoValue, 'System');
        }
      }
    }
  }, [items, autoStates, eventId]);

  useEffect(() => {
    if (items.length > 0) {
      syncAutoStates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewRows, runOfShowData, contractStatus]);

  // Auto-keys that can be manually toggled (they write to logistics JSONB)
  const TOGGLEABLE_AUTO_KEYS = new Set<string>(['venue_access_confirmed', 'truck_loaded', 'crew_gear_confirmed']);

  // ── Toggle item ──
  const handleToggle = async (item: AdvancingChecklistItem) => {
    // Locked auto items (derived from data, not toggleable)
    if (item.auto_key && !TOGGLEABLE_AUTO_KEYS.has(item.auto_key)) return;
    const newDone = !item.done;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, done: newDone, done_by: newDone ? 'You' : null, done_at: newDone ? new Date().toISOString() : null }
          : i,
      ),
    );
    await toggleAdvancingItem(eventId, item.id, newDone, 'You');
    // Toggleable auto-items: also write to logistics JSONB so the data stays in sync
    if (item.auto_key === 'venue_access_confirmed') {
      updateFlightCheckStatus(eventId, { logistics: { venue_access_confirmed: newDone } as RunOfShowData['logistics'] });
    } else if (item.auto_key === 'truck_loaded') {
      updateFlightCheckStatus(eventId, { logistics: { truck_loaded: newDone } as RunOfShowData['logistics'] });
    } else if (item.auto_key === 'crew_gear_confirmed') {
      updateFlightCheckStatus(eventId, { logistics: { crew_gear_confirmed: newDone } as RunOfShowData['logistics'] });
    }
  };

  // ── Add manual item ──
  const handleAdd = async () => {
    const trimmed = addLabel.trim();
    if (!trimmed) return;
    setAddSaving(true);
    const newItem = await addAdvancingItem(eventId, trimmed);
    if (newItem) {
      setItems((prev) => [...prev, newItem]);
    }
    setAddLabel('');
    setAddSaving(false);
    setAddOpen(false);
  };

  // ── Remove manual item ──
  const handleRemove = async (item: AdvancingChecklistItem) => {
    if (item.auto_key) return;
    // Optimistic
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await removeAdvancingItem(eventId, item.id);
  };

  // Focus input when add opens
  useEffect(() => {
    if (addOpen) inputRef.current?.focus();
  }, [addOpen]);

  // ── Date awareness ──
  const daysUntil = computeDaysUntil(eventDate);
  const urgency = getUrgency(daysUntil);

  // ── Derived ──
  // Sort: incomplete items first when urgent (≤7 days), then by sort_order
  const sorted = [...items].sort((a, b) => {
    // When urgent, push incomplete items above done items
    if (urgency && (urgency === 'red' || urgency === 'amber')) {
      if (a.done !== b.done) return a.done ? 1 : -1;
    }
    return a.sort_order - b.sort_order;
  });
  const doneCount = sorted.filter((i) => i.done).length;
  const totalCount = sorted.length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

  if (loading) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      </StagePanel>
    );
  }

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="stage-label">
            Advancing
          </h3>
          {/* Countdown badge */}
          {daysUntil != null && !allDone && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md stage-badge-text tabular-nums tracking-tight"
              style={{
                color: urgency === 'green'
                  ? 'var(--stage-text-tertiary)'
                  : urgency && urgency !== 'past'
                    ? URGENCY_COLORS[urgency]
                    : 'var(--stage-text-tertiary)',
                backgroundColor: urgency === 'green'
                  ? 'oklch(1 0 0 / 0.04)'
                  : urgency === 'red'
                    ? `color-mix(in oklch, ${URGENCY_COLORS.red} 15%, transparent)`
                    : urgency === 'amber'
                      ? `color-mix(in oklch, ${URGENCY_COLORS.amber} 12%, transparent)`
                      : 'oklch(1 0 0 / 0.03)',
              }}
            >
              {daysUntil < 0
                ? `${Math.abs(daysUntil)}d ago`
                : daysUntil === 0
                  ? 'Today'
                  : daysUntil === 1
                    ? 'Tomorrow'
                    : `${daysUntil}d`}
            </span>
          )}
        </div>
        <span className="stage-badge-text text-[var(--stage-text-tertiary)] tabular-nums">
          {doneCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[oklch(1_0_0_/_0.04)] mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: allDone
              ? 'var(--color-unusonic-success)'
              : urgency && (urgency === 'red' || urgency === 'amber') && !allDone
                ? URGENCY_COLORS[urgency]
                : 'var(--stage-text-secondary)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={STAGE_MEDIUM}
        />
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {sorted.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={STAGE_LIGHT}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2.5 py-1.5 group">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  disabled={!!(item.auto_key && !TOGGLEABLE_AUTO_KEYS.has(item.auto_key))}
                  className="shrink-0 mt-0.5 relative flex items-center justify-center size-4 rounded-[3px] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{
                    borderColor: item.done
                      ? 'var(--color-unusonic-success)'
                      : 'oklch(1 0 0 / 0.15)',
                    backgroundColor: item.done
                      ? 'var(--color-unusonic-success)'
                      : 'transparent',
                    cursor: (item.auto_key && !TOGGLEABLE_AUTO_KEYS.has(item.auto_key)) ? 'default' : 'pointer',
                  }}
                  aria-label={`${item.done ? 'Uncheck' : 'Check'} ${item.label}`}
                >
                  {item.done && <Check size={10} strokeWidth={2.5} className="text-[oklch(0.13_0_0)]" />}
                  {item.auto_key && !TOGGLEABLE_AUTO_KEYS.has(item.auto_key) && !item.done && (
                    <Lock size={8} className="text-[var(--stage-text-tertiary)] absolute" />
                  )}
                </button>

                {/* Label + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`stage-readout leading-tight ${
                        item.done
                          ? 'text-[var(--stage-text-tertiary)] line-through'
                          : ''
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.auto_key && (
                      <span
                        className="inline-flex items-center px-1 py-px rounded stage-micro"
                        style={{
                          background: 'oklch(1 0 0 / 0.04)',
                          color: 'var(--stage-text-tertiary)',
                        }}
                      >
                        Auto
                      </span>
                    )}
                    {/* Urgency dot for incomplete items when show is approaching */}
                    {!item.done && urgency && (urgency === 'red' || urgency === 'amber') && (
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: URGENCY_COLORS[urgency] }}
                        title={daysUntil === 0 ? 'Show is today' : daysUntil === 1 ? 'Show is tomorrow' : `${daysUntil}d until show`}
                      />
                    )}
                  </div>
                  {item.done && item.done_by && item.done_at && (
                    <p className="text-label text-[var(--stage-text-tertiary)] mt-0.5 truncate">
                      {item.done_by} &middot; {timeAgo(item.done_at)}
                    </p>
                  )}
                </div>

                {/* Remove button for manual items */}
                {!item.auto_key && (
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:opacity-100 mt-0.5"
                    aria-label={`Remove ${item.label}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add item */}
      <div className="mt-3 pt-3 border-t border-[oklch(1_0_0_/_0.04)]">
        {addOpen ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAddOpen(false); setAddLabel(''); }
              }}
              placeholder="Checklist item"
              className="flex-1 bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)]"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!addLabel.trim() || addSaving}
              className="stage-btn stage-btn-secondary px-3 py-1.5 text-sm disabled:opacity-45 disabled:pointer-events-none"
            >
              {addSaving ? <Loader2 className="size-3.5 animate-spin" /> : 'Add'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
          >
            <Plus size={13} />
            <span>Add item</span>
          </button>
        )}
      </div>
    </StagePanel>
  );
}
