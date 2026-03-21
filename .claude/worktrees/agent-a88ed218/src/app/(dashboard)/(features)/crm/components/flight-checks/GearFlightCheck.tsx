'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../../actions/update-flight-check-status';
import { normalizeGearItems, type GearItem, type GearStatus } from './types';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

const GEAR_STATUS_ORDER: GearStatus[] = ['pending', 'pulled', 'loaded'];
const GEAR_LABELS: Record<GearStatus, string> = {
  pending: 'Pending',
  pulled: 'Pulled',
  loaded: 'Loaded',
};

type GearFlightCheckProps = {
  eventId: string;
  runOfShowData: RunOfShowData | null;
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
  maxVisible?: number;
};

export function GearFlightCheck({
  eventId,
  runOfShowData,
  onUpdated,
  defaultCollapsed = false,
  maxVisible = 5,
}: GearFlightCheckProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [updating, setUpdating] = useState<string | null>(null);

  const items = normalizeGearItems(runOfShowData);
  const showCollapse = items.length > maxVisible;
  const visibleItems = collapsed && showCollapse ? items.slice(0, maxVisible) : items;
  const hasMore = collapsed && showCollapse && items.length > maxVisible;

  const setStatus = async (id: string, status: GearStatus) => {
    const next: GearItem[] = items.map((item) =>
      item.id === id ? { ...item, status } : item
    );
    setUpdating(id);
    const result = await updateFlightCheckStatus(eventId, { gear_items: next });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  const cycleStatus = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const idx = GEAR_STATUS_ORDER.indexOf(item.status);
    const next = GEAR_STATUS_ORDER[(idx + 1) % GEAR_STATUS_ORDER.length];
    setStatus(id, next);
  };

  if (items.length === 0) {
    return (
      <LiquidPanel className="p-5 rounded-[28px] border border-white/10">
        <div className="flex items-center gap-3">
          <Package size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div>
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted">Gear</h3>
            <p className="text-sm text-ink-muted mt-0.5">No gear requirements yet</p>
          </div>
        </div>
      </LiquidPanel>
    );
  }

  return (
    <LiquidPanel className="p-5 rounded-[28px] border border-white/10">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Package size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted">Gear</h3>
        </div>
        {showCollapse && (
          <span className="text-ink-muted">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </span>
        )}
      </button>
      <ul className="mt-4 space-y-3">
        {visibleItems.map((item) => (
          <motion.li
            key={item.id}
            layout
            initial={false}
            animate={{ opacity: 1 }}
            transition={SIGNAL_PHYSICS}
            className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
          >
            <span className="text-ceramic font-medium tracking-tight text-sm truncate min-w-0">
              {item.name}
            </span>
            <motion.button
              type="button"
              onClick={() => cycleStatus(item.id)}
              disabled={updating === item.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className={`
                shrink-0 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight
                border transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
                disabled:opacity-60
                ${item.status === 'loaded' ? 'bg-[var(--color-signal-success)]/20 text-ceramic border-[var(--color-signal-success)]/40 hover:brightness-110' : ''}
                ${item.status === 'pulled' ? 'bg-[var(--color-neon-blue)]/15 text-ceramic border-[var(--color-neon-blue)]/30 hover:brightness-110' : ''}
                ${item.status === 'pending' ? 'bg-white/[0.06] text-ink-muted border-white/10 hover:bg-white/[0.1] hover:text-ceramic' : ''}
              `}
            >
              {updating === item.id ? '…' : GEAR_LABELS[item.status]}
            </motion.button>
          </motion.li>
        ))}
      </ul>
      {hasMore && (
        <p className="text-xs text-ink-muted mt-2">
          +{items.length - maxVisible} more
        </p>
      )}
    </LiquidPanel>
  );
}
