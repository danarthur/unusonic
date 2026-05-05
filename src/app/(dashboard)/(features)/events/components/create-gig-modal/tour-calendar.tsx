'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

/**
 * Multi-select date picker for a Custom series.
 *
 * Interaction model (per Field Expert + User Advocate research, 2026-04-17):
 *   - Primary: tap-to-toggle on every platform. Every cell is always interactive;
 *     the calendar NEVER closes between picks. The one-date-at-a-time pop-up is
 *     the pain point this replaces.
 *   - Secondary: shift-click extends a range from the last-clicked anchor to
 *     the current cell. Desktop-only convention (touch has no modifier).
 *   - Drag-select is deliberately deferred to P1 — User Advocate warned it's a
 *     UX disaster on phones (scroll conflict) and complicates mistake recovery.
 *
 * Layout: two months side-by-side at >=sm; single month with arrow nav below.
 * Week order: Mon-first per production convention (User Advocate research).
 *
 * Selection state uses Stage Engineering's achromatic accent — brightness only,
 * no chroma (matches the pattern-mode weekday strip).
 */

type TourCalendarProps = {
  selectedDates: string[]; // yyyy-MM-dd ISO date strings
  onChange: (next: string[]) => void;
};

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Inclusive date range, sorted ascending, as yyyy-MM-dd strings. */
function enumerateRange(fromIso: string, toIso: string): string[] {
  const from = parseISO(fromIso);
  const to = parseISO(toIso);
  const [start, end] = isBefore(from, to) ? [from, to] : [to, from];
  return eachDayOfInterval({ start, end }).map(ymd);
}

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function TourCalendar({ selectedDates, onChange }: TourCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];

  const toggleDate = (iso: string, shiftKey: boolean) => {
    const prev = selectedDates;
    if (shiftKey && anchor && anchor !== iso) {
      // Shift-click range: add every date between anchor and this cell (inclusive).
      // Intentionally add-only — removing a range would hide the mistap case
      // User Advocate called out (silent bug on tours).
      const range = enumerateRange(anchor, iso);
      const nextSet = new Set(prev);
      for (const d of range) nextSet.add(d);
      const next = [...nextSet].sort();
      const added = next.length - prev.length;
      onChange(next);
      if (added >= 5) {
        // Undo toast for bulk adds — 6s window per research brief.
        toast.success(`Added ${added} dates`, {
          action: { label: 'Undo', onClick: () => onChange(prev) },
          duration: 6000,
        });
      }
      setAnchor(iso);
      return;
    }
    // Plain toggle
    const nextSet = new Set(prev);
    if (nextSet.has(iso)) nextSet.delete(iso);
    else nextSet.add(iso);
    onChange([...nextSet].sort());
    setAnchor(iso);
  };

  const headerSummary = (() => {
    if (sortedDates.length === 0) return 'No dates yet — tap to add, shift-click for range';
    const count = `${sortedDates.length} show${sortedDates.length === 1 ? '' : 's'}`;
    if (!firstDate || !lastDate || firstDate === lastDate) return count;
    return `${count} · ${format(parseISO(firstDate), 'MMM d')} → ${format(parseISO(lastDate), 'MMM d')}`;
  })();

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            className="h-7 w-7 flex items-center justify-center rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(() => startOfMonth(new Date()))}
            className="h-7 px-2 rounded-[var(--stage-radius-input,6px)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
            aria-label="Jump to this month"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
            aria-label="Next month"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
        <span className="stage-label text-[var(--stage-text-tertiary)] min-w-0 truncate text-right">
          {headerSummary}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
        <MonthGrid
          monthDate={viewMonth}
          selectedSet={selectedSet}
          today={today}
          showPast={showPast}
          onToggle={toggleDate}
        />
        <div className="hidden sm:block">
          <MonthGrid
            monthDate={addMonths(viewMonth, 1)}
            selectedSet={selectedSet}
            today={today}
            showPast={showPast}
            onToggle={toggleDate}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[length:var(--stage-input-font-size,13px)]">
        <label className="flex items-center gap-2 text-[var(--stage-text-secondary)] select-none cursor-pointer">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--stage-accent)]"
          />
          Allow past dates
        </label>
        <span className="text-[var(--stage-text-tertiary)] hidden sm:inline">
          Shift-click to range
        </span>
      </div>
    </div>
  );
}

function MonthGrid({
  monthDate,
  selectedSet,
  today,
  showPast,
  onToggle,
}: {
  monthDate: Date;
  selectedSet: Set<string>;
  today: Date;
  showPast: boolean;
  onToggle: (iso: string, shiftKey: boolean) => void;
}) {
  const cells = useMemo(() => {
    const first = startOfMonth(monthDate);
    const last = endOfMonth(monthDate);
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(last, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthDate]);

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-center text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)]">
        {format(monthDate, 'MMMM yyyy')}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_HEADERS.map((l, i) => (
          <div
            key={`${l}-${i}`}
            className="h-5 flex items-center justify-center text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]"
          >
            {l}
          </div>
        ))}
        {cells.map((d) => {
          const iso = ymd(d);
          const isSelected = selectedSet.has(iso);
          const isInMonth = isSameMonth(d, monthDate);
          const isPast = !showPast && isBefore(d, today);
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast}
              onClick={(e) => onToggle(iso, e.shiftKey)}
              aria-pressed={isSelected}
              aria-label={format(d, 'PPP')}
              className={cn(
                'h-9 rounded-[calc(var(--stage-radius-input,6px)-1px)] text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                isSelected
                  ? 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.18)] shadow-sm'
                  : isInMonth
                    ? 'text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] border border-transparent'
                    : 'text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0_/_0.04)] border border-transparent',
                isPast && 'opacity-25 pointer-events-none',
              )}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

