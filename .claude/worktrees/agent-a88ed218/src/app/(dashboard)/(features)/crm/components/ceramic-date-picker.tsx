'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format, isBefore, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';

/** Parse "yyyy-MM-dd" as local date. new Date("yyyy-MM-dd") is UTC midnight and shifts to previous day in western timezones. */
export function parseLocalDateString(dateStr: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  dropdown: 'min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-sm text-ink',
  weekdays: 'flex gap-1 w-full justify-between',
  weekday: 'w-9 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted text-center',
  week: 'flex gap-1 w-full justify-between',
  day: 'w-9 h-9 p-0',
  day_button: cn(
    'h-9 w-9 rounded-xl text-sm font-medium transition-all',
    'hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset',
    'data-[selected]:bg-walnut data-[selected]:text-canvas data-[selected]:font-semibold',
    'data-[outside]:text-ink-muted/50'
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
      className={cn(
        'overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow)] backdrop-blur-xl',
        className
      )}
    >
      <div className="px-4 pt-4 pb-1">
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Choose date</p>
      </div>
      <div className="p-4 pt-2">
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={handleSelect}
        captionLayout="dropdown"
        defaultMonth={selected ?? new Date()}
        hideNavigation
        components={{ CaptionLabel: () => <></>, Nav: () => <></> }}
        startMonth={new Date(new Date().getFullYear() - 20, 0)}
        endMonth={new Date(new Date().getFullYear() + 10, 11)}
        classNames={DAY_PICKER_CLASSNAMES}
      />
      </div>
      {onClose && (
        <div className="border-t border-[var(--glass-border)] px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-ink-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset rounded-lg px-3 py-1.5 transition-colors"
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
      transition={SIGNAL_PHYSICS}
      className={cn(
        'overflow-hidden rounded-3xl border p-4 shadow-[var(--glass-shadow)] backdrop-blur-xl',
        useOverlay
          ? 'border-white/20 bg-obsidian/95 text-ceramic shadow-2xl'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
      )}
    >
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={handleSelect}
        captionLayout="dropdown"
        defaultMonth={selected ?? new Date()}
        hideNavigation
        components={{ CaptionLabel: () => <></>, Nav: () => <></> }}
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
          'flex w-full min-w-[11rem] max-w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-200',
          isPastDate
            ? 'border-amber-500/60 bg-amber-500/5 text-ink'
            : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-ink hover:bg-[var(--glass-bg-hover)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'
        )}
      >
        <Calendar size={16} className={cn('shrink-0', isPastDate ? 'text-amber-600' : 'text-ink-muted')} strokeWidth={1.5} />
        <span className={cn('truncate min-w-0', value ? 'text-ink' : 'text-ink-muted/70')}>
          {value ? format(parseLocalDateString(value), 'PPP') : placeholder}
        </span>
      </button>

      {isPastDate && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600">
          <AlertCircle size={12} strokeWidth={2} />
          This date is in the past — use for logging historical events
        </p>
      )}

      <AnimatePresence>
        {open && !useOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
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
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/40 backdrop-blur-xl"
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
