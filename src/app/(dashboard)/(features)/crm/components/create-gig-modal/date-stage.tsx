'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronDown, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { RRule, Weekday, Frequency } from 'rrule';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { TimePicker } from '@/shared/ui/time-picker';
import { CalendarPanel, parseLocalDateString } from '../ceramic-date-picker';
import { TourCalendar } from './tour-calendar';
import {
  checkDatesFeasibility,
  type DatedFeasibilityResult,
  type FeasibilityStatus,
} from '../../actions/check-date-feasibility';
import type { SeriesRule, SeriesArchetype } from '@/shared/lib/series-rule';
import { expandSeriesRule, SERIES_ARCHETYPES } from '@/shared/lib/series-rule';
import { EventTypeCombobox } from './event-type-combobox';

export type DateKind = 'single' | 'multi_day' | 'series';

export type DateStageProps = {
  // Common
  eventArchetype: string | null;
  setEventArchetype: (v: string | null) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  // Kind
  dateKind: DateKind;
  setDateKind: (k: DateKind) => void;
  // Single / multi-day
  eventDate: string;
  setEventDate: (v: string) => void;
  proposedEndDate: string;
  setProposedEndDate: (v: string) => void;
  // Series — the computed SeriesRule and the archetype
  seriesRule: SeriesRule | null;
  setSeriesRule: (r: SeriesRule | null) => void;
  seriesArchetype: SeriesArchetype | null;
  setSeriesArchetype: (a: SeriesArchetype | null) => void;
};

const TAB_LABELS: Record<DateKind, string> = {
  single: 'Single day',
  multi_day: 'Multi-day',
  series: 'Series',
};

/**
 * Weekday indices are 0=Sunday..6=Saturday (matches JS Date.getDay and rrule's
 * SU,MO,TU,WE,TH,FR,SA constants). The chip strip RENDERS Mon-first per
 * production-industry convention (see User Advocate research) — owners think
 * in work-week order, not consumer-calendar order — but the underlying data is
 * still 0-6 Sun-indexed so we never drift from the RRULE vocabulary.
 */
const WEEKDAY_CHIP_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // Mon, Tue, ..., Sun
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Industry-named presets. Naming follows production vocabulary, not consumer
 * calendar vocabulary: "Weekend run" = Fri+Sat because that's how production
 * owners say it (nightclub DJs and wedding weekends both hit Sat hardest, Fri
 * as the runup). "Three-day" = Thu+Fri+Sat for festivals / nightclub runs.
 * "Weekday" = Mon-Fri for corporate lunch series and conferences.
 *
 * Workspaces can override in P2 if owners want per-shop presets. For now these
 * three cover ~80% of multi-day residency patterns.
 */
const PATTERN_PRESETS: Array<{ label: string; days: number[] }> = [
  { label: 'Weekend run', days: [5, 6] },      // Fri, Sat
  { label: 'Three-day', days: [4, 5, 6] },      // Thu, Fri, Sat
  { label: 'Weekday', days: [1, 2, 3, 4, 5] },  // Mon-Fri
];

/**
 * Resolve the browser's IANA timezone so series rules carry it forward to the
 * RPC. Safe across SSR hydration — returns 'UTC' server-side then updates on
 * mount; rrule expansion runs client-only anyway.
 */
function resolveBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Compose an RRULE string from a weekly pattern (1+ weekdays) + inclusive
 * start/end dates. Expand to yyyy-MM-dd date strings using the `rrule`
 * package — runs on user edits and the result is persisted to
 * series_rule.rdates. Empty weekdays array returns no dates (treat as invalid).
 */
function buildWeeklyPatternDates(
  weekdays: number[],
  startIso: string,
  endIso: string,
  intervalWeeks: number = 1
): { rrule: string; dates: string[] } {
  if (weekdays.length === 0 || !startIso || !endIso) return { rrule: '', dates: [] };
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { rrule: '', dates: [] };
  if (end < start) return { rrule: '', dates: [] };

  const interval = Math.max(1, Math.min(52, Math.floor(intervalWeeks || 1)));
  const WEEKDAY_MAP: Weekday[] = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
  // Dedup + sort so the serialized RRULE string is stable regardless of click order.
  const uniqSorted = Array.from(new Set(weekdays)).sort((a, b) => a - b);
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: uniqSorted.map((d) => WEEKDAY_MAP[d]),
    interval,
    dtstart: start,
    until: end,
  });

  const instances = rule.all().map((d) => d.toISOString().slice(0, 10));
  return { rrule: rule.toString(), dates: instances };
}

function statusColor(status: FeasibilityStatus | undefined): string {
  switch (status) {
    case 'clear':
      return 'var(--color-unusonic-success, oklch(0.74 0.17 142))';
    case 'caution':
      return 'var(--color-unusonic-warning, oklch(0.80 0.14 73))';
    case 'critical':
      return 'var(--color-unusonic-error, oklch(0.70 0.18 28))';
    default:
      return 'var(--stage-text-tertiary)';
  }
}

export function DateStage({
  eventArchetype,
  setEventArchetype,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  dateKind,
  setDateKind,
  eventDate,
  setEventDate,
  proposedEndDate,
  setProposedEndDate,
  seriesRule,
  setSeriesRule,
  seriesArchetype,
  setSeriesArchetype,
}: DateStageProps) {
  // ── Refs for portaled dropdowns
  const seriesArchetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const [seriesArchetypeOpen, setSeriesArchetypeOpen] = useState(false);

  // ── Single-day calendar expansion
  const [singleCalOpen, setSingleCalOpen] = useState(false);
  const [multiStartCalOpen, setMultiStartCalOpen] = useState(false);
  const [multiEndCalOpen, setMultiEndCalOpen] = useState(false);
  const [seriesStartCalOpen, setSeriesStartCalOpen] = useState(false);
  const [seriesEndCalOpen, setSeriesEndCalOpen] = useState(false);
  const singleCalRef = useRef<HTMLDivElement>(null);
  const multiStartRef = useRef<HTMLDivElement>(null);
  const multiEndRef = useRef<HTMLDivElement>(null);
  const seriesStartRef = useRef<HTMLDivElement>(null);
  const seriesEndRef = useRef<HTMLDivElement>(null);
  // Dedicated refs for each CalendarPanel so outside-click handling treats
  // the panel (prev/next arrows, day cells) as "inside" — the panel renders
  // as a sibling to the trigger button, not a child, so the trigger's ref
  // alone misses it.
  const singleCalPanelRef = useRef<HTMLDivElement>(null);
  const multiCalPanelRef = useRef<HTMLDivElement>(null);
  const seriesCalPanelRef = useRef<HTMLDivElement>(null);

  // ── Series builder
  const [seriesMode, setSeriesMode] = useState<'pattern' | 'custom'>('pattern');
  const [patternWeekdays, setPatternWeekdays] = useState<number[]>([6]); // Saturday default
  const [patternStart, setPatternStart] = useState('');
  const [patternEnd, setPatternEnd] = useState('');
  /** RRULE INTERVAL — 1 = every week, 2 = every other week, 3 = every 3rd week, … */
  const [patternInterval, setPatternInterval] = useState<number>(1);
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [exdates, setExdates] = useState<string[]>([]);
  const [extraDates, setExtraDates] = useState<string[]>([]); // add-one-off dates
  const [tz] = useState(() => resolveBrowserTimezone());

  // ── Per-date feasibility (series + multi-day)
  const [perDateFeasibility, setPerDateFeasibility] = useState<Record<string, DatedFeasibilityResult>>({});
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);

  // Compute the SeriesRule from underlying state reactively and hoist to parent.
  // Pattern mode: rrule + expanded rdates + extraDates - exdates.
  // Custom mode:  rrule = null, rdates = customDates, minus exdates.
  const computedSeriesRule: SeriesRule | null = useMemo(() => {
    if (dateKind !== 'series') return null;

    let rrule: string | null = null;
    let rdates: string[] = [];

    if (seriesMode === 'pattern') {
      const result = buildWeeklyPatternDates(patternWeekdays, patternStart, patternEnd, patternInterval);
      rrule = result.rrule || null;
      rdates = result.dates;
    } else {
      rdates = [...customDates];
    }

    // Always union with one-off extras, dedup.
    const seen = new Set<string>();
    const unified: string[] = [];
    for (const d of [...rdates, ...extraDates]) {
      if (seen.has(d)) continue;
      seen.add(d);
      unified.push(d);
    }
    unified.sort();

    if (unified.length === 0) return null;

    const ex = Array.from(new Set(exdates));
    const primary = unified.find((d) => !ex.includes(d)) ?? unified[0];

    return {
      rrule,
      rdates: unified,
      exdates: ex,
      tz,
      primary_date: primary,
    };
  }, [dateKind, seriesMode, patternWeekdays, patternStart, patternEnd, patternInterval, customDates, extraDates, exdates, tz]);

  // Hoist computedSeriesRule to parent whenever it changes.
  useEffect(() => {
    setSeriesRule(computedSeriesRule);
  }, [computedSeriesRule, setSeriesRule]);

  // Reset builder fields when switching away from series.
  useEffect(() => {
    if (dateKind !== 'series') {
      setExdates([]);
      setExtraDates([]);
      setPatternInterval(1);
    }
  }, [dateKind]);

  // Run per-date feasibility whenever series_rule or multi-day range changes.
  // Debounced at 200ms so the user isn't hammering the server while tweaking.
  const feasibilityInputs = useMemo(() => {
    if (dateKind === 'series' && computedSeriesRule) {
      return expandSeriesRule(computedSeriesRule);
    }
    if (dateKind === 'multi_day' && eventDate && proposedEndDate) {
      return [eventDate, proposedEndDate].filter((d, i, arr) => arr.indexOf(d) === i);
    }
    return [] as string[];
  }, [dateKind, computedSeriesRule, eventDate, proposedEndDate]);

  useEffect(() => {
    if (feasibilityInputs.length === 0) {
      setPerDateFeasibility({});
      return;
    }
    let cancelled = false;
    setFeasibilityLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await checkDatesFeasibility(feasibilityInputs);
        if (cancelled) return;
        const map: Record<string, DatedFeasibilityResult> = {};
        for (const r of results) map[r.date] = r;
        setPerDateFeasibility(map);
      } finally {
        if (!cancelled) setFeasibilityLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [feasibilityInputs]);

  // Close calendars on outside click. Each open calendar has two "inside"
  // regions: its trigger button wrapper AND the CalendarPanel itself (rendered
  // as a sibling). Without the panel check, clicking the month nav arrows
  // closes the picker, which is what a user would reasonably call a bug.
  useEffect(() => {
    if (!singleCalOpen && !multiStartCalOpen && !multiEndCalOpen && !seriesStartCalOpen && !seriesEndCalOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (singleCalOpen) {
        if (singleCalRef.current?.contains(t)) return;
        if (singleCalPanelRef.current?.contains(t)) return;
      }
      if (multiStartCalOpen || multiEndCalOpen) {
        if (multiStartRef.current?.contains(t)) return;
        if (multiEndRef.current?.contains(t)) return;
        if (multiCalPanelRef.current?.contains(t)) return;
      }
      if (seriesStartCalOpen || seriesEndCalOpen) {
        if (seriesStartRef.current?.contains(t)) return;
        if (seriesEndRef.current?.contains(t)) return;
        if (seriesCalPanelRef.current?.contains(t)) return;
      }
      setSingleCalOpen(false);
      setMultiStartCalOpen(false);
      setMultiEndCalOpen(false);
      setSeriesStartCalOpen(false);
      setSeriesEndCalOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [singleCalOpen, multiStartCalOpen, multiEndCalOpen, seriesStartCalOpen, seriesEndCalOpen]);

  // ── Tab pill styling (matches existing modal pattern)
  const pillBase =
    'flex-1 rounded-[var(--stage-radius-input,6px)] px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]';
  const pillActive = 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.12)] shadow-sm';
  const pillInactive =
    'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] border border-transparent';

  const activeDatesInSeries = computedSeriesRule ? expandSeriesRule(computedSeriesRule) : [];
  const seriesClearCount = activeDatesInSeries.filter((d) => perDateFeasibility[d]?.status === 'clear').length;
  const seriesConflictCount = activeDatesInSeries.filter(
    (d) => perDateFeasibility[d]?.status === 'caution' || perDateFeasibility[d]?.status === 'critical'
  ).length;

  return (
    <motion.div
      key="date-stage"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col min-w-0"
      style={{ gap: 'var(--stage-gap-wide, 12px)' }}
    >
      {/* ── Tab pills ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input,6px)] bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)]">
        {(['single', 'multi_day', 'series'] as DateKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setDateKind(k)}
            className={cn(pillBase, dateKind === k ? pillActive : pillInactive)}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {/* ── Single day ──────────────────────────────────────────────────── */}
      {dateKind === 'single' && (
        <div className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div ref={singleCalRef}>
              <label className="block stage-label mb-1.5">Proposed date</label>
              <button
                type="button"
                onClick={() => setSingleCalOpen((o) => !o)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
                  singleCalOpen
                    ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
                    : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]'
                )}
              >
                <Calendar size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
                <span className={cn('flex-1 min-w-0 truncate tracking-tight', eventDate ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
                  {eventDate ? format(parseLocalDateString(eventDate), 'PPP') : 'Select date'}
                </span>
                <ChevronDown size={14} className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', singleCalOpen && 'rotate-180')} aria-hidden />
              </button>
            </div>
            <EventTypeCombobox value={eventArchetype} onChange={setEventArchetype} />
          </div>
          <AnimatePresence>
            {singleCalOpen && (
              <motion.div
                key="single-cal"
                ref={singleCalPanelRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_NAV_CROSSFADE}
                className="w-full min-w-0"
              >
                <CalendarPanel
                  value={eventDate}
                  onChange={(d) => {
                    setEventDate(d);
                    setSingleCalOpen(false);
                  }}
                  onClose={() => setSingleCalOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {eventDate && !singleCalOpen && (
            <TimeRow startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} />
          )}
        </div>
      )}

      {/* ── Multi-day ──────────────────────────────────────────────────── */}
      {dateKind === 'multi_day' && (
        <div className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div ref={multiStartRef}>
              <label className="block stage-label mb-1.5">Start date</label>
              <DateButton
                value={eventDate}
                placeholder="Select start"
                open={multiStartCalOpen}
                onToggle={() => setMultiStartCalOpen((o) => !o)}
              />
            </div>
            <div ref={multiEndRef}>
              <label className="block stage-label mb-1.5">End date</label>
              <DateButton
                value={proposedEndDate}
                placeholder="Select end"
                open={multiEndCalOpen}
                onToggle={() => setMultiEndCalOpen((o) => !o)}
              />
            </div>
          </div>
          <AnimatePresence>
            {(multiStartCalOpen || multiEndCalOpen) && (
              <motion.div
                key="multi-cal"
                ref={multiCalPanelRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_NAV_CROSSFADE}
                className="w-full min-w-0"
              >
                <CalendarPanel
                  value={multiStartCalOpen ? eventDate : proposedEndDate}
                  onChange={(d) => {
                    if (multiStartCalOpen) {
                      setEventDate(d);
                      setMultiStartCalOpen(false);
                      if (proposedEndDate && proposedEndDate < d) setProposedEndDate(d);
                    } else {
                      setProposedEndDate(d);
                      setMultiEndCalOpen(false);
                    }
                  }}
                  onClose={() => {
                    setMultiStartCalOpen(false);
                    setMultiEndCalOpen(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EventTypeCombobox value={eventArchetype} onChange={setEventArchetype} />
            {eventDate && proposedEndDate && (
              <MultiDayBadge
                feasibility={perDateFeasibility}
                startDate={eventDate}
                endDate={proposedEndDate}
                loading={feasibilityLoading}
              />
            )}
          </div>
          {eventDate && proposedEndDate && (
            <TimeRow startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} />
          )}
        </div>
      )}

      {/* ── Series ─────────────────────────────────────────────────────── */}
      {dateKind === 'series' && (
        <div className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EventTypeCombobox value={eventArchetype} onChange={setEventArchetype} />
            <SeriesArchetypeSelect
              value={seriesArchetype}
              onChange={setSeriesArchetype}
              triggerRef={seriesArchetypeTriggerRef}
              open={seriesArchetypeOpen}
              setOpen={setSeriesArchetypeOpen}
            />
          </div>

          {/* Pattern / Custom toggle */}
          <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input,6px)] bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)]">
            <button
              type="button"
              onClick={() => setSeriesMode('pattern')}
              className={cn(pillBase, seriesMode === 'pattern' ? pillActive : pillInactive)}
            >
              Pattern
            </button>
            <button
              type="button"
              onClick={() => setSeriesMode('custom')}
              className={cn(pillBase, seriesMode === 'custom' ? pillActive : pillInactive)}
            >
              Custom dates
            </button>
          </div>

          {seriesMode === 'pattern' ? (
            <div className="flex flex-col gap-3 min-w-0">
              {/* Weekday strip + presets + interval */}
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <label className="stage-label shrink-0">Every</label>
                    <IntervalStepper
                      value={patternInterval}
                      onChange={setPatternInterval}
                    />
                    <span className="stage-label shrink-0 text-[var(--stage-text-tertiary)]">
                      {patternInterval === 1 ? 'week on' : 'weeks on'}
                    </span>
                  </div>
                  <PresetRow
                    activeDays={patternWeekdays}
                    onApply={setPatternWeekdays}
                  />
                </div>
                <WeekdayStrip
                  value={patternWeekdays}
                  onChange={setPatternWeekdays}
                />
              </div>
              {/* Range */}
              <div className="grid grid-cols-2 gap-3">
                <div ref={seriesStartRef}>
                  <label className="block stage-label mb-1.5">From</label>
                  <DateButton
                    value={patternStart}
                    placeholder="Start"
                    open={seriesStartCalOpen}
                    onToggle={() => setSeriesStartCalOpen((o) => !o)}
                  />
                </div>
                <div ref={seriesEndRef}>
                  <label className="block stage-label mb-1.5">To</label>
                  <DateButton
                    value={patternEnd}
                    placeholder="End"
                    open={seriesEndCalOpen}
                    onToggle={() => setSeriesEndCalOpen((o) => !o)}
                  />
                </div>
              </div>
              {/* Inline pattern-summary — the guardrail: spell out the weekdays
                  right next to the picker so a "Fri" in a Sat-only series is
                  immediately catchable without scrolling to the chip strip. */}
              {patternWeekdays.length > 0 && (
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  {summarizeWeekdays(patternWeekdays, patternInterval)}
                </span>
              )}
              {patternWeekdays.length === 0 && (
                <span className="stage-label text-[var(--color-unusonic-warning,oklch(0.80_0.14_73))]">
                  Select at least one weekday.
                </span>
              )}
            </div>
          ) : (
            <TourCalendar
              selectedDates={customDates}
              onChange={(next) => setCustomDates(() => next)}
            />
          )}

          <AnimatePresence>
            {(seriesStartCalOpen || seriesEndCalOpen) && (
              <motion.div
                key="series-cal"
                ref={seriesCalPanelRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_NAV_CROSSFADE}
                className="w-full min-w-0"
              >
                <CalendarPanel
                  value={seriesStartCalOpen ? patternStart : patternEnd}
                  onChange={(d) => {
                    if (seriesStartCalOpen) {
                      setPatternStart(d);
                      setSeriesStartCalOpen(false);
                      if (patternEnd && patternEnd < d) setPatternEnd(d);
                    } else {
                      setPatternEnd(d);
                      setSeriesEndCalOpen(false);
                    }
                  }}
                  onClose={() => {
                    setSeriesStartCalOpen(false);
                    setSeriesEndCalOpen(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date chips */}
          {computedSeriesRule && activeDatesInSeries.length > 0 && (
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="stage-label">
                  {activeDatesInSeries.length} show{activeDatesInSeries.length === 1 ? '' : 's'}
                  {exdates.length > 0 ? ` · ${exdates.length} removed` : ''}
                </span>
                {seriesConflictCount > 0 ? (
                  <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)]">
                    {seriesClearCount} clear · {seriesConflictCount} conflict{seriesConflictCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)]">
                    {feasibilityLoading ? 'Checking availability…' : `${seriesClearCount} clear`}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {activeDatesInSeries.map((d) => {
                  const fb = perDateFeasibility[d];
                  const color = statusColor(fb?.status);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExdates((xs) => [...xs, d])}
                      className="group shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] hover:bg-[oklch(1_0_0_/_0.08)] text-[length:var(--stage-input-font-size,13px)] tracking-tight"
                      title={fb?.message ?? 'Click to remove from series'}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[var(--stage-text-primary)]">
                        {format(parseLocalDateString(d), 'EEE MMM d')}
                      </span>
                      <X size={12} className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" strokeWidth={1.5} />
                    </button>
                  );
                })}
                <AddDateChip onAdd={(d) => setExtraDates((xs) => (xs.includes(d) ? xs : [...xs, d]))} />
              </div>
            </div>
          )}

          {computedSeriesRule && (
            <TimeRow startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} labelSuffix="(applied to each show)" />
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TimeRow({
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  labelSuffix,
}: {
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  labelSuffix?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 overflow-hidden">
      <div>
        <label className="block stage-label mb-1.5">
          Start time{labelSuffix ? <span className="text-[var(--stage-text-tertiary)] font-normal ml-1.5">{labelSuffix}</span> : null}
        </label>
        <TimePicker value={startTime || null} onChange={(v) => setStartTime(v ?? '')} placeholder="Start time" context="evening" />
      </div>
      <div>
        <label className="block stage-label mb-1.5">End time</label>
        <TimePicker value={endTime || null} onChange={(v) => setEndTime(v ?? '')} placeholder="End time" context="evening" />
      </div>
    </div>
  );
}

function DateButton({
  value,
  placeholder,
  open,
  onToggle,
}: {
  value: string;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
        open
          ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
          : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]'
      )}
    >
      <Calendar size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
      <span className={cn('flex-1 min-w-0 truncate tracking-tight', value ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
        {value ? format(parseLocalDateString(value), 'PPP') : placeholder}
      </span>
      <ChevronDown size={14} className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', open && 'rotate-180')} aria-hidden />
    </button>
  );
}

/**
 * Weekday toggle strip. Seven equal-width chips in Mon-first production order.
 * Selected state is a fill on the --ctx-card surface (achromatic brightness
 * accent per Stage Engineering); unselected chips are recessed on --ctx-well.
 *
 * Keyboard: roving tabindex. Arrow keys move focus; Space/Enter toggles;
 * Home / End jump to Mon / Sun.
 */
function WeekdayStrip({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort((a, b) => a - b));
  };
  const stripRef = useRef<HTMLDivElement>(null);

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>, idxInOrder: number) => {
    if (!stripRef.current) return;
    const buttons = Array.from(stripRef.current.querySelectorAll<HTMLButtonElement>('button[data-weekday-chip]'));
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idxInOrder + 1) % buttons.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idxInOrder - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = buttons.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      buttons[nextIdx]?.focus();
    }
  };

  return (
    <div
      ref={stripRef}
      role="group"
      aria-label="Repeats on"
      className="grid grid-cols-7 gap-1 min-w-0 p-1 rounded-[var(--stage-radius-input,6px)] bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)]"
    >
      {WEEKDAY_CHIP_ORDER.map((day, i) => {
        const on = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            data-weekday-chip
            role="switch"
            aria-checked={on}
            aria-label={WEEKDAY_FULL[day]}
            onClick={() => toggle(day)}
            onKeyDown={(e) => handleKey(e, i)}
            className={cn(
              'h-[calc(var(--stage-input-height,34px)-4px)] min-w-0 rounded-[calc(var(--stage-radius-input,6px)-2px)] border text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              on
                ? 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border-[oklch(1_0_0_/_0.14)] shadow-sm'
                : 'bg-transparent text-[var(--stage-text-secondary)] border-transparent hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
          >
            {WEEKDAY_SHORT[day]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Preset quick-applies above the weekday strip. Tapping a preset whose
 * selection already matches clears the weekdays — presets act as toggles
 * rather than one-shot commits, per the Field Expert + User Advocate brief.
 */
function PresetRow({
  activeDays,
  onApply,
}: {
  activeDays: number[];
  onApply: (days: number[]) => void;
}) {
  const active = useMemo(() => new Set(activeDays), [activeDays]);
  const matches = (days: number[]) =>
    days.length === active.size && days.every((d) => active.has(d));
  return (
    <div className="flex items-center gap-1 shrink-0">
      {PATTERN_PRESETS.map((p) => {
        const on = matches(p.days);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onApply(on ? [] : p.days)}
            className={cn(
              'px-2 py-0.5 rounded-[var(--stage-radius-input,6px)] text-[11px] tracking-tight transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              on
                ? 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.14)]'
                : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] border border-transparent',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact numeric stepper for RRULE INTERVAL. Min 1, max 52. Always shows a
 * value; defaults to 1. Keyboard: ArrowUp/ArrowDown adjusts by 1.
 */
function IntervalStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(52, Math.floor(n || 1)));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') return;
    onChange(clamp(parseInt(raw, 10)));
  };
  return (
    <div className="flex items-center rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] h-[calc(var(--stage-input-height,34px)-4px)] px-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        className="px-1.5 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] disabled:opacity-30 disabled:pointer-events-none leading-none text-[length:var(--stage-input-font-size,13px)]"
        aria-label="Decrease interval"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={52}
        value={value}
        onChange={handleChange}
        className="w-7 bg-transparent text-center text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="Week interval"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= 52}
        className="px-1.5 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] disabled:opacity-30 disabled:pointer-events-none leading-none text-[length:var(--stage-input-font-size,13px)]"
        aria-label="Increase interval"
      >
        +
      </button>
    </div>
  );
}

/**
 * Collapse a weekday selection + interval into a human phrase. Mirrors how
 * production owners say it out loud so the UI confirms their mental model
 * before they commit dates. Examples (interval = 1):
 *   [6]            → "Every Saturday"
 *   [5,6]          → "Every Friday & Saturday"
 *   [1,2,3,4,5]    → "Every weekday"
 * Examples (interval = 2):
 *   [6]            → "Every other Saturday"
 *   [5,6]          → "Every other Friday & Saturday"
 * Examples (interval ≥ 3):
 *   [6]            → "Every 3rd Saturday"
 */
function summarizeWeekdays(days: number[], interval: number = 1): string {
  if (days.length === 0) return '';
  const set = new Set(days);

  const prefix = (() => {
    if (interval <= 1) return 'Every ';
    if (interval === 2) return 'Every other ';
    return `Every ${ordinal(interval)} `;
  })();

  // Named phrases — only use them for interval=1 because "Every other weekday"
  // is both grammatically fine and semantically ambiguous (bi-weekly? alternate
  // weekdays?). Safer to fall through to the explicit list when interval > 1.
  if (interval === 1) {
    if (set.size === 7) return 'Every day';
    if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Every weekday';
    if (set.size === 2 && set.has(5) && set.has(6)) return 'Every weekend (Fri & Sat)';
    if (set.size === 3 && [4, 5, 6].every((d) => set.has(d))) return 'Every Thu, Fri, Sat';
  }

  const labels = Array.from(set).sort((a, b) => a - b).map((d) => WEEKDAY_FULL[d]);
  if (labels.length === 1) return `${prefix}${labels[0]}`;
  if (labels.length === 2) return `${prefix}${labels[0]} & ${labels[1]}`;
  const short = Array.from(set).sort((a, b) => a - b).map((d) => WEEKDAY_FULL[d].slice(0, 3));
  return `${prefix}${short.join(', ')}`;
}

/** English ordinal suffix. Handles 1st/2nd/3rd and 11th–13th edge cases. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function SeriesArchetypeSelect({
  value,
  onChange,
  triggerRef,
  open,
  setOpen,
}: {
  value: SeriesArchetype | null;
  onChange: (v: SeriesArchetype | null) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  setOpen: (v: boolean | ((o: boolean) => boolean)) => void;
}) {
  const labelMap: Record<SeriesArchetype, string> = {
    residency: 'Residency',
    tour: 'Tour',
    run: 'Run',
    weekend: 'Weekend',
    custom: 'Custom',
  };
  return (
    <div>
      <label className="block stage-label mb-1.5">Series kind (optional)</label>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
            open
              ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
              : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]'
          )}
        >
          <span className={cn('flex-1 min-w-0 truncate tracking-tight', value ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
            {value ? labelMap[value] : 'Unspecified'}
          </span>
          <ChevronDown size={14} className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', open && 'rotate-180')} aria-hidden />
        </button>
        {open && createPortal(
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={STAGE_LIGHT}
              data-surface="raised"
              onMouseDown={(e) => e.stopPropagation()}
              style={(() => {
                const rect = triggerRef.current?.getBoundingClientRect();
                if (!rect) return {};
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropUp = spaceBelow < 260;
                return {
                  position: 'fixed' as const,
                  left: rect.left,
                  width: rect.width,
                  ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
                };
              })()}
              className="max-h-[220px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2.5 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight',
                  !value ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]',
                )}
              >
                Unspecified
              </button>
              {SERIES_ARCHETYPES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onChange(a);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center px-3 py-2.5 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight',
                    value === a
                      ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] font-medium'
                      : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  {labelMap[a]}
                </button>
              ))}
            </motion.div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

function AddDateChip({ onAdd }: { onAdd: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-[var(--stage-radius-input,6px)] border border-dashed border-[oklch(1_0_0_/_0.14)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
      >
        <Plus size={12} strokeWidth={1.5} />
        Add date
      </button>
      {open && (
        <div className="w-full">
          <CalendarPanel
            value=""
            onChange={(d) => {
              onAdd(d);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

function MultiDayBadge({
  feasibility,
  startDate,
  endDate,
  loading,
}: {
  feasibility: Record<string, DatedFeasibilityResult>;
  startDate: string;
  endDate: string;
  loading: boolean;
}) {
  // Summarize worst-case status across the two ends
  const statuses: FeasibilityStatus[] = [feasibility[startDate]?.status, feasibility[endDate]?.status]
    .filter((x): x is FeasibilityStatus => typeof x === 'string');
  const rank: Record<FeasibilityStatus, number> = { clear: 0, caution: 1, critical: 2 };
  const worst: FeasibilityStatus | null = statuses.length === 0
    ? null
    : (statuses.reduce((a, b) => (rank[b] > rank[a] ? b : a)) as FeasibilityStatus);
  return (
    <div className="flex items-end h-[var(--stage-input-height,34px)] pb-1 text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)]">
      {loading ? (
        'Checking availability…'
      ) : worst ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(worst) }} />
          {feasibility[worst === feasibility[startDate]?.status ? startDate : endDate]?.message ?? 'Date range checked.'}
        </span>
      ) : null}
    </div>
  );
}
