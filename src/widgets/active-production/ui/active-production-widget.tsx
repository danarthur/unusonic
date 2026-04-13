'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { createClient } from '@/shared/api/supabase/client';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };

type ActiveGig = {
  id: string;
  title: string | null;
  event_date: string | null;
};

export function ActiveProductionWidget() {
  const { workspaceId } = useWorkspace();
  const supabase = useMemo(() => createClient(), []);
  const [gigs, setGigs] = useState<ActiveGig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Include events with lifecycle_status in (confirmed, production, live) OR status=confirmed when lifecycle_status is null
    let query = supabase
      .schema('ops')
      .from('events')
      .select('id, title, starts_at')
      .or('lifecycle_status.in.(confirmed,production,live),and(lifecycle_status.is.null,status.eq.confirmed)')
      .order('starts_at', { ascending: true })
      .limit(3);

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    void Promise.resolve(query)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('[ActiveProduction] events query error:', error.message);
          setGigs([]);
        } else {
          const rows = (data ?? []) as Array<{ id: string; title: string | null; starts_at: string }>;
          setGigs(rows.map((e) => ({ id: e.id, title: e.title, event_date: e.starts_at?.slice(0, 10) ?? null })));
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supabase, workspaceId]);

  const hasGigs = gigs.length > 0;

  return (
    <div className="h-64">
      <StagePanel interactive className="h-full flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">Active Production</h2>
          <ArrowUpRight className="w-4 h-4 text-[var(--stage-text-secondary)]" />
        </div>

        <div className="flex flex-col gap-2">
          {loading ? (
            <StagePanel nested className="h-12 w-full stage-skeleton" padding="none" />
          ) : !hasGigs ? (
            <div className="py-6 text-center text-xs text-[var(--stage-text-secondary)] italic leading-relaxed">No active productions</div>
          ) : (
            <motion.div
              className="flex flex-col gap-2"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
                hidden: {},
              }}
            >
              {gigs.map((gig) => (
                <motion.div
                  key={gig.id}
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  transition={M3_ENTER}
                >
                  <Link href={`/events/g/${gig.id}`} className="block">
                    <StagePanel interactive nested className="group flex items-center justify-between" padding="sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-6 w-6 items-center justify-center stage-panel-nested rounded-full">
                          <div className="h-2 w-2 rounded-full bg-[var(--color-unusonic-success)]" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-[var(--stage-text-primary)]">{gig.title ?? 'Untitled Production'}</span>
                          <span className="stage-label leading-relaxed">run of show</span>
                        </div>
                      </div>
                      <span className="text-label text-[var(--stage-text-secondary)]">
                        {gig.event_date ? new Date(gig.event_date).toLocaleDateString() : 'TBD'}
                      </span>
                    </StagePanel>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        <Link href="/crm" className="block w-full mt-4">
          <motion.button
            type="button"
            transition={M3_ENTER}
            className="w-full rounded-xl border border-[oklch(1_0_0_/_0.08)] py-2.5 stage-label transition-[color,background-color] hover:bg-[var(--stage-text-primary)] hover:text-[var(--stage-text-on-accent)]"
          >
            View Production Queue
          </motion.button>
        </Link>
      </StagePanel>
    </div>
  );
}
