'use client';

import { useState, useEffect, useRef, useCallback, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker, type DropdownOption } from 'react-day-picker';
import { format, isBefore, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';

/** Parse "yyyy-MM-dd" as local date. new Date("yyyy-MM-dd") is UTC midnight and shifts to previous day in western timezones. */
export function parseLocalDateString(dateStr: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Custom calendar dropdown replacing native <select> to match Stage Engineering. */
function StageDropdown(
  props: {
    options?: DropdownOption[];
  } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>
) {
  // DayPicker forwards internal props (classNames, components, etc.) — strip them so they don't reach the DOM.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { options, value, onChange, className: _className, classNames: _cn, components: _comp, ...rest } = props as Record<string, unknown>;
  void rest; // discard remaining DayPicker internals — do not spread onto DOM
  const opts = options as DropdownOption[] | undefined;
  const val = value as string | number | undefined;
  const handleChange = onChange as ((e: React.ChangeEvent<HTMLSelectElement>) => void) | undefined;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = opts?.find((o) => o.value === Number(val));

  const handleSelect = useCallback(
    (optValue: number) => {
      setOpen(false);
      handleChange?.({
        target: { value: String(optValue) },
      } as React.ChangeEvent<HTMLSelectElement>);
    },
    [handleChange]
  );

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-[var(--stage-radius-input,6px)] border px-2.5 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left tracking-tight transition-colors duration-75 cursor-pointer',
          open
            ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
            : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
        )}
      >
        <span className="truncate min-w-0 text-[var(--stage-text-primary)]">
          {selected?.label ?? ''}
        </span>
        <ChevronDown
          size={12}
          className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onMouseDown={() => setOpen(false)}>
            <div
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
                  minWidth: rect.width,
                  maxWidth: Math.max(rect.width, 140),
                  ...(dropUp
                    ? { bottom: window.innerHeight - rect.top + 4 }
                    : { top: rect.bottom + 4 }),
                };
              })()}
              className="max-h-[240px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
            >
              {opts?.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === Number(val)}
                  disabled={o.disabled}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (!o.disabled) handleSelect(o.value);
                  }}
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0',
                    o.disabled && 'opacity-45 pointer-events-none',
                    o.value === Number(val)
                      ? 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-primary)] font-medium'
                      : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Shared DayPicker classNames for consistent calendar styling (CeramicDatePicker + inline CalendarPanel). */
export const DAY_PICKER_CLASSNAMES = {
  root: 'ceramic-calendar w-full',
  months: 'flex flex-col w-full',
  month: 'flex flex-col gap-3 w-full',
  month_caption: 'flex justify-center items-center gap-2 w-full mb-1',
  /** Hide caption label when using dropdown layout to avoid duplicate month text (dropdown already shows month). */
  caption_label: 'hidden',
  dropdowns: 'flex gap-2 justify-center',
  dropdown: '',
  weekdays: 'flex gap-1 w-full justify-between',
  weekday: 'w-9 py-1.5 stage-label text-center',
  week: 'flex gap-1 w-full justify-between',
  day: 'w-9 h-9 p-0',
  day_button: cn(
    'h-9 w-9 rounded-[var(--stage-radius-input,6px)] text-[length:var(--stage-input-font-size,13px)] font-medium transition-colors',
    'stage-hover overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
    'data-[selected]:bg-[var(--stage-accent)] data-[selected]:text-[oklch(0.10_0_0)] data-[selected]:font-medium',
    'data-[outside]:text-[var(--stage-text-tertiary)]'
  ),
  today: 'bg-[var(--today-bg)] ring-1 ring-[var(--today-ring)]',
} as const;

/** Standalone calendar panel for inline expansion (e.g. M3 Shared axis in modal). Use inside a full-width row. */
export interface CalendarPanelProps {
  value: string;
  onChange: (date: string) => void;
  onClose?: () => void;
  className?: string;
}

export function CalendarPanel({ value, onChange, onClose, className }: CalendarPanelProps) {
  const [selected, setSelected] = useState<Date | undefined>(value ? parseLocalDateString(value) : undefined);
  useEffect(() => {
    if (value) setSelected(parseLocalDateString(value));
    else setSelected(undefined);
  }, [value]);
  const handleSelect = (date: Date | undefined) => {
    setSelected(date);
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
      onClose?.();
    }
  };
  return (
    <div
      role="dialog"
      aria-label="Choose date"
      data-surface="raised"
      className={cn(
        'overflow-hidden rounded-[var(--stage-radius-panel,12px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]',
        className
      )}
    >
      <div className="px-4 pt-4 pb-1">
        <p className="stage-label">Choose date</p>
      </div>
      <div className="p-4 pt-2">
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={handleSelect}
        captionLayout="dropdown"
        defaultMonth={selected ?? new Date()}
        hideNavigation
        components={{ CaptionLabel: () => <></>, Nav: () => <></>, Dropdown: StageDropdown }}
        startMonth={new Date(new Date().getFullYear() - 20, 0)}
        endMonth={new Date(new Date().getFullYear() + 10, 11)}
        classNames={DAY_PICKER_CLASSNAMES}
      />
      </div>
      {onClose && (
        <div className="border-t border-[oklch(1_0_0_/_0.04)] px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-[var(--stage-radius-input,6px)] px-3 py-1.5 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

interface CeramicDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  /** When provided, calendar opens as full frosted-glass overlay covering this container */
  overlayContainerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Inline calendar that expands below the trigger.
 * Allows past dates (for logging) but shows a warning.
 * Year dropdown for quick navigation, styled to match Liquid Ceramic.
 */
export function CeramicDatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className,
  overlayContainerRef,
}: CeramicDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | undefined>(
    value ? parseLocalDateString(value) : undefined
  );
  const ref = useRef<HTMLDivElement>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());
  const isPastDate = value ? isBefore(parseLocalDateString(value), today) : false;

  useEffect(() => {
    if (value) setSelected(parseLocalDateString(value));
    else setSelected(undefined);
  }, [value]);

  useEffect(() => {
    if (open && !overlayContainerRef && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open, overlayContainerRef]);

  const handleSelect = (date: Date | undefined) => {
    setSelected(date);
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
      setOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (overlayContentRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const useOverlay = open && overlayContainerRef != null;

  const calendarContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={STAGE_MEDIUM}
      data-surface="raised"
      className={cn(
        'overflow-hidden rounded-[var(--stage-radius-panel,12px)] border p-4 shadow-[0_8px_32px_oklch(0_0_0/0.5)]',
        useOverlay
          ? 'border-[oklch(1_0_0_/_0.20)] bg-[var(--ctx-dropdown)] text-[var(--stage-text-primary)]'
          : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)]'
      )}
    >
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={handleSelect}
        captionLayout="dropdown"
        defaultMonth={selected ?? new Date()}
        hideNavigation
        components={{ CaptionLabel: () => <></>, Nav: () => <></>, Dropdown: StageDropdown }}
        startMonth={new Date(new Date().getFullYear() - 20, 0)}
        endMonth={new Date(new Date().getFullYear() + 10, 11)}
        classNames={DAY_PICKER_CLASSNAMES}
      />
    </motion.div>
  );

  return (
    <div ref={ref} className={cn('relative min-w-0 w-full', className)}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          'flex w-full min-w-[11rem] max-w-full items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] transition-colors duration-75',
          isPastDate
            ? 'border-[var(--color-unusonic-warning)]/60 bg-[var(--color-unusonic-warning)]/5 text-[var(--stage-text-primary)]'
            : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] stage-hover overflow-hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
        )}
      >
        <Calendar size={16} className={cn('shrink-0', isPastDate ? 'text-[var(--color-unusonic-warning)]' : 'text-[var(--stage-text-secondary)]')} strokeWidth={1.5} />
        <span className={cn('truncate min-w-0 tracking-tight', value ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
          {value ? format(parseLocalDateString(value), 'PPP') : placeholder}
        </span>
      </button>

      {isPastDate && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-unusonic-warning)]">
          <AlertCircle size={12} strokeWidth={1.5} />
          This date is in the past — use for logging past shows
        </p>
      )}

      <AnimatePresence>
        {open && !useOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={STAGE_MEDIUM}
            className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-[320px]"
          >
            <div className="w-full max-w-[320px]">
              {calendarContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {open && useOverlay && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div
            key="date-picker-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_NAV_CROSSFADE}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--stage-void)]/40"
            onClick={() => setOpen(false)}
          >
            <div
              ref={overlayContentRef}
              className="w-full max-w-[320px] mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {calendarContent}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
