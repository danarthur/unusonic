'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { saveAvailability, type BlackoutRange } from '@/features/ops/actions/save-availability';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

// ─── Date Helpers ────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Get all days in a month, with leading/trailing days for the grid. */
function getMonthGrid(year: number, month: number): Array<{ date: Date; dateStr: string; inMonth: boolean }> {
  const firstOfMonth = new Date(year, month, 1);
  // Monday=0 ... Sunday=6 (ISO week)
  let startDow = firstOfMonth.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: Array<{ date: Date; dateStr: string; inMonth: boolean }> = [];

  // Leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    grid.push({ date: d, dateStr: toDateStr(d), inMonth: false });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    grid.push({ date: d, dateStr: toDateStr(d), inMonth: true });
  }

  // Trailing days to fill the last row
  const remaining = grid.length % 7;
  if (remaining > 0) {
    const fill = 7 - remaining;
    for (let i = 1; i <= fill; i++) {
      const d = new Date(year, month + 1, i);
      grid.push({ date: d, dateStr: toDateStr(d), inMonth: false });
    }
  }

  return grid;
}

/** Expand blackout ranges into a Set of individual date strings. */
function expandBlackouts(ranges: BlackoutRange[]): Set<string> {
  const set = new Set<string>();
  for (const range of ranges) {
    const start = parseDateStr(range.start);
    const end = parseDateStr(range.end);
    const cursor = new Date(start);
    while (cursor <= end) {
      set.add(toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return set;
}

/** Merge a set of date strings into consolidated ranges. */
function mergeIntoRanges(dates: Set<string>): BlackoutRange[] {
  if (dates.size === 0) return [];
  const sorted = Array.from(dates).sort();
  const ranges: BlackoutRange[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prevDate = parseDateStr(prev);
    const currDate = parseDateStr(curr);
    const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      prev = curr;
    } else {
      ranges.push({ start, end: prev });
      start = curr;
      prev = curr;
    }
  }
  ranges.push({ start, end: prev });
  return ranges;
}

// ─── Diagonal Stripe Pattern ─────────────────────────────────────────────────

/**
 * SVG diagonal stripe pattern for unavailable dates.
 * Achromatic, subtle, rendered once and referenced via url(#unavailable-stripes).
 */
function StripePattern() {
  return (
    <svg className="absolute" width="0" height="0" aria-hidden>
      <defs>
        <pattern
          id="unavailable-stripes"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="oklch(1 0 0 / 0.08)" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface GigEntry {
  date: string | null;
  title: string;
  status: string;
  assignmentId: string;
}

interface CalendarViewProps {
  entityId: string;
  initialBlackouts: BlackoutRange[];
  gigs?: GigEntry[];
}

export function CalendarView({ entityId, initialBlackouts, gigs = [] }: CalendarViewProps) {
  const today = useMemo(() => toDateStr(new Date()), []);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  // Saved state (what the server knows)
  const [savedBlackoutDates, setSavedBlackoutDates] = useState<Set<string>>(
    () => expandBlackouts(initialBlackouts)
  );
  // Working state (current selection)
  const [blackoutDates, setBlackoutDates] = useState<Set<string>>(
    () => expandBlackouts(initialBlackouts)
  );

  // Build gig map by date
  const gigMap = useMemo(() => {
    const map = new Map<string, GigEntry[]>();
    for (const g of gigs) {
      if (!g.date) continue;
      const key = toDateStr(new Date(g.date));
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return map;
  }, [gigs]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Drag state
  const isDragging = useRef(false);
  const dragMode = useRef<'add' | 'remove'>('add');
  const dragStartDate = useRef<string | null>(null);

  // Direction for animation
  const [direction, setDirection] = useState(0);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (blackoutDates.size !== savedBlackoutDates.size) return true;
    for (const d of blackoutDates) {
      if (!savedBlackoutDates.has(d)) return true;
    }
    return false;
  }, [blackoutDates, savedBlackoutDates]);

  const navigateMonth = useCallback((delta: number) => {
    setDirection(delta);
    setViewMonth((m) => {
      const next = m + delta;
      if (next < 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      if (next > 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return next;
    });
  }, []);

  const toggleDate = useCallback((dateStr: string, forceMode?: 'add' | 'remove') => {
    setBlackoutDates((prev) => {
      const next = new Set(prev);
      const mode = forceMode ?? (prev.has(dateStr) ? 'remove' : 'add');
      if (mode === 'add') {
        next.add(dateStr);
      } else {
        next.delete(dateStr);
      }
      return next;
    });
  }, []);

  const handlePointerDown = useCallback(
    (dateStr: string, inMonth: boolean) => {
      if (!inMonth) return;
      isDragging.current = true;
      dragStartDate.current = dateStr;
      dragMode.current = blackoutDates.has(dateStr) ? 'remove' : 'add';
      toggleDate(dateStr, dragMode.current);
    },
    [blackoutDates, toggleDate]
  );

  const handlePointerEnter = useCallback(
    (dateStr: string, inMonth: boolean) => {
      if (!isDragging.current || !inMonth) return;
      toggleDate(dateStr, dragMode.current);
    },
    [toggleDate]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    dragStartDate.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const ranges = mergeIntoRanges(blackoutDates);
    const result = await saveAvailability(entityId, ranges);
    setSaving(false);
    if (result.ok) {
      setSavedBlackoutDates(new Set(blackoutDates));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error);
    }
  }, [entityId, blackoutDates]);

  const handleDiscard = useCallback(() => {
    setBlackoutDates(new Set(savedBlackoutDates));
    setError(null);
  }, [savedBlackoutDates]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col gap-6"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <StripePattern />

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
          {MONTHS[viewMonth]} {viewYear}
        </h2>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] overflow-hidden select-none">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[oklch(1_0_0/0.06)]">
          {DAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${viewYear}-${viewMonth}`}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
            className="grid grid-cols-7"
          >
            {grid.map(({ dateStr, inMonth }) => {
              const isBlackout = blackoutDates.has(dateStr);
              const isToday = dateStr === today;
              const isPast = dateStr < today;

              return (
                <div
                  key={dateStr}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handlePointerDown(dateStr, inMonth);
                  }}
                  onPointerEnter={() => handlePointerEnter(dateStr, inMonth)}
                  className={`
                    relative aspect-square flex items-center justify-center cursor-pointer
                    border-b border-r border-[oklch(1_0_0/0.03)]
                    transition-colors duration-100
                    ${!inMonth ? 'pointer-events-none' : ''}
                    ${inMonth && !isBlackout ? 'hover:bg-[oklch(1_0_0/0.04)]' : ''}
                  `}
                >
                  {/* Unavailable stripe background */}
                  {isBlackout && inMonth && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0"
                    >
                      <svg className="absolute inset-0 w-full h-full" aria-hidden>
                        <rect width="100%" height="100%" fill="url(#unavailable-stripes)" />
                      </svg>
                      <div className="absolute inset-0 bg-[oklch(1_0_0/0.03)]" />
                    </motion.div>
                  )}

                  {/* Date number */}
                  <span
                    className={`
                      relative z-10 text-sm tabular-nums
                      ${!inMonth ? 'text-[oklch(1_0_0/0.12)]' : ''}
                      ${inMonth && !isBlackout && !isPast ? 'text-[var(--stage-text-primary)]' : ''}
                      ${inMonth && !isBlackout && isPast ? 'text-[var(--stage-text-tertiary)]' : ''}
                      ${inMonth && isBlackout ? 'text-[var(--stage-text-tertiary)] line-through' : ''}
                      ${isToday ? 'font-semibold' : 'font-normal'}
                    `}
                  >
                    {parseInt(dateStr.split('-')[2], 10)}
                  </span>

                  {/* Gig dots + today indicator */}
                  {inMonth && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                      {isToday && (
                        <span className="size-1 rounded-full bg-[var(--stage-text-primary)]" />
                      )}
                      {(gigMap.get(dateStr) ?? []).slice(0, 2).map((g, i) => (
                        <span
                          key={i}
                          className={`size-1.5 rounded-full ${
                            g.status === 'confirmed' ? 'bg-[oklch(0.75_0.15_145)]' :
                            g.status === 'requested' ? 'bg-[oklch(0.75_0.15_55)]' :
                            'bg-[var(--stage-text-tertiary)]'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--stage-text-tertiary)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-[oklch(1_0_0/0.06)]" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-3 rounded border border-[oklch(1_0_0/0.06)] overflow-hidden">
            <svg className="absolute inset-0 w-full h-full" aria-hidden>
              <rect width="100%" height="100%" fill="url(#unavailable-stripes)" />
            </svg>
            <span className="absolute inset-0 bg-[oklch(1_0_0/0.03)]" />
          </span>
          Unavailable
        </span>
      </div>

      {/* Save / Discard controls */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={spring}
            className="flex items-center gap-3"
          >
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 text-sm font-medium text-[var(--stage-text-primary)] bg-[oklch(1_0_0/0.08)] hover:bg-[oklch(1_0_0/0.12)] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-50"
            >
              Discard
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[var(--color-unusonic-error)]"
          >
            {error}
          </motion.p>
        )}
        {success && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[oklch(0.75_0.15_145)]"
          >
            Availability saved
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
