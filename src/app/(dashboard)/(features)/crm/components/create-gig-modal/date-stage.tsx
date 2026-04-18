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
import {
  checkDatesFeasibility,
  type DatedFeasibilityResult,
  type FeasibilityStatus,
} from '../../actions/check-date-feasibility';
import type { SeriesRule, SeriesArchetype } from '@/shared/lib/series-rule';
import { expandSeriesRule, SERIES_ARCHETYPES } from '@/shared/lib/series-rule';
import { DEAL_ARCHETYPES, DEAL_ARCHETYPE_LABELS } from '../../actions/deal-model';

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

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EVENT_ARCHETYPES = DEAL_ARCHETYPES.map((value) => ({ value, label: DEAL_ARCHETYPE_LABELS[value] }));

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
 * Compose an RRULE string from a weekly pattern (one weekday) + inclusive
 * start/end dates. Expand to yyyy-MM-dd date strings using the `rrule`
 * package — this runs once on user edits and the result is persisted to
 * series_rule.rdates. Pass tz so the rule is timezone-aware.
 */
function buildWeeklyPatternDates(
  weekday: number,
  startIso: string,
  endIso: string
): { rrule: string; dates: string[] } {
  if (!startIso || !endIso) return { rrule: '', dates: [] };
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { rrule: '', dates: [] };
  if (end < start) return { rrule: '', dates: [] };

  const WEEKDAY_MAP: Weekday[] = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [WEEKDAY_MAP[weekday]],
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
  const archetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const seriesArchetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
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

  // ── Series builder
  const [seriesMode, setSeriesMode] = useState<'pattern' | 'custom'>('pattern');
  const [patternWeekday, setPatternWeekday] = useState<number>(6); // Saturday default
  const [patternStart, setPatternStart] = useState('');
  const [patternEnd, setPatternEnd] = useState('');
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
      const result = buildWeeklyPatternDates(patternWeekday, patternStart, patternEnd);
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
  }, [dateKind, seriesMode, patternWeekday, patternStart, patternEnd, customDates, extraDates, exdates, tz]);

  // Hoist computedSeriesRule to parent whenever it changes.
  useEffect(() => {
    setSeriesRule(computedSeriesRule);
  }, [computedSeriesRule, setSeriesRule]);

  // Reset builder fields when switching away from series.
  useEffect(() => {
    if (dateKind !== 'series') {
      setExdates([]);
      setExtraDates([]);
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

  // Close calendars on outside click
  useEffect(() => {
    if (!singleCalOpen && !multiStartCalOpen && !multiEndCalOpen && !seriesStartCalOpen && !seriesEndCalOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (singleCalOpen && singleCalRef.current?.contains(t)) return;
      if (multiStartCalOpen && multiStartRef.current?.contains(t)) return;
      if (multiEndCalOpen && multiEndRef.current?.contains(t)) return;
      if (seriesStartCalOpen && seriesStartRef.current?.contains(t)) return;
      if (seriesEndCalOpen && seriesEndRef.current?.contains(t)) return;
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
            <ArchetypeSelect
              value={eventArchetype}
              onChange={setEventArchetype}
              triggerRef={archetypeTriggerRef}
              open={archetypeOpen}
              setOpen={setArchetypeOpen}
            />
          </div>
          <AnimatePresence>
            {singleCalOpen && (
              <motion.div
                key="single-cal"
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
            <ArchetypeSelect
              value={eventArchetype}
              onChange={setEventArchetype}
              triggerRef={archetypeTriggerRef}
              open={archetypeOpen}
              setOpen={setArchetypeOpen}
            />
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
            <ArchetypeSelect
              value={eventArchetype}
              onChange={setEventArchetype}
              triggerRef={archetypeTriggerRef}
              open={archetypeOpen}
              setOpen={setArchetypeOpen}
            />
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
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3 items-end">
              <div>
                <label className="block stage-label mb-1.5">Every</label>
                <WeekdayPill value={patternWeekday} onChange={setPatternWeekday} />
              </div>
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
          ) : (
            <CustomDatesBuilder
              customDates={customDates}
              setCustomDates={setCustomDates}
            />
          )}

          <AnimatePresence>
            {(seriesStartCalOpen || seriesEndCalOpen) && (
              <motion.div
                key="series-cal"
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

function WeekdayPill({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-w-[110px] items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
          open
            ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
            : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]'
        )}
      >
        <span className="flex-1 min-w-0 truncate text-[var(--stage-text-primary)] tracking-tight">{WEEKDAY_FULL[value]}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
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
                width: Math.max(rect.width, 140),
                ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
              };
            })()}
            className="max-h-[240px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
          >
            {WEEKDAY_FULL.map((wd, i) => (
              <button
                key={wd}
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onChange(i);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors',
                  value === i
                    ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] font-medium'
                    : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                )}
              >
                {wd}
              </button>
            ))}
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ArchetypeSelect({
  value,
  onChange,
  triggerRef,
  open,
  setOpen,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  setOpen: (v: boolean | ((o: boolean) => boolean)) => void;
}) {
  return (
    <div>
      <label className="block stage-label mb-1.5">Show type</label>
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
            {value ? DEAL_ARCHETYPE_LABELS[value as keyof typeof DEAL_ARCHETYPE_LABELS] : 'Select type'}
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
              className="max-h-[240px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
            >
              {EVENT_ARCHETYPES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onChange(a.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center px-3 py-2.5 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0',
                    value === a.value
                      ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] font-medium'
                      : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  {a.label}
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

function CustomDatesBuilder({
  customDates,
  setCustomDates,
}: {
  customDates: string[];
  setCustomDates: (updater: (prev: string[]) => string[]) => void;
}) {
  const [calOpen, setCalOpen] = useState(false);
  const [pending, setPending] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...customDates].sort(), [customDates]);
  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <div className="flex flex-wrap gap-1.5">
        {sorted.length === 0 && (
          <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">No dates yet — tap to add.</span>
        )}
        {sorted.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setCustomDates((xs) => xs.filter((x) => x !== d))}
            className="group flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] hover:bg-[oklch(1_0_0_/_0.08)] text-[length:var(--stage-input-font-size,13px)]"
          >
            <span className="text-[var(--stage-text-primary)]">{format(parseLocalDateString(d), 'EEE MMM d')}</span>
            <X size={12} className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" strokeWidth={1.5} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCalOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] border border-dashed border-[oklch(1_0_0_/_0.14)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
        >
          <Plus size={12} strokeWidth={1.5} />
          Add date
        </button>
      </div>
      <AnimatePresence>
        {calOpen && (
          <motion.div
            key="custom-dates-cal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_NAV_CROSSFADE}
            className="w-full min-w-0"
          >
            <CalendarPanel
              value={pending}
              onChange={(d) => {
                setPending(d);
                setCustomDates((xs) => (xs.includes(d) ? xs : [...xs, d]));
                setCalOpen(false);
              }}
              onClose={() => setCalOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
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
