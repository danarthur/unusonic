'use client';

import { motion } from 'framer-motion';
import { Calendar, Building2 } from 'lucide-react';
import type { PublicProposalDTO } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface ProposalHeroProps {
  data: PublicProposalDTO;
  className?: string;
}

export function ProposalHero({ data, className }: ProposalHeroProps) {
  const { event, workspace } = data;
  const clientName = event.clientName ?? event.title ?? 'Client';
  const eventDate = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const eventTitle = event.title && event.title !== clientName ? event.title : null;

  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn('w-full max-w-2xl mx-auto text-center', className)}
    >
      <div className="flex justify-center mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/90 dark:text-emerald-200">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
        className={cn(
          'relative rounded-3xl p-6 sm:p-8 md:p-10',
          'bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)]',
          'liquid-levitation-strong'
        )}
      >
        {workspace.logoUrl ? (
          <div className="flex justify-center mb-5">
            <img
              src={workspace.logoUrl}
              alt={workspace.name}
              className="h-10 w-auto object-contain opacity-90"
            />
          </div>
        ) : (
          <p className="text-xs font-medium tracking-[0.2em] text-ink-muted uppercase mb-5">
            {workspace.name}
          </p>
        )}

        <p className="font-serif text-base sm:text-lg text-ink-muted tracking-wide mb-1.5">
          Prepared for {clientName}
        </p>
        <h1
          className="font-serif text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-ink tracking-tight leading-[1.15]"
          style={{ letterSpacing: '-0.02em' }}
        >
          {eventTitle ?? 'Proposal'}
        </h1>

        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
          {eventDate && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-ink/[0.06] px-3.5 py-1.5 text-sm font-medium text-ink dark:bg-ink/10 dark:text-ink">
              <Calendar className="size-3.5 shrink-0 text-ink/70" aria-hidden />
              {eventDate}
            </span>
          )}
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-ink/[0.06] px-3.5 py-1.5 text-sm font-medium text-ink dark:bg-ink/10 dark:text-ink">
            <Building2 className="size-3.5 shrink-0 text-ink/70" aria-hidden />
            {workspace.name}
          </span>
        </div>
      </motion.div>
    </motion.header>
  );
}
