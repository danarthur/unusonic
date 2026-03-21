'use client';

import { motion } from 'framer-motion';
import { Clock, MapPin } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type StreamCardItem = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source: 'deal' | 'event';
  /** Sales = amber, Ops = blue, Finance = rose */
  mode?: 'sales' | 'ops' | 'finance';
};

const glowBorderClass: Record<NonNullable<StreamCardItem['mode']>, string> = {
  sales: 'border-l-[var(--color-neon-amber)]',
  ops: 'border-l-[var(--color-neon-blue)]',
  finance: 'border-l-[var(--color-neon-rose)]',
};

export function StreamCard({
  item,
  selected,
  onClick,
  className,
}: {
  item: StreamCardItem;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  const mode = item.mode ?? (item.source === 'deal' ? 'sales' : 'ops');
  const glowClass = glowBorderClass[mode];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SIGNAL_PHYSICS}
      className={className}
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={SIGNAL_PHYSICS}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] rounded-2xl"
      >
        <LiquidPanel
          hoverEffect
          className={cn(
            'liquid-card p-4 border-l-4 min-h-0 rounded-[28px]',
            glowClass,
            selected && 'ring-2 ring-[var(--color-neon-blue)] ring-offset-2 ring-offset-[var(--color-obsidian)]'
          )}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-ceramic font-medium tracking-tight truncate leading-none">
                {item.title ?? 'Untitled Production'}
              </h3>
              {item.status && (
                <span className="shrink-0 text-xs uppercase tracking-widest text-ink-muted font-medium">
                  {item.status.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-muted leading-relaxed truncate">{item.client_name ?? 'Client'}</p>
            <div className="flex items-center gap-3 text-xs text-ink-muted mt-1">
              <span className="flex items-center gap-1.5">
                <Clock size={12} className="shrink-0 text-ink-muted" aria-hidden />
                {item.event_date
                  ? new Date(item.event_date).toLocaleDateString()
                  : 'TBD'}
              </span>
              <span className="flex items-center gap-1.5 truncate">
                <MapPin size={12} className="shrink-0 text-ink-muted" aria-hidden />
                {item.location?.split(',')[0] ?? 'TBD'}
              </span>
            </div>
          </div>
        </LiquidPanel>
      </motion.button>
    </motion.div>
  );
}
