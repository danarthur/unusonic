'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import type { EventSummary } from '@/entities/event';

const RunOfShowClient = dynamic(
  () => import('@/app/(dashboard)/(features)/events/[id]/run-of-show/run-of-show-client').then((m) => m.RunOfShowClient),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-12"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);

/* ── Types ───────────────────────────────────────────────────────── */

interface TimelineTabProps {
  eventId: string;
  eventSummary: {
    title: string | null;
    starts_at: string | null;
    location_name: string | null;
    location_address: string | null;
    client_name: string | null;
  };
}

/* ── Component ───────────────────────────────────────────────────── */

export function TimelineTab({ eventId, eventSummary }: TimelineTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 180px)', margin: '0 -1rem', width: 'calc(100% + 2rem)' }}
    >
      {/* Hide the back link — tab nav handles navigation */}
      <style>{`
        .timeline-tab-portal [aria-label="Back to Stream"] { display: none; }
      `}</style>
      <div className="timeline-tab-portal h-full">
        <RunOfShowClient
          eventId={eventId}
          initialEvent={eventSummary as EventSummary}
        />
      </div>
    </motion.div>
  );
}
