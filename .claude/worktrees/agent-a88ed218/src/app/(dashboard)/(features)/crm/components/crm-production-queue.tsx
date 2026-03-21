'use client';

import { useState, useOptimistic } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Sparkles, Plus, FileText, Wallet, Clock, MapPin } from 'lucide-react';
import { CreateGigModal } from './create-gig-modal';

type Gig = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source?: 'deal' | 'event';
  isOptimistic?: boolean;
};

export type OptimisticUpdate =
  | { type: 'add'; gig: Gig }
  | { type: 'revert'; tempId: string }
  | { type: 'replaceId'; tempId: string; realId: string };

function gigsReducer(current: Gig[], update: OptimisticUpdate): Gig[] {
  if (update.type === 'add') {
    return [...current, { ...update.gig, isOptimistic: true }];
  }
  if (update.type === 'revert') {
    return current.filter((g) => g.id !== update.tempId);
  }
  if (update.type === 'replaceId') {
    return current.map((g) =>
      g.id === update.tempId ? { ...g, id: update.realId, isOptimistic: false } : g
    );
  }
  return current;
}

export function CRMProductionQueue({ gigs }: { gigs: Gig[] }) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [optimisticGigs, addOptimisticGig] = useOptimistic(gigs, gigsReducer);

  return (
    <>
      <div className="flex-1 min-h-[80vh] p-6 overflow-y-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-light text-ink tracking-tight mb-2">Production Queue</h1>
            <p className="text-ink-muted">
              {optimisticGigs.length === 0
                ? 'No productions yet.'
                : 'Lead your pipeline from inquiry to execution.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="bg-obsidian text-ceramic px-6 py-3 rounded-full liquid-levitation flex items-center gap-2 transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <Plus size={18} /> New production
          </button>
        </header>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(200px,auto)]"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
            hidden: {},
          }}
        >
          {optimisticGigs.map((gig, index) => (
            <motion.div
              key={gig.id}
              className={`h-full flex flex-col justify-between group ${index === 0 && optimisticGigs.length >= 1 ? 'md:col-span-2 md:row-span-2' : ''}`}
              variants={{
                visible: { opacity: 1, y: 0 },
                hidden: { opacity: 0, y: 12 },
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <LiquidPanel
                hoverEffect={!gig.isOptimistic}
                className={`h-full flex flex-col justify-between ${gig.isOptimistic ? 'opacity-75 animate-pulse' : ''}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 liquid-panel liquid-panel-nested !rounded-full text-2xl text-ink">
                    <Sparkles size={18} />
                  </div>
                  <span className="liquid-panel liquid-panel-nested !rounded-full !p-0 px-2 py-1 text-xs font-mono text-ink-muted">
                    {gig.status ?? '—'}
                  </span>
                </div>

                <Link
                  href={
                    gig.isOptimistic
                      ? '#'
                      : gig.source === 'event'
                        ? `/events/g/${gig.id}`
                        : `/crm/deal/${gig.id}`
                  }
                  className="flex flex-col flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset focus-visible:rounded-2xl"
                  onClick={(e) => gig.isOptimistic && e.preventDefault()}
                >
                  <h3 className="text-xl font-light text-ink mb-1 group-hover:text-emerald-600 transition-colors">
                    {gig.title ?? 'Untitled Production'}
                  </h3>
                  <p className="text-sm text-ink-muted mb-4">{gig.client_name ?? 'Client'}</p>

                  <div className="flex items-center gap-4 text-xs text-ink-muted border-t border-[var(--glass-border)] pt-4 mt-2">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="shrink-0 text-ink-muted" aria-hidden />
                      {gig.event_date
                        ? new Date(gig.event_date).toLocaleDateString()
                        : 'TBD'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} className="shrink-0 text-ink-muted" aria-hidden />
                      {gig.location?.split(',')[0] ?? 'TBD'}
                    </span>
                  </div>
                </Link>

                <div className="mt-4 pt-3 border-t border-[var(--glass-border)] flex gap-2 flex-wrap">
                  {!gig.isOptimistic && gig.source === 'event' && (
                    <>
                      <Link
                        href={`/events/${gig.id}/deal`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                      >
                        <FileText size={14} />
                        Deal room
                      </Link>
                      <Link
                        href={`/events/${gig.id}/finance`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                      >
                        <Wallet size={14} />
                        Finance
                      </Link>
                    </>
                  )}
                </div>
              </LiquidPanel>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <CreateGigModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        addOptimisticGig={addOptimisticGig}
      />
    </>
  );
}
