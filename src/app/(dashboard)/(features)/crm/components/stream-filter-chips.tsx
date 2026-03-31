'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Search, Calendar, Bell } from 'lucide-react';
import { createPortal } from 'react-dom';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { DEAL_ARCHETYPE_LABELS, type DealArchetype } from '../actions/deal-model';
import type { StreamCardItem } from './stream-card';

/* ─── Filter State Types ─── */

export type StreamFilters = {
  statuses: string[];
  paymentStatuses: string[];
  archetypes: string[];
  clientName: string | null;
  needsAttention: boolean;
  dateRange: {
    preset: 'this-week' | 'this-month' | 'next-30' | 'next-90' | null;
    from: string | null;
    to: string | null;
  };
};

export const INITIAL_FILTERS: StreamFilters = {
  statuses: [],
  paymentStatuses: [],
  archetypes: [],
  clientName: null,
  needsAttention: false,
  dateRange: { preset: null, from: null, to: null },
};

export function hasActiveFilters(f: StreamFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.paymentStatuses.length > 0 ||
    f.archetypes.length > 0 ||
    f.clientName !== null ||
    f.needsAttention ||
    f.dateRange.preset !== null
  );
}

/* ─── Filter Application ─── */

export function applyFilters(items: StreamCardItem[], filters: StreamFilters): StreamCardItem[] {
  let result = items;

  if (filters.statuses.length > 0) {
    result = result.filter((i) => {
      const s = i.source === 'event' ? (i.lifecycle_status ?? 'active') : (i.status ?? '');
      return filters.statuses.includes(s);
    });
  }

  if (filters.paymentStatuses.length > 0) {
    result = result.filter((i) =>
      i.paymentStatusLabel && filters.paymentStatuses.includes(i.paymentStatusLabel)
    );
  }

  if (filters.archetypes.length > 0) {
    result = result.filter((i) =>
      i.event_archetype && filters.archetypes.includes(i.event_archetype)
    );
  }

  if (filters.clientName) {
    const cn = filters.clientName;
    result = result.filter((i) => i.client_name === cn);
  }

  if (filters.needsAttention) {
    result = result.filter((i) => i.followUpStatus === 'pending');
  }

  if (filters.dateRange.preset || filters.dateRange.from) {
    const { from, to } = resolveDateRange(filters.dateRange);
    if (from || to) {
      result = result.filter((i) => {
        if (!i.event_date) return false;
        if (from && i.event_date < from) return false;
        if (to && i.event_date > to) return false;
        return true;
      });
    }
  }

  return result;
}

function resolveDateRange(dr: StreamFilters['dateRange']): { from: string | null; to: string | null } {
  if (dr.from || dr.to) return { from: dr.from, to: dr.to };
  if (!dr.preset) return { from: null, to: null };

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (dr.preset) {
    case 'this-week': {
      const day = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'this-month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'next-30': {
      const end = new Date(today);
      end.setDate(today.getDate() + 30);
      return { from: fmt(today), to: fmt(end) };
    }
    case 'next-90': {
      const end = new Date(today);
      end.setDate(today.getDate() + 90);
      return { from: fmt(today), to: fmt(end) };
    }
  }
}

/* ─── Status Labels ─── */

const STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  contract_sent: 'Contract sent',
  contract_signed: 'Signed',
  deposit_received: 'Deposit received',
  won: 'Won',
  lost: 'Lost',
  active: 'Active',
  cancelled: 'Cancelled',
};

const DATE_PRESET_LABELS: Record<string, string> = {
  'this-week': 'This week',
  'this-month': 'This month',
  'next-30': 'Next 30 days',
  'next-90': 'Next 90 days',
};

/* ─── Component ─── */

export function FilterChipBar({
  filters,
  onFiltersChange,
  items,
}: {
  filters: StreamFilters;
  onFiltersChange: (f: StreamFilters) => void;
  items: StreamCardItem[];
}) {
  const [openChip, setOpenChip] = useState<string | null>(null);
  const active = hasActiveFilters(filters);

  const needsAttentionCount = useMemo(
    () => items.filter((i) => i.followUpStatus === 'pending').length,
    [items]
  );

  // Derive available values from current items
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.source === 'event') set.add(i.lifecycle_status ?? 'active');
      else if (i.status) set.add(i.status);
    }
    return [...set].sort();
  }, [items]);

  const availablePaymentStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.paymentStatusLabel) set.add(i.paymentStatusLabel);
    }
    return [...set].sort();
  }, [items]);

  const availableArchetypes = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.event_archetype) set.add(i.event_archetype);
    }
    return [...set].sort();
  }, [items]);

  const availableClients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      if (i.client_name) counts.set(i.client_name, (counts.get(i.client_name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [items]);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {needsAttentionCount > 0 && (
        <button
          type="button"
          onClick={() => onFiltersChange({ ...filters, needsAttention: !filters.needsAttention })}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
            filters.needsAttention
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
          )}
          style={{
            background: filters.needsAttention
              ? 'color-mix(in oklch, var(--stage-accent) 12%, transparent)'
              : 'var(--stage-surface-elevated)',
            borderRadius: 'var(--stage-radius-pill)',
          }}
        >
          <Bell size={12} />
          Needs attention
          <span
            className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full"
            style={{
              background: filters.needsAttention ? 'var(--stage-accent)' : 'var(--stage-surface)',
              color: filters.needsAttention ? 'var(--stage-surface)' : 'var(--stage-text-secondary)',
            }}
          >
            {needsAttentionCount}
          </span>
        </button>
      )}

      <FilterChip
        label="Status"
        active={filters.statuses.length > 0}
        count={filters.statuses.length}
        isOpen={openChip === 'status'}
        onToggle={() => setOpenChip(openChip === 'status' ? null : 'status')}
        onClose={() => setOpenChip(null)}
      >
        <CheckboxList
          options={availableStatuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
          selected={filters.statuses}
          onChange={(statuses) => onFiltersChange({ ...filters, statuses })}
        />
      </FilterChip>

      {availablePaymentStatuses.length > 0 && (
        <FilterChip
          label="Payment"
          active={filters.paymentStatuses.length > 0}
          count={filters.paymentStatuses.length}
          isOpen={openChip === 'payment'}
          onToggle={() => setOpenChip(openChip === 'payment' ? null : 'payment')}
          onClose={() => setOpenChip(null)}
        >
          <CheckboxList
            options={availablePaymentStatuses.map((s) => ({ value: s, label: s }))}
            selected={filters.paymentStatuses}
            onChange={(paymentStatuses) => onFiltersChange({ ...filters, paymentStatuses })}
          />
        </FilterChip>
      )}

      {availableArchetypes.length > 0 && (
        <FilterChip
          label="Type"
          active={filters.archetypes.length > 0}
          count={filters.archetypes.length}
          isOpen={openChip === 'archetype'}
          onToggle={() => setOpenChip(openChip === 'archetype' ? null : 'archetype')}
          onClose={() => setOpenChip(null)}
        >
          <CheckboxList
            options={availableArchetypes.map((a) => ({
              value: a,
              label: DEAL_ARCHETYPE_LABELS[a as DealArchetype] ?? a,
            }))}
            selected={filters.archetypes}
            onChange={(archetypes) => onFiltersChange({ ...filters, archetypes })}
          />
        </FilterChip>
      )}

      {availableClients.length > 0 && (
        <FilterChip
          label={filters.clientName ?? 'Client'}
          active={filters.clientName !== null}
          isOpen={openChip === 'client'}
          onToggle={() => setOpenChip(openChip === 'client' ? null : 'client')}
          onClose={() => setOpenChip(null)}
        >
          <ClientPicker
            clients={availableClients}
            selected={filters.clientName}
            onSelect={(clientName) => {
              onFiltersChange({ ...filters, clientName });
              setOpenChip(null);
            }}
          />
        </FilterChip>
      )}

      <FilterChip
        label={filters.dateRange.preset ? DATE_PRESET_LABELS[filters.dateRange.preset] ?? 'Date' : 'Date'}
        active={filters.dateRange.preset !== null}
        isOpen={openChip === 'date'}
        onToggle={() => setOpenChip(openChip === 'date' ? null : 'date')}
        onClose={() => setOpenChip(null)}
        icon={<Calendar size={12} />}
      >
        <DateRangePicker
          dateRange={filters.dateRange}
          onChange={(dateRange) => {
            onFiltersChange({ ...filters, dateRange });
            if (dateRange.preset) setOpenChip(null);
          }}
        />
      </FilterChip>

      <AnimatePresence>
        {active && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={STAGE_LIGHT}
            onClick={() => onFiltersChange(INITIAL_FILTERS)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-colors"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            <X size={12} /> Clear
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Filter Chip Shell ─── */

function FilterChip({
  label,
  active,
  count,
  isOpen,
  onToggle,
  onClose,
  icon,
  children,
}: {
  label: string;
  active: boolean;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const DROPDOWN_MAX_HEIGHT = 280;

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < DROPDOWN_MAX_HEIGHT && rect.top > DROPDOWN_MAX_HEIGHT;
    // Clamp left so dropdown doesn't overflow right edge of viewport
    const maxLeft = window.innerWidth - 264; // max-w-[260px] + 4px margin
    return {
      top: placeAbove ? rect.top - DROPDOWN_MAX_HEIGHT - 4 : rect.bottom + 4,
      left: Math.min(rect.left, Math.max(4, maxLeft)),
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const p = computePosition();
      if (p) setPos(p);
    }
  }, [isOpen, computePosition]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => onClose();
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
          active
            ? 'text-[var(--stage-text-primary)]'
            : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
        )}
        style={{
          background: active
            ? 'color-mix(in oklch, var(--stage-accent) 12%, transparent)'
            : 'var(--stage-surface-elevated)',
          borderRadius: 'var(--stage-radius-pill)',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {icon}
        {label}
        {count != null && count > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full"
            style={{
              background: 'var(--stage-accent)',
              color: 'var(--stage-surface)',
            }}
          >
            {count}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_LIGHT}
            className="fixed z-50 min-w-[180px] max-w-[260px] max-h-[280px] overflow-y-auto p-2"
            style={{
              top: pos.top,
              left: pos.left,
              background: 'var(--stage-surface-raised)',
              borderRadius: 'var(--stage-radius-panel, 12px)',
              border: '1px solid var(--stage-edge-subtle)',
              boxShadow: '0 8px 32px oklch(0 0 0 / 0.4)',
            }}
          >
            {children}
          </motion.div>,
          document.body
        )}
    </>
  );
}

/* ─── Popover Content: Checkbox List ─── */

function CheckboxList({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value]
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors text-left',
              isSelected
                ? 'text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
            )}
            style={{
              background: isSelected ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)' : 'transparent',
            }}
          >
            <span
              className="shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded-sm"
              style={{
                border: `1px solid ${isSelected ? 'var(--stage-accent)' : 'var(--stage-edge-subtle)'}`,
                background: isSelected ? 'var(--stage-accent)' : 'transparent',
              }}
            >
              {isSelected && <Check size={10} style={{ color: 'var(--stage-surface)' }} />}
            </span>
            {opt.label}
          </button>
        );
      })}
      {options.length === 0 && (
        <p className="text-xs px-2 py-3 text-center" style={{ color: 'var(--stage-text-tertiary)' }}>
          None available
        </p>
      )}
    </div>
  );
}

/* ─── Popover Content: Client Picker ─── */

function ClientPicker({
  clients,
  selected,
  onSelect,
}: {
  clients: string[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = q
    ? clients.filter((c) => c.toLowerCase().includes(q.toLowerCase()))
    : clients.slice(0, 12);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--stage-text-tertiary)' }} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients…"
          autoFocus
          className="w-full pl-7 pr-2 py-1.5 text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
          style={{
            background: 'var(--stage-surface-elevated)',
            borderRadius: '6px',
            border: '1px solid var(--stage-edge-subtle)',
          }}
        />
      </div>
      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md"
          style={{ color: 'var(--stage-text-secondary)' }}
        >
          <X size={10} /> Clear selection
        </button>
      )}
      <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
        {filtered.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              'px-2 py-1.5 text-xs text-left rounded-md transition-colors truncate',
              selected === name
                ? 'text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
            )}
            style={{
              background: selected === name
                ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)'
                : 'transparent',
            }}
          >
            {name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs px-2 py-3 text-center" style={{ color: 'var(--stage-text-tertiary)' }}>
            No clients match
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Popover Content: Date Range ─── */

function DateRangePicker({
  dateRange,
  onChange,
}: {
  dateRange: StreamFilters['dateRange'];
  onChange: (dr: StreamFilters['dateRange']) => void;
}) {
  const presets = ['this-week', 'this-month', 'next-30', 'next-90'] as const;

  return (
    <div className="flex flex-col gap-0.5">
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() =>
            onChange(
              dateRange.preset === preset
                ? { preset: null, from: null, to: null }
                : { preset, from: null, to: null }
            )
          }
          className={cn(
            'px-2 py-1.5 text-xs text-left rounded-md transition-colors',
            dateRange.preset === preset
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
          )}
          style={{
            background: dateRange.preset === preset
              ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)'
              : 'transparent',
          }}
        >
          {DATE_PRESET_LABELS[preset]}
        </button>
      ))}
    </div>
  );
}
