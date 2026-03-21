'use client';

import { motion } from 'framer-motion';
import { TimelineItem } from '@/app/(dashboard)/(features)/events/components/TimelineItem';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_Y_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

interface DailyBriefingClientProps {
  items: any[];
}

export function DailyBriefingClient({ items }: DailyBriefingClientProps) {
  if (!items || items.length === 0) {
    return (
      <motion.div
        className="h-full flex flex-col items-center justify-center text-muted opacity-80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ ...M3_FADE_THROUGH_ENTER, delay: 0.15 }}
      >
        <p className="text-xs tracking-widest uppercase font-sans leading-relaxed">No unread client messages</p>
      </motion.div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto pr-2 custom-scrollbar">
      <motion.div
        className="relative space-y-4 liquid-panel liquid-panel-nested !p-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: M3_STAGGER_CHILDREN,
              delayChildren: M3_STAGGER_DELAY,
            },
          },
          hidden: {},
        }}
      >
        <div className="absolute left-4 top-4 bottom-4 w-px bg-[var(--glass-border)]" />
        {items.map((item, index) => (
          <motion.div
            key={item.id || index}
            className="relative pl-6"
            variants={M3_SHARED_AXIS_Y_VARIANTS}
            transition={M3_FADE_THROUGH_ENTER}
          >
            <div className="absolute left-3 top-1.5 liquid-panel liquid-panel-nested !rounded-full !p-0 w-2.5 h-2.5 !bg-stone/50" />
            <TimelineItem
              item={{ ...item, text: item.content || item.text || 'Entry' }}
              isLast={index === items.length - 1}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

