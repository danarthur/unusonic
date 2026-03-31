'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
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
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div>
            <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">No gear requirements yet</p>
          </div>
        </div>
      </StagePanel>
    );
  }

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
        </div>
        {showCollapse && (
          <span className="text-[var(--stage-text-secondary)]">
            {collapsed ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronUp size={18} strokeWidth={1.5} />}
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
            transition={STAGE_LIGHT}
            className="flex items-center justify-between gap-4 py-2 border-b border-[oklch(1_0_0_/_0.05)] last:border-0"
          >
            <span className="text-[var(--stage-text-primary)] font-medium tracking-tight text-sm truncate min-w-0">
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => cycleStatus(item.id)}
              disabled={updating === item.id}
              className={`
                shrink-0 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight
                border transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]
                disabled:opacity-60
                ${item.status === 'loaded' ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40' : ''}
                ${item.status === 'pulled' ? 'bg-[var(--color-unusonic-info)]/15 text-[var(--stage-text-primary)] border-[var(--color-unusonic-info)]/30' : ''}
                ${item.status === 'pending' ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)] hover:bg-[var(--stage-surface-hover)] hover:text-[var(--stage-text-primary)]' : ''}
              `}
            >
              {updating === item.id ? '…' : GEAR_LABELS[item.status]}
            </button>
          </motion.li>
        ))}
      </ul>
      {hasMore && (
        <p className="text-xs text-[var(--stage-text-secondary)] mt-2">
          +{items.length - maxVisible} more
        </p>
      )}
    </StagePanel>
  );
}
