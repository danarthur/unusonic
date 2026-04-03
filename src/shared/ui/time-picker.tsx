'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { parseTimeInput, formatTime12h, generateTimeSlots } from '@/shared/lib/parse-time';

const ALL_SLOTS = generateTimeSlots();

type TimePickerProps = {
  value: string | null;
  onChange: (time: string | null) => void;
  placeholder?: string;
  context?: 'morning' | 'evening';
  /** 'default' = full stage-input well. 'ghost' = transparent inline text (for header strips). */
  variant?: 'default' | 'ghost';
  className?: string;
};

export function TimePicker({
  value,
  onChange,
  placeholder = 'Set time',
  context = 'evening',
  variant = 'default',
  className,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Sync input display with external value
  useEffect(() => {
    if (!open) {
      setInputValue(value ? formatTime12h(value) : '');
    }
  }, [value, open]);

  // Filter slots based on typed input
  const filtered = useMemo(() => {
    if (!inputValue.trim()) return ALL_SLOTS;
    const parsed = parseTimeInput(inputValue, context);
    if (parsed) {
      const idx = ALL_SLOTS.findIndex((s) => s.value === parsed);
      if (idx >= 0) {
        // Put the exact match first, then nearby slots
        const start = Math.max(0, idx - 3);
        const end = Math.min(ALL_SLOTS.length, idx + 5);
        const nearby = ALL_SLOTS.slice(start, end);
        // Reorder: exact match at position 0
        const exact = nearby.find((s) => s.value === parsed);
        const rest = nearby.filter((s) => s.value !== parsed);
        return exact ? [exact, ...rest] : nearby;
      }
      // Parsed time not in 15-min slots — show nearby hour slots
      const hourSlots = ALL_SLOTS.filter((s) => s.value.startsWith(parsed.slice(0, 2)));
      // Insert the custom time at the top
      return [{ value: parsed, label: formatTime12h(parsed) }, ...hourSlots.filter((s) => s.value !== parsed)];
    }
    // Fuzzy match on label
    const q = inputValue.toLowerCase();
    return ALL_SLOTS.filter((s) => s.label.toLowerCase().includes(q) || s.value.includes(q));
  }, [inputValue, context]);

  // Scroll to current value when dropdown opens
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const targetValue = value ?? '12:00';
    const idx = ALL_SLOTS.findIndex((s) => s.value >= targetValue);
    const scrollIdx = Math.max(0, idx - 3);
    const row = rowRefs.current.get(scrollIdx);
    if (row) {
      row.scrollIntoView({ block: 'start' });
    }
    setHighlightedIndex(idx >= 0 ? idx : 0);
  }, [open, value]);

  const handleSelect = useCallback((time: string) => {
    onChange(time);
    setInputValue(formatTime12h(time));
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  const handleFocus = () => {
    setOpen(true);
    // Select all text so typing replaces it
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    // Delay to allow click on dropdown rows (onMouseDown prevents blur, but safety margin)
    setTimeout(() => {
      if (dropdownRef.current?.matches(':hover')) return;
      setOpen(false);
      // Parse whatever was typed
      const trimmed = inputValue.trim();
      if (trimmed) {
        const parsed = parseTimeInput(trimmed, context);
        if (parsed) {
          onChange(parsed);
          setInputValue(formatTime12h(parsed));
        } else {
          // Revert to previous value
          setInputValue(value ? formatTime12h(value) : '');
        }
      } else if (value) {
        // User cleared the field — keep the existing value displayed
        setInputValue(formatTime12h(value));
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const slots = inputValue.trim() ? filtered : ALL_SLOTS;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, slots.length - 1));
      const row = rowRefs.current.get(Math.min(highlightedIndex + 1, slots.length - 1));
      row?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      const row = rowRefs.current.get(Math.max(highlightedIndex - 1, 0));
      row?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Always prefer the parsed value of what was typed
      const parsed = parseTimeInput(inputValue, context);
      if (parsed) {
        handleSelect(parsed);
      } else {
        const slots2 = inputValue.trim() ? filtered : ALL_SLOTS;
        if (highlightedIndex >= 0 && highlightedIndex < slots2.length) {
          handleSelect(slots2[highlightedIndex].value);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setInputValue(value ? formatTime12h(value) : '');
      inputRef.current?.blur();
    } else if (e.key === 'Tab') {
      // Confirm current selection on Tab
      if (inputValue.trim()) {
        const parsed = parseTimeInput(inputValue, context);
        if (parsed) {
          onChange(parsed);
          setInputValue(formatTime12h(parsed));
        }
      }
      setOpen(false);
    }
  };

  // Dropdown position
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, dropUp: false });
  useEffect(() => {
    if (!open || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < 280;
    setPos({
      top: dropUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 140),
      dropUp,
    });
  }, [open]);

  const slots = inputValue.trim() ? filtered : ALL_SLOTS;

  return (
    <div className={cn('relative min-w-0', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setHighlightedIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            '[font-variant-numeric:tabular-nums]',
            variant === 'ghost'
              ? 'w-[4.75rem] text-center bg-transparent text-sm text-[var(--stage-text-primary)] tracking-tight focus:outline-none placeholder:text-[var(--stage-text-tertiary)] px-0.5 py-0.5 hover:bg-[oklch(1_0_0_/_0.05)] rounded-[var(--stage-radius-input)] transition-colors'
              : 'w-full min-w-0 stage-input pr-8',
          )}
        />
        {variant === 'default' && (
          <Clock
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
            strokeWidth={1.5}
          />
        )}
      </div>

      <AnimatePresence>
        {open && slots.length > 0 && createPortal(
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: pos.dropUp ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: pos.dropUp ? 4 : -4 }}
            transition={STAGE_LIGHT}
            data-surface="raised"
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              ...(pos.dropUp
                ? { bottom: window.innerHeight - pos.top }
                : { top: pos.top }),
              zIndex: 70,
            }}
            className="max-h-[260px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
            onMouseDown={(e) => e.preventDefault()}
          >
            {slots.map((slot, i) => (
              <button
                key={slot.value}
                ref={(el) => { if (el) rowRefs.current.set(i, el); }}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(slot.value);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={cn(
                  'flex w-full items-center px-3 h-8 text-sm tracking-tight transition-colors [font-variant-numeric:tabular-nums]',
                  i === highlightedIndex
                    ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.05)]',
                  slot.value === value && 'font-medium text-[var(--stage-text-primary)]',
                )}
              >
                {slot.label}
              </button>
            ))}
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
