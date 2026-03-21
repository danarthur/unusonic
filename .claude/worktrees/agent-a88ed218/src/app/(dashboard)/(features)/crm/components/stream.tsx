'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { StreamCard, type StreamCardItem } from './stream-card';
import { CreateGigModal } from './create-gig-modal';
import type { OptimisticUpdate } from './crm-production-queue';
import { SIGNAL_PHYSICS, FLUID_SPRING, PILL_SLIDE_SPRING, M3_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type StreamMode = 'inquiry' | 'active' | 'past';

const STREAM_TABS = [
  { value: 'inquiry' as const, label: 'Inquiry' },
  { value: 'active' as const, label: 'Active' },
  { value: 'past' as const, label: 'Past' },
] as const;

function filterByMode(items: StreamCardItem[], mode: StreamMode): StreamCardItem[] {
  const today = new Date().toISOString().slice(0, 10);
  if (mode === 'inquiry') {
    return items.filter(
      (i) =>
        i.source === 'deal' &&
        (i.status === 'inquiry' || i.status === 'proposal')
    );
  }
  if (mode === 'active') {
    return items.filter(
      (i) =>
        i.source === 'event' ||
        (i.source === 'deal' && i.status === 'contract_sent')
    );
  }
  if (mode === 'past') {
    return items.filter(
      (i) =>
        (i.source === 'deal' && (i.status === 'won' || i.status === 'lost')) ||
        (i.source === 'event' && (i.event_date ?? '') < today)
    );
  }
  return items;
}

export function Stream({
  items,
  selectedId,
  onSelect,
  addOptimisticGig,
  mode,
  onModeChange,
  className,
}: {
  items: StreamCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  addOptimisticGig: (update: OptimisticUpdate) => void;
  mode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  className?: string;
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const tagged: StreamCardItem[] = items.map((i) => {
    let tag: 'sales' | 'ops' | 'finance' = 'ops';
    if (i.source === 'deal') {
      tag = i.status === 'won' || i.status === 'lost' ? 'ops' : 'sales';
    } else {
      tag = (i.event_date ?? '') < today ? 'finance' : 'ops';
    }
    return { ...i, mode: tag };
  });

  const filtered = filterByMode(tagged, mode);

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <header className="shrink-0 flex flex-col gap-4 p-4 border-b border-white/10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.25rem,3vw,1.5rem)] font-medium text-ceramic tracking-tight leading-none">
              Production Grid
            </h1>
            <p className="text-sm text-ink-muted leading-relaxed mt-1">
              {items.length === 0
                ? 'No productions yet.'
                : 'Lead your pipeline from inquiry to execution.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="shrink-0 px-4 py-2.5 rounded-full liquid-levitation flex items-center gap-2 transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] border border-white/10 text-ceramic bg-[var(--glass-bg)] backdrop-blur-xl"
          >
            <Plus size={16} aria-hidden /> New production
          </button>
        </div>

        {/* Liquid Glass segmented control — single pill whose position we animate so the slide is visibly physical */}
        <div
          className="relative flex rounded-[28px] overflow-visible p-1 min-h-[44px] border border-white/10 backdrop-blur-2xl"
          style={{
            background: 'oklch(0.22 0 0 / 0.5)',
            boxShadow: 'inset 0 1px 0 0 oklch(1 0 0 / 0.08)',
          }}
          role="tablist"
          aria-label="Filter stream"
        >
          {/* Sliding pill — x animated with PILL_SLIDE_SPRING so it clearly glides between segments */}
          <motion.span
            className="absolute top-1 bottom-1 rounded-[24px] border border-white/10 backdrop-blur-md z-0"
            style={{
              width: 'calc((100% - 8px) / 3)',
              left: 4,
              background: 'oklch(0.28 0 0 / 0.6)',
              boxShadow:
                'inset 0 1px 0 0 oklch(1 0 0 / 0.12), 0 2px 8px -2px oklch(0 0 0 / 0.25)',
            }}
            animate={{ x: `${STREAM_TABS.findIndex((t) => t.value === mode) * 100}%` }}
            transition={PILL_SLIDE_SPRING}
            aria-hidden
          />
          {STREAM_TABS.map((tab) => (
            <motion.button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={mode === tab.value}
              onClick={() => onModeChange(tab.value)}
              whileTap={{ scale: 0.98 }}
              transition={FLUID_SPRING}
              className={cn(
                'relative z-10 flex-1 py-2.5 text-sm font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] rounded-[24px]',
                mode === tab.value
                  ? 'text-ceramic'
                  : 'text-ink-muted hover:text-ceramic'
              )}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <motion.ul
          key={`stream-list-${mode}`}
          className="flex flex-col gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: M3_STAGGER_CHILDREN } },
            hidden: {},
          }}
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((item) => (
              <motion.li
                key={item.id}
                layout
                variants={{
                  visible: { opacity: 1, y: 0 },
                  hidden: { opacity: 0, y: 8 },
                }}
                transition={SIGNAL_PHYSICS}
              >
                <StreamCard
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => onSelect(item.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>

      <CreateGigModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        addOptimisticGig={addOptimisticGig}
      />
    </div>
  );
}
