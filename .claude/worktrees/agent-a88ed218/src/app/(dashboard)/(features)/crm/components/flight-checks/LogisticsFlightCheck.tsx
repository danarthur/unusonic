'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Truck, MapPin, Users } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../../actions/update-flight-check-status';
import { normalizeLogistics } from './types';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

const LOGISTICS_ITEMS = [
  { key: 'venue_access_confirmed' as const, label: 'Venue access confirmed', icon: MapPin },
  { key: 'truck_loaded' as const, label: 'Truck loaded', icon: Truck },
  { key: 'crew_confirmed' as const, label: 'Crew confirmed', icon: Users },
];

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

  const toggle = async (key: keyof typeof state) => {
    const next = { ...state, [key]: !state[key] };
    setUpdating(key);
    const result = await updateFlightCheckStatus(eventId, { logistics: next });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  return (
    <LiquidPanel className="p-5 rounded-[28px] border border-white/10">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-xl"
      >
        <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted">Logistics</h3>
        <span className="text-ink-muted">
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </span>
      </button>
      {!collapsed && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={SIGNAL_PHYSICS}
          className="mt-4 space-y-3"
        >
          {LOGISTICS_ITEMS.map(({ key, label, icon: Icon }) => (
            <li
              key={key}
              className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={18} className="shrink-0 text-ink-muted" aria-hidden />
                <span className="text-ceramic font-medium tracking-tight text-sm">{label}</span>
              </div>
              <motion.button
                type="button"
                role="switch"
                aria-checked={state[key]}
                onClick={() => toggle(key)}
                disabled={updating === key}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={SIGNAL_PHYSICS}
                className={`
                  shrink-0 relative w-11 h-6 rounded-full border transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                  disabled:opacity-60
                  ${state[key] ? 'bg-[var(--color-signal-success)]/30 border-[var(--color-signal-success)]/50' : 'bg-white/5 border-white/10'}
                `}
              >
                <motion.span
                  layout
                  transition={SIGNAL_PHYSICS}
                  className="absolute top-1 left-1 w-4 h-4 rounded-full bg-ceramic shadow-sm"
                  animate={{ x: state[key] ? 20 : 0 }}
                />
              </motion.button>
            </li>
          ))}
        </motion.ul>
      )}
    </LiquidPanel>
  );
}
