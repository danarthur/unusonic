'use client';

import { useState, useTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Package, AlertTriangle, ArrowLeftRight, Search, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_HEAVY, STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import {
  getDayResourceView,
  type DayResourceView,
  type DayEventSlice,
  type DayCrewSlot,
  type CrossEventConflict,
} from '../actions/get-day-resource-view';
import {
  searchAvailableAlternatives,
  swapCrewMember,
  type AlternativeCrewResult,
} from '../actions/conflict-resolution';

// =============================================================================
// Props
// =============================================================================

type CrossShowResourceModalProps = {
  open: boolean;
  onClose: () => void;
  date: string; // ISO date "2026-04-15"
  sourceOrgId: string | null;
};

// =============================================================================
// Colour assignments for event legend dots
// =============================================================================

const EVENT_HUES = [210, 30, 150, 330, 270, 60] as const;

function eventColor(index: number, opacity = 0.75): string {
  const hue = EVENT_HUES[index % EVENT_HUES.length];
  return `oklch(0.65 0.14 ${hue} / ${opacity})`;
}

function eventBg(index: number): string {
  const hue = EVENT_HUES[index % EVENT_HUES.length];
  return `oklch(0.65 0.14 ${hue} / 0.08)`;
}

// =============================================================================
// Date formatting
// =============================================================================

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// =============================================================================
// Component
// =============================================================================

export function CrossShowResourceModal({ open, onClose, date, sourceOrgId }: CrossShowResourceModalProps) {
  const [data, setData] = useState<DayResourceView | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);

  // Swap state
  const [swapTarget, setSwapTarget] = useState<{
    dealCrewId: string;
    dealId: string;
    entityId: string;
    role: string | null;
  } | null>(null);
  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState<AlternativeCrewResult[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isSwapping, startSwap] = useTransition();

  // Fetch on open
  if (open && !hasFetched) {
    setHasFetched(true);
    startLoad(async () => {
      const result = await getDayResourceView(date);
      setData(result);
    });
  }

  // Reset when closed
  if (!open && hasFetched) {
    setHasFetched(false);
    setData(null);
    setSwapTarget(null);
    setSwapQuery('');
    setSwapResults([]);
  }

  const handleRefetch = useCallback(() => {
    startLoad(async () => {
      const result = await getDayResourceView(date);
      setData(result);
      setSwapTarget(null);
      setSwapQuery('');
      setSwapResults([]);
    });
  }, [date]);

  const conflictEntityIds = new Set(
    (data?.conflicts ?? [])
      .filter((c) => c.resourceType === 'crew')
      .map((c) => c.entityId),
  );

  const conflictGearNames = new Set(
    (data?.conflicts ?? [])
      .filter((c) => c.resourceType === 'gear')
      .map((c) => c.entityName.toLowerCase().trim()),
  );

  // Build event index for legend
  const eventIndex = new Map<string, number>();
  (data?.events ?? []).forEach((ev, i) => eventIndex.set(ev.eventId, i));

  // Build unified crew list: entity → events they appear in
  const crewMap = new Map<string, {
    entityId: string | null;
    entityName: string;
    role: string | null;
    department: string | null;
    confirmed: boolean;
    events: { eventId: string; title: string; dealCrewId: string; dealId: string | null }[];
  }>();

  for (const ev of data?.events ?? []) {
    for (const slot of ev.crew) {
      const key = slot.entityId ?? `role-${slot.role}-${ev.eventId}`;
      const entry = crewMap.get(key) ?? {
        entityId: slot.entityId,
        entityName: slot.entityName ?? slot.role ?? 'Open slot',
        role: slot.role,
        department: slot.department,
        confirmed: slot.confirmed,
        events: [],
      };
      entry.events.push({
        eventId: ev.eventId,
        title: ev.title,
        dealCrewId: slot.dealCrewId,
        dealId: ev.dealId,
      });
      crewMap.set(key, entry);
    }
  }
  const crewList = [...crewMap.values()].sort((a, b) => {
    // Conflicts first
    const aConflict = a.entityId && conflictEntityIds.has(a.entityId);
    const bConflict = b.entityId && conflictEntityIds.has(b.entityId);
    if (aConflict && !bConflict) return -1;
    if (!aConflict && bConflict) return 1;
    return a.entityName.localeCompare(b.entityName);
  });

  // Build unified gear list
  const gearMap = new Map<string, {
    name: string;
    totalQuantity: number;
    events: { eventId: string; title: string; quantity: number; status: string }[];
  }>();

  for (const ev of data?.events ?? []) {
    for (const slot of ev.gear) {
      const key = slot.name.toLowerCase().trim();
      const entry = gearMap.get(key) ?? { name: slot.name, totalQuantity: 0, events: [] };
      entry.totalQuantity += slot.quantity;
      entry.events.push({
        eventId: ev.eventId,
        title: ev.title,
        quantity: slot.quantity,
        status: slot.status,
      });
      gearMap.set(key, entry);
    }
  }
  const gearList = [...gearMap.values()].sort((a, b) => {
    const aConflict = conflictGearNames.has(a.name.toLowerCase().trim());
    const bConflict = conflictGearNames.has(b.name.toLowerCase().trim());
    if (aConflict && !bConflict) return -1;
    if (!aConflict && bConflict) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── Swap handlers ────────────────────────────────────────────────────────

  const handleOpenSwap = (entityId: string, dealCrewId: string, dealId: string, role: string | null) => {
    setSwapTarget({ dealCrewId, dealId, entityId, role });
    setSwapQuery('');
    setSwapResults([]);
  };

  const handleSwapSearch = (q: string) => {
    setSwapQuery(q);
    if (!sourceOrgId || !swapTarget || q.trim().length < 2) {
      setSwapResults([]);
      return;
    }
    startSearch(async () => {
      const results = await searchAvailableAlternatives(
        sourceOrgId,
        q.trim(),
        swapTarget.role,
        [swapTarget.entityId],
      );
      setSwapResults(results);
    });
  };

  const handleSwapConfirm = (newEntityId: string) => {
    if (!swapTarget) return;
    startSwap(async () => {
      const result = await swapCrewMember(
        swapTarget.dealId,
        swapTarget.dealCrewId,
        newEntityId,
        swapTarget.role,
      );
      if (result.success) {
        toast.success('Crew member swapped');
        handleRefetch();
      } else {
        toast.error(result.error ?? 'Swap failed');
      }
    });
  };

  if (!open || typeof window === 'undefined') return null;

  const totalCrew = crewList.length;
  const totalGear = gearList.length;
  const conflictCount = (data?.conflicts ?? []).length;

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: 'oklch(0.06 0 0 / 0.75)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Drawer — slides from right */}
      <motion.aside
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-lg flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--stage-surface-raised)' }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={STAGE_HEAVY}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0 px-5 py-4 border-b"
          style={{ borderColor: 'var(--stage-border)' }}
        >
          <div>
            <h2
              className="text-base font-semibold tracking-tight"
              style={{ color: 'var(--stage-text-primary)' }}
            >
              Day view — {formatDate(date)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--stage-text-secondary)' }}>
              {(data?.events ?? []).length} show{(data?.events ?? []).length !== 1 ? 's' : ''}
              {conflictCount > 0 && (
                <span style={{ color: 'var(--color-unusonic-error)' }}>
                  {' '} · {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-[oklch(1_0_0/0.08)]"
            aria-label="Close day view"
          >
            <X size={18} strokeWidth={1.5} style={{ color: 'var(--stage-text-secondary)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--stage-text-tertiary)' }} />
            </div>
          )}

          {!isLoading && !data && (
            <p className="text-sm py-12 text-center" style={{ color: 'var(--stage-text-tertiary)' }}>
              No resource data for this date.
            </p>
          )}

          {!isLoading && data && (
            <div className="space-y-0">
              {/* Event legend */}
              <div className="px-5 py-3 flex flex-wrap gap-3 border-b" style={{ borderColor: 'var(--stage-edge-subtle)' }}>
                {data.events.map((ev, i) => (
                  <div key={ev.eventId} className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: eventColor(i) }}
                    />
                    <span className="text-xs tracking-tight" style={{ color: 'var(--stage-text-secondary)' }}>
                      {ev.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Crew section */}
              <section>
                <div
                  className="sticky top-0 z-10 px-5 py-2.5 flex items-center gap-2 border-b"
                  style={{
                    borderColor: 'var(--stage-edge-subtle)',
                    backgroundColor: 'var(--stage-surface-elevated)',
                  }}
                >
                  <Users size={14} style={{ color: 'var(--stage-text-tertiary)' }} />
                  <span className="text-xs font-medium tracking-tight uppercase" style={{ color: 'var(--stage-text-secondary)' }}>
                    Crew
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
                    {totalCrew}
                  </span>
                </div>

                {crewList.length === 0 && (
                  <p className="text-xs px-5 py-4" style={{ color: 'var(--stage-text-tertiary)' }}>
                    No crew assigned.
                  </p>
                )}

                <ul className="divide-y" style={{ borderColor: 'var(--stage-edge-subtle)' }}>
                  {crewList.map((member, idx) => {
                    const isConflict = member.entityId && conflictEntityIds.has(member.entityId);
                    const isSwapActive = swapTarget?.entityId === member.entityId;

                    return (
                      <motion.li
                        key={member.entityId ?? `crew-${idx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...STAGE_LIGHT, delay: idx * 0.02 }}
                        className="relative"
                      >
                        <div
                          className={cn(
                            'px-5 py-2.5 flex items-center gap-3',
                            isConflict && 'bg-[color-mix(in_oklch,var(--color-unusonic-error)_5%,transparent)]',
                          )}
                          style={isConflict ? { borderLeft: '3px solid var(--color-unusonic-error)' } : undefined}
                        >
                          {/* Name + role */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium tracking-tight truncate" style={{ color: 'var(--stage-text-primary)' }}>
                              {member.entityName}
                            </p>
                            {member.role && (
                              <p className="text-[11px] truncate" style={{ color: 'var(--stage-text-tertiary)' }}>
                                {member.role}
                                {member.department && ` · ${member.department}`}
                              </p>
                            )}
                          </div>

                          {/* Event dots */}
                          <div className="flex items-center gap-1 shrink-0">
                            {data.events.map((ev) => {
                              const assigned = member.events.some((e) => e.eventId === ev.eventId);
                              const i = eventIndex.get(ev.eventId) ?? 0;
                              return (
                                <span
                                  key={ev.eventId}
                                  className="size-2 rounded-full"
                                  style={{
                                    backgroundColor: assigned ? eventColor(i) : 'var(--stage-edge-subtle)',
                                  }}
                                  title={`${ev.title}${assigned ? ' (assigned)' : ''}`}
                                />
                              );
                            })}
                          </div>

                          {/* Conflict badge + swap */}
                          {isConflict && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
                                style={{
                                  color: 'var(--color-unusonic-error)',
                                  backgroundColor: 'color-mix(in oklch, var(--color-unusonic-error) 10%, transparent)',
                                  borderRadius: 'var(--stage-radius-input, 6px)',
                                }}
                              >
                                Conflict
                              </span>
                              {sourceOrgId && member.events.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const first = member.events[0];
                                    if (first.dealId && member.entityId) {
                                      handleOpenSwap(member.entityId, first.dealCrewId, first.dealId, member.role);
                                    }
                                  }}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors"
                                  style={{
                                    color: 'var(--color-unusonic-info)',
                                    backgroundColor: 'color-mix(in oklch, var(--color-unusonic-info) 10%, transparent)',
                                    borderRadius: 'var(--stage-radius-input, 6px)',
                                  }}
                                >
                                  <ArrowLeftRight size={10} />
                                  Swap
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Inline swap picker */}
                        <AnimatePresence>
                          {isSwapActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={STAGE_MEDIUM}
                              className="overflow-hidden"
                            >
                              <div
                                className="px-5 py-3 space-y-2"
                                style={{
                                  backgroundColor: 'color-mix(in oklch, var(--color-unusonic-info) 3%, var(--stage-surface))',
                                  borderTop: '1px solid var(--stage-edge-subtle)',
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <Search
                                      size={12}
                                      className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                      style={{ color: 'var(--stage-text-tertiary)' }}
                                    />
                                    <input
                                      type="text"
                                      value={swapQuery}
                                      onChange={(e) => handleSwapSearch(e.target.value)}
                                      placeholder="Search replacement…"
                                      autoFocus
                                      className="w-full pl-7 pr-3 py-1.5 text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/30"
                                      style={{
                                        background: 'var(--ctx-well, var(--stage-input-bg))',
                                        borderRadius: 'var(--stage-radius-input, 6px)',
                                        border: '1px solid var(--stage-edge-subtle)',
                                      }}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSwapTarget(null)}
                                    className="text-[10px] font-medium px-2 py-1 transition-colors"
                                    style={{
                                      color: 'var(--stage-text-secondary)',
                                      borderRadius: 'var(--stage-radius-input, 6px)',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>

                                {isSearching && (
                                  <div className="flex items-center gap-1.5 py-1">
                                    <Loader2 size={12} className="animate-spin" style={{ color: 'var(--stage-text-tertiary)' }} />
                                    <span className="text-[11px]" style={{ color: 'var(--stage-text-tertiary)' }}>Searching…</span>
                                  </div>
                                )}

                                {!isSearching && swapResults.length > 0 && (
                                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                                    {swapResults.map((alt) => (
                                      <li key={alt.id}>
                                        <button
                                          type="button"
                                          onClick={() => handleSwapConfirm(alt.id)}
                                          disabled={isSwapping}
                                          className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--ctx-well-hover,oklch(1_0_0/0.04))] disabled:opacity-50"
                                          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                                        >
                                          <span className="flex-1 truncate" style={{ color: 'var(--stage-text-primary)' }}>
                                            {alt.name}
                                          </span>
                                          {alt.jobTitle && (
                                            <span className="text-[10px] shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>
                                              {alt.jobTitle}
                                            </span>
                                          )}
                                          <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>
                                            {alt.section}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {!isSearching && swapQuery.length >= 2 && swapResults.length === 0 && (
                                  <p className="text-[11px] py-1" style={{ color: 'var(--stage-text-tertiary)' }}>
                                    No matches found.
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </ul>
              </section>

              {/* Gear section */}
              {totalGear > 0 && (
                <section>
                  <div
                    className="sticky top-0 z-10 px-5 py-2.5 flex items-center gap-2 border-b border-t"
                    style={{
                      borderColor: 'var(--stage-edge-subtle)',
                      backgroundColor: 'var(--stage-surface-elevated)',
                    }}
                  >
                    <Package size={14} style={{ color: 'var(--stage-text-tertiary)' }} />
                    <span className="text-xs font-medium tracking-tight uppercase" style={{ color: 'var(--stage-text-secondary)' }}>
                      Gear
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
                      {totalGear}
                    </span>
                  </div>

                  <ul className="divide-y" style={{ borderColor: 'var(--stage-edge-subtle)' }}>
                    {gearList.map((item, idx) => {
                      const isConflict = conflictGearNames.has(item.name.toLowerCase().trim());

                      return (
                        <motion.li
                          key={item.name}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...STAGE_LIGHT, delay: idx * 0.02 }}
                          className={cn(
                            'px-5 py-2.5 flex items-center gap-3',
                            isConflict && 'bg-[color-mix(in_oklch,var(--color-unusonic-error)_5%,transparent)]',
                          )}
                          style={isConflict ? { borderLeft: '3px solid var(--color-unusonic-error)' } : undefined}
                        >
                          {/* Name + quantity */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium tracking-tight truncate" style={{ color: 'var(--stage-text-primary)' }}>
                              {item.name}
                            </p>
                            <p className="text-[11px] tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
                              qty {item.totalQuantity}
                            </p>
                          </div>

                          {/* Event dots */}
                          <div className="flex items-center gap-1 shrink-0">
                            {data.events.map((ev) => {
                              const allocated = item.events.some((e) => e.eventId === ev.eventId);
                              const i = eventIndex.get(ev.eventId) ?? 0;
                              return (
                                <span
                                  key={ev.eventId}
                                  className="size-2 rounded-full"
                                  style={{
                                    backgroundColor: allocated ? eventColor(i) : 'var(--stage-edge-subtle)',
                                  }}
                                  title={`${ev.title}${allocated ? ' (allocated)' : ''}`}
                                />
                              );
                            })}
                          </div>

                          {/* Conflict badge */}
                          {isConflict && (
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 shrink-0"
                              style={{
                                color: 'var(--color-unusonic-error)',
                                backgroundColor: 'color-mix(in oklch, var(--color-unusonic-error) 10%, transparent)',
                                borderRadius: 'var(--stage-radius-input, 6px)',
                              }}
                            >
                              Conflict
                            </span>
                          )}
                        </motion.li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </>,
    document.body,
  );
}
