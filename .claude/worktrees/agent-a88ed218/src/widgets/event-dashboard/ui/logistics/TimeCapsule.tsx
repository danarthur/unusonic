'use client';

import React, { useEffect, useMemo } from 'react';
import { Controller, type Control, type Path, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { format, differenceInCalendarDays } from 'date-fns';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { CeramicDatePicker } from '@/app/(dashboard)/(features)/crm/components/ceramic-date-picker';
import { CeramicSwitch } from '@/shared/ui/switch';
import { usePreferences } from '@/shared/ui/providers/PreferencesContext';
import { Calendar, Clock, Package, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** Form slice used by TimeCapsule (date/time fields only). Military time is site-wide in Settings. */
export interface TimeCapsuleFormSlice {
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  set_by_time: boolean;
  set_time: string; // extra time input when "Set by time" is checked (before start time)
  multi_day: boolean;
  show_load_in_out: boolean;
  load_in_date: string;
  load_in_time: string;
  load_out_date: string;
  load_out_time: string;
}

/** 24h → 12h for display */
function formatTime24to12(twentyFour: string): string {
  if (!twentyFour?.trim()) return '';
  const [h, m] = twentyFour.split(':').map((x) => parseInt(x, 10) || 0);
  const hour = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function normalizeTime(v: string): string {
  const parts = v.replace(/[^\d:]/g, '').split(':');
  const h = (parts[0] ?? '00').padStart(2, '0').slice(0, 2);
  const m = (parts[1] ?? '00').padStart(2, '0').slice(0, 2);
  if (parseInt(h, 10) <= 23 && parseInt(m, 10) <= 59) return `${h}:${m}`;
  return '00:00';
}

function parseTime12to24(twelve: string): string {
  const trimmed = twelve.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  const isPM = /\bP(M)?\s*$/.test(upper) || upper.endsWith('P');
  const isAM = /\bA(M)?\s*$/.test(upper) || (upper.endsWith('A') && !upper.endsWith('PM'));
  const withColon = trimmed.replace(/[^\d:]/g, '');
  const parts = withColon.split(':');
  const hourPart = parseInt(parts[0], 10);
  const minPart = parseInt(parts[1], 10) || 0;
  if (hourPart >= 1 && hourPart <= 12 && !Number.isNaN(minPart)) {
    let hour = hourPart;
    if (isPM && hour !== 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minPart).padStart(2, '0')}`;
  }
  const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const min = parseInt(match[2], 10) || 0;
    if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return normalizeTime(trimmed);
}

/** Allow only characters that can be part of 12h time (e.g. "2:30 PM"). */
function sanitize12hInput(raw: string): string {
  return raw
    .replace(/[^\d:apm\s]/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 9);
}

function TimeInput({
  value,
  onChange,
  id,
  militaryTime = true,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  militaryTime?: boolean;
  className?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  const [localRaw, setLocalRaw] = React.useState('');

  const displayValue = militaryTime ? value : formatTime24to12(value);

  const handleFocus = () => {
    if (!militaryTime) {
      setFocused(true);
      setLocalRaw(value ? formatTime24to12(value) : '');
    }
  };

  const handleBlur = () => {
    if (!militaryTime && focused) {
      setFocused(false);
      const parsed = parseTime12to24(localRaw.trim());
      if (parsed) onChange(parsed);
      else if (localRaw.trim()) onChange(value || '00:00');
      setLocalRaw('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (militaryTime) {
      const cleaned = v.replace(/[^\d:]/g, '');
      const parts = cleaned.split(':');
      if (parts.length > 2) return;
      const h = (parts[0] ?? '').slice(0, 2);
      const m = (parts[1] ?? '').slice(0, 2);
      if (!h) onChange('');
      else if (v.endsWith(':')) onChange(`${h}:`);
      else if (!m) onChange(h);
      else onChange(`${h}:${m}`);
    } else {
      setLocalRaw(sanitize12hInput(v));
    }
  };

  const inputValue = militaryTime ? value : (focused ? localRaw : displayValue);

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={militaryTime ? '9:00 or 14:30' : '9:00 AM or 2:30 PM'}
        maxLength={militaryTime ? 5 : 9}
        className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <span className="text-[10px] text-ink-muted">
        {militaryTime ? '24h (14:30 = 2:30 PM)' : '12h (e.g. 2:30 PM)'}
      </span>
    </div>
  );
}

/** Build Date from date (yyyy-MM-dd) + time (HH:mm). */
function toDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr?.trim()) return null;
  const time = timeStr?.trim() ? timeStr : '00:00';
  const normalized = time.includes(':') ? `${time.split(':').slice(0, 2).join(':')}:00` : '00:00:00';
  try {
    return new Date(`${dateStr}T${normalized}`);
  } catch {
    return null;
  }
}

/** Props: T must extend TimeCapsuleFormSlice (e.g. EventCommandFormValues). */
export interface TimeCapsuleProps<T extends TimeCapsuleFormSlice = TimeCapsuleFormSlice> {
  control: Control<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
}

const SET_BY_TIME_HELP =
  'When checked, adds a SET TIME field (e.g. call time) before start time. Start and end times are always shown. When unchecked, event uses full day (00:00–23:59) for the selected date(s).';

export function TimeCapsule<T extends TimeCapsuleFormSlice>({ control, watch, setValue }: TimeCapsuleProps<T>) {
  const [showSetByTimeHelp, setShowSetByTimeHelp] = React.useState(false);
  const { militaryTime } = usePreferences();
  const startDate = watch('start_date' as Path<T>) as string;
  const startTime = watch('start_time' as Path<T>) as string;
  const endDate = watch('end_date' as Path<T>) as string;
  const endTime = watch('end_time' as Path<T>) as string;
  const setByTime = watch('set_by_time' as Path<T>) as boolean;
  const multiDay = watch('multi_day' as Path<T>) as boolean;
  const showLoadInOut = watch('show_load_in_out' as Path<T>) as boolean;
  const loadInDate = watch('load_in_date' as Path<T>) as string;
  const loadInTime = watch('load_in_time' as Path<T>) as string;
  const loadOutDate = watch('load_out_date' as Path<T>) as string;
  const loadOutTime = watch('load_out_time' as Path<T>) as string;

  // Auto: end date ≠ start date → set multi_day true; same date → false
  const setVal = setValue as (name: string, value: unknown) => void;
  useEffect(() => {
    if (!startDate || !endDate) return;
    setVal('multi_day', startDate !== endDate);
  }, [startDate, endDate, setVal]);

  // Sync end_date to start_date when single-day (multi_day is false)
  useEffect(() => {
    if (!multiDay && startDate) setVal('end_date', startDate);
  }, [multiDay, startDate, setVal]);

  // Guardrails: end before start (same day + set by time)
  const startMs = useMemo(() => {
    if (!setByTime) return startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    return toDate(startDate, startTime)?.getTime() ?? null;
  }, [startDate, startTime, setByTime]);
  const endMs = useMemo(() => {
    if (!setByTime) return endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    return toDate(endDate, endTime)?.getTime() ?? null;
  }, [endDate, endTime, setByTime]);
  const endBeforeStart = startMs != null && endMs != null && endMs < startMs;

  // Natural language summary
  const summary = useMemo(() => {
    if (!startDate) return null;
    const startD = new Date(`${startDate}T00:00:00`);
    const endD = endDate ? new Date(`${endDate}T23:59:59.999`) : startD;
    if (multiDay && endDate && startDate !== endDate) {
      const days = differenceInCalendarDays(endD, startD) + 1;
      return `${format(startD, 'MMM d')} – ${format(endD, 'MMM d')} • ${days} Day${days !== 1 ? 's' : ''}`;
    }
    if (setByTime && startTime && endTime) {
      const s = toDate(startDate, startTime);
      const e = toDate(endDate, endTime);
      if (s && e) {
        const hours = Math.round((e.getTime() - s.getTime()) / (60 * 60 * 1000) * 10) / 10;
        if (hours < 24) return `${format(startD, 'MMM d')} • ${hours} Hour${hours !== 1 ? 's' : ''}`;
      }
    }
    return `${format(startD, 'MMM d')} • Full day`;
  }, [startDate, endDate, startTime, endTime, setByTime, multiDay]);

  // Visualizer: segment durations (ms) for Load In | Event | Load Out (percentages sum to 100)
  const visualizer = useMemo(() => {
    const eventStart = startDate
      ? (setByTime ? toDate(startDate, startTime) : new Date(`${startDate}T00:00:00`))
      : null;
    const eventEnd = endDate
      ? (setByTime ? toDate(endDate, endTime) : new Date(`${endDate}T23:59:59.999`))
      : null;
    const hrs = (ms: number) => Math.round((ms / (60 * 60 * 1000)) * 10) / 10;
    if (!eventStart || !eventEnd) {
      return { loadInPct: 0, eventPct: 100, loadOutPct: 0, loadInHours: 0, eventHours: 0, loadOutHours: 0 };
    }
    const eventDur = Math.max(0, eventEnd.getTime() - eventStart.getTime());
    let loadInDur = 0;
    let loadOutDur = 0;
    if (showLoadInOut && loadInDate) {
      const loadIn = setByTime ? toDate(loadInDate, loadInTime) : new Date(`${loadInDate}T00:00:00`);
      if (loadIn) loadInDur = Math.max(0, eventStart.getTime() - loadIn.getTime());
    }
    if (showLoadInOut && loadOutDate) {
      const loadOut = setByTime ? toDate(loadOutDate, loadOutTime) : new Date(`${loadOutDate}T23:59:59.999`);
      if (loadOut) loadOutDur = Math.max(0, loadOut.getTime() - eventEnd.getTime());
    }
    const total = loadInDur + eventDur + loadOutDur;
    if (total <= 0) {
      return { loadInPct: 0, eventPct: 100, loadOutPct: 0, loadInHours: 0, eventHours: hrs(eventDur), loadOutHours: 0 };
    }
    const loadInPct = (loadInDur / total) * 100;
    const eventPct = (eventDur / total) * 100;
    const loadOutPct = (loadOutDur / total) * 100;
    return {
      loadInPct,
      eventPct,
      loadOutPct,
      loadInHours: hrs(loadInDur),
      eventHours: hrs(eventDur),
      loadOutHours: hrs(loadOutDur),
    };
  }, [startDate, startTime, endDate, endTime, setByTime, showLoadInOut, loadInDate, loadInTime, loadOutDate, loadOutTime]);

  return (
    <LiquidPanel className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
        Date & time
      </h3>
      <div className="flex flex-col gap-4">
        {/* Natural language summary */}
        {summary && (
          <p className="text-sm font-medium text-ink" data-state="summary">
            {summary}
          </p>
        )}

        {/* Top row: Set by time + Show load-in / load-out (branded switches) */}
        <div className="flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-3">
            <CeramicSwitch
              id="time-capsule-set-by-time"
              checked={setByTime}
              onCheckedChange={(v) => setVal('set_by_time', v)}
              aria-label="Set by time"
            />
            <label htmlFor="time-capsule-set-by-time" className="flex cursor-pointer items-center gap-2">
              <Clock size={14} className="text-ink-muted" strokeWidth={1.5} />
              <span className="text-sm text-ink">Set by time</span>
              <span
                className="relative inline-flex pb-28 -mb-28 text-ink-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)] rounded-full cursor-help"
                onMouseEnter={() => setShowSetByTimeHelp(true)}
                onMouseLeave={() => setShowSetByTimeHelp(false)}
                onFocus={() => setShowSetByTimeHelp(true)}
                onBlur={() => setShowSetByTimeHelp(false)}
                tabIndex={0}
                role="img"
                aria-label="Set by time help"
              >
                <HelpCircle size={14} strokeWidth={1.5} />
                {showSetByTimeHelp && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-1.5 px-3 py-2.5 w-64 text-xs font-normal text-ink whitespace-normal rounded-xl border border-[var(--glass-border)] shadow-[var(--glass-shadow-hover)] backdrop-blur-2xl bg-[var(--background)]/90 dark:bg-[var(--background)]/92"
                    role="tooltip"
                  >
                    {SET_BY_TIME_HELP}
                  </span>
                )}
              </span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <CeramicSwitch
              id="time-capsule-show-load-in-out"
              checked={showLoadInOut}
              onCheckedChange={(v) => setVal('show_load_in_out', v)}
              aria-label="Show load-in / load-out"
            />
            <label htmlFor="time-capsule-show-load-in-out" className="flex cursor-pointer items-center gap-2">
              <Package size={14} className="text-ink-muted" strokeWidth={1.5} />
              <span className="text-sm text-ink">Show load-in / load-out</span>
            </label>
          </div>
          {multiDay && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-silk/40 px-2.5 py-1 text-xs font-medium text-ink border border-[var(--glass-border)]"
              title="End date is different from start date"
            >
              <Calendar size={12} className="text-ink-muted" strokeWidth={1.5} />
              Multi-day
            </span>
          )}
        </div>

        {endBeforeStart && (
          <div className="flex items-center gap-2 text-amber-600 text-sm" role="alert">
            <AlertCircle size={14} strokeWidth={2} />
            <span>End time is before start time.</span>
            <button
              type="button"
              onClick={() => setVal('end_time', startTime || '00:00')}
              className="text-xs font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-[var(--ring)] rounded px-1"
            >
              Set end = start
            </button>
          </div>
        )}

        {/* First line: date options */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
              Start date
            </label>
            <Controller
              name={"start_date" as Path<T>}
              control={control}
              render={({ field }) => (
                <CeramicDatePicker
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  placeholder="Select start date"
                />
              )}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
              End date {!multiDay && <span className="normal-case text-ink-muted/80">(same day)</span>}
            </label>
            <Controller
              name={"end_date" as Path<T>}
              control={control}
              render={({ field }) => (
                <CeramicDatePicker
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  placeholder={multiDay ? 'Select end date' : 'Same as start'}
                />
              )}
            />
          </div>
        </div>

        {/* Second line: all time options */}
        <div className="flex flex-wrap items-end gap-4">
          {setByTime && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                SET TIME
              </label>
              <Controller
                name={"set_time" as Path<T>}
                control={control}
                render={({ field }) => (
                  <TimeInput
                    id="event-set-time"
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    militaryTime={militaryTime}
                  />
                )}
              />
            </div>
          )}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
              Start time
            </label>
            <Controller
              name={"start_time" as Path<T>}
              control={control}
              render={({ field }) => (
                <TimeInput
                  id="event-start-time"
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  militaryTime={militaryTime}
                />
              )}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
              End time
            </label>
            <Controller
              name={"end_time" as Path<T>}
              control={control}
              render={({ field }) => (
                <TimeInput
                  id="event-end-time"
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  militaryTime={militaryTime}
                />
              )}
            />
          </div>
        </div>

        {showLoadInOut && (
          <div className="border-l-2 border-amber-500/40 pl-3 ml-1 space-y-4">
            <span className="text-xs font-medium text-ink-muted uppercase tracking-wider block">
              Load-in / Load-out
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                  Load-in date
                </label>
                <Controller
                  name={"load_in_date" as Path<T>}
                  control={control}
                  render={({ field }) => (
                    <CeramicDatePicker
                      value={String(field.value ?? '')}
                      onChange={field.onChange}
                      placeholder="Load-in date"
                    />
                  )}
                />
                {setByTime && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                      Load-in time
                    </label>
                    <Controller
                      name={"load_in_time" as Path<T>}
                      control={control}
                      render={({ field }) => (
                        <TimeInput
                          id="event-load-in-time"
                          value={String(field.value ?? '')}
                          onChange={field.onChange}
                          militaryTime={militaryTime}
                        />
                      )}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                  Load-out date
                </label>
                <Controller
                  name={"load_out_date" as Path<T>}
                  control={control}
                  render={({ field }) => (
                    <CeramicDatePicker
                      value={String(field.value ?? '')}
                      onChange={field.onChange}
                      placeholder="Load-out date"
                    />
                  )}
                />
                {setByTime && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                      Load-out time
                    </label>
                    <Controller
                      name={"load_out_time" as Path<T>}
                      control={control}
                      render={({ field }) => (
                        <TimeInput
                          id="event-load-out-time"
                          value={String(field.value ?? '')}
                          onChange={field.onChange}
                          militaryTime={militaryTime}
                        />
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Visualizer bar: Load In (gray) | Event (brand) | Load Out (gray) — explicit widths so bar always reflects proportions */}
        <div className="mt-2">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-muted/20"
            role="img"
            aria-label="Time span: Load In, Event, Load Out"
          >
            {visualizer.loadInPct > 0 && (
              <div
                className="h-full shrink-0 bg-ink-muted/50 rounded-l-full transition-[width] duration-300 ease-out"
                style={{ width: `${visualizer.loadInPct}%` }}
                title={`Load In: ${visualizer.loadInHours} Hour${visualizer.loadInHours !== 1 ? 's' : ''}`}
              />
            )}
            <div
              className={cn(
                'h-full shrink-0 bg-silk/90 transition-[width] duration-300 ease-out',
                visualizer.loadInPct <= 0 && 'rounded-l-full',
                visualizer.loadOutPct <= 0 && 'rounded-r-full'
              )}
              style={{
                width: `${visualizer.eventPct}%`,
                minWidth: visualizer.eventPct > 0 ? '4px' : 0,
              }}
              title={`Event: ${visualizer.eventHours} Hour${visualizer.eventHours !== 1 ? 's' : ''}`}
            />
            {visualizer.loadOutPct > 0 && (
              <div
                className="h-full shrink-0 bg-ink-muted/50 rounded-r-full transition-[width] duration-300 ease-out"
                style={{ width: `${visualizer.loadOutPct}%` }}
                title={`Load Out: ${visualizer.loadOutHours} Hour${visualizer.loadOutHours !== 1 ? 's' : ''}`}
              />
            )}
          </div>
          <p className="mt-1 text-[10px] text-ink-muted">
            Hover segments for duration. Gray = load-in/out, brand = event.
          </p>
        </div>
      </div>
    </LiquidPanel>
  );
}
