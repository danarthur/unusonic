'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { StreamCardItem } from './stream-card';

/* ─── Sort Types ─── */

export type StreamSort = {
  field: 'event_date' | 'client_name' | 'status' | 'created_at' | 'priority';
  direction: 'asc' | 'desc';
};

export const INITIAL_SORT: StreamSort = { field: 'event_date', direction: 'asc' };

const SORT_OPTIONS: { field: StreamSort['field']; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { field: 'event_date', label: 'Date', defaultDir: 'asc' },
  { field: 'client_name', label: 'Client', defaultDir: 'asc' },
  { field: 'status', label: 'Status', defaultDir: 'asc' },
  { field: 'created_at', label: 'Created', defaultDir: 'desc' },
  { field: 'priority', label: 'Priority', defaultDir: 'desc' },
];

/* ─── Pipeline order for status sort ─── */

const STATUS_ORDER: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
  contract_signed: 3,
  deposit_received: 4,
  won: 5,
  lost: 6,
  active: 3,
  cancelled: 7,
};

/* ─── Sort Application ─── */

export function applySortOrder(items: StreamCardItem[], sort: StreamSort): StreamCardItem[] {
  const sorted = [...items];
  const dir = sort.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case 'event_date':
        cmp = (a.event_date ?? '').localeCompare(b.event_date ?? '');
        break;
      case 'client_name':
        cmp = (a.client_name ?? '').localeCompare(b.client_name ?? '');
        // tiebreak by date
        if (cmp === 0) cmp = (a.event_date ?? '').localeCompare(b.event_date ?? '');
        break;
      case 'status': {
        const sa = a.source === 'event' ? (a.lifecycle_status ?? 'active') : (a.status ?? '');
        const sb = b.source === 'event' ? (b.lifecycle_status ?? 'active') : (b.status ?? '');
        cmp = (STATUS_ORDER[sa] ?? 99) - (STATUS_ORDER[sb] ?? 99);
        // tiebreak by date
        if (cmp === 0) cmp = (a.event_date ?? '').localeCompare(b.event_date ?? '');
        break;
      }
      case 'created_at':
        cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
        break;
      case 'priority':
        cmp = (a.followUpPriority ?? -1) - (b.followUpPriority ?? -1);
        // tiebreak by date
        if (cmp === 0) cmp = (a.event_date ?? '').localeCompare(b.event_date ?? '');
        break;
    }
    return cmp * dir;
  });

  return sorted;
}

/* ─── Component ─── */

export function SortControl({
  sort,
  onSortChange,
}: {
  sort: StreamSort;
  onSortChange: (s: StreamSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const currentLabel = SORT_OPTIONS.find((o) => o.field === sort.field)?.label ?? 'Sort';

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const DirIcon = sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 stage-badge-text font-medium rounded-full transition-colors',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
        )}
        style={{
          background: 'var(--stage-surface-elevated)',
          borderRadius: 'var(--stage-radius-pill)',
        }}
      >
        <ArrowUpDown size={12} />
        {currentLabel}
        <DirIcon size={10} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_LIGHT}
              className="fixed z-50 min-w-[150px] p-2"
              style={{
                top: pos.top,
                right: pos.right,
                background: 'var(--stage-surface-raised)',
                borderRadius: 'var(--stage-radius-panel, 12px)',
                border: '1px solid var(--stage-edge-subtle)',
                boxShadow: '0 8px 32px oklch(0 0 0 / 0.4)',
              }}
            >
              {SORT_OPTIONS.map((opt) => {
                const isActive = sort.field === opt.field;
                return (
                  <button
                    key={opt.field}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        onSortChange({ field: sort.field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
                      } else {
                        onSortChange({ field: opt.field, direction: opt.defaultDir });
                      }
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-md transition-colors text-left',
                      isActive
                        ? 'text-[var(--stage-text-primary)]'
                        : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                    )}
                    style={{
                      background: isActive
                        ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {opt.label}
                    {isActive && (
                      <DirIcon size={10} style={{ color: 'var(--stage-accent)' }} />
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
