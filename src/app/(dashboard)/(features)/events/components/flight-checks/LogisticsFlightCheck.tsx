'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Truck, MapPin, Users } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../../actions/update-flight-check-status';
import { normalizeLogistics } from './types';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

type LogisticsItem = {
  key: 'venue_access_confirmed' | 'truck_loaded' | 'crew_confirmed';
  label: string;
  icon: typeof MapPin;
};

const ALL_LOGISTICS_ITEMS: LogisticsItem[] = [
  { key: 'venue_access_confirmed', label: 'Venue access confirmed', icon: MapPin },
  { key: 'truck_loaded', label: 'Truck loaded', icon: Truck },
  { key: 'crew_confirmed', label: 'Crew confirmed', icon: Users },
];

/** Transport modes that involve a company/rental vehicle. */
const TRUCK_MODES = new Set(['company_van', 'rental_truck']);

type LogisticsFlightCheckProps = {
  eventId: string;
  runOfShowData: RunOfShowData | null;
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
};

export function LogisticsFlightCheck({
  eventId,
  runOfShowData,
  onUpdated,
  defaultCollapsed = false,
}: LogisticsFlightCheckProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [updating, setUpdating] = useState<string | null>(null);

  const state = normalizeLogistics(runOfShowData);
  const transportMode = runOfShowData?.transport_mode ?? runOfShowData?.logistics?.transport_mode ?? null;
  const needsTruck = TRUCK_MODES.has(transportMode as string);

  // Filter out truck-related items when no truck is involved
  const visibleItems = ALL_LOGISTICS_ITEMS.filter((item) => {
    if (item.key === 'truck_loaded' && !needsTruck) return false;
    return true;
  });

  const toggle = async (key: keyof typeof state) => {
    const next = { ...state, [key]: !state[key] };
    setUpdating(key);
    const result = await updateFlightCheckStatus(eventId, { logistics: next as import('@/entities/event/api/get-event-summary').RunOfShowData['logistics'] });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-xl"
      >
        <h3 className="stage-label">Logistics</h3>
        <span className="text-[var(--stage-text-secondary)]">
          {collapsed ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronUp size={18} strokeWidth={1.5} />}
        </span>
      </button>
      {!collapsed && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={STAGE_MEDIUM}
          className="mt-4 space-y-3"
        >
          {visibleItems.map(({ key, label, icon: Icon }) => (
            <li
              key={key}
              className="flex items-center justify-between gap-4 py-2 border-b border-[oklch(1_0_0_/_0.05)] last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={18} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
                <span className="stage-readout">{label}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state[key]}
                onClick={() => toggle(key)}
                disabled={updating === key}
                className={`
                  shrink-0 relative w-11 h-6 rounded-full border transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]
                  disabled:opacity-45
                  ${state[key] ? 'bg-[var(--color-unusonic-success)]/30 border-[var(--color-unusonic-success)]/50' : 'bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.10)]'}
                `}
              >
                <motion.span
                  layout
                  transition={STAGE_LIGHT}
                  className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[var(--stage-text-primary)] shadow-sm"
                  animate={{ x: state[key] ? 20 : 0 }}
                />
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </StagePanel>
  );
}
