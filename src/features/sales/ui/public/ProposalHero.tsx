'use client';

import { motion } from 'framer-motion';
import { Calendar, Building2, MapPin } from 'lucide-react';
import type { PublicProposalDTO } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface ProposalHeroProps {
  data: PublicProposalDTO;
  className?: string;
}

/**
 * ProposalHero — the topmost section of the public proposal.
 *
 * Layout alignment is driven by --portal-hero-align (center | left).
 * We use a wrapper div with text-align and matching flexbox justify
 * so all children inherit the alignment from one source of truth.
 */
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function ProposalHero({ data, className }: ProposalHeroProps) {
  const { event, workspace, venue } = data;
  const clientName = event.clientName ?? event.title ?? 'Client';

  let eventDate: string | null = null;
  if (event.startsAt) {
    const datePart = new Date(event.startsAt).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (event.hasEventTimes) {
      const startTime = formatTime(event.startsAt);
      const endTime = event.endsAt ? formatTime(event.endsAt) : null;
      eventDate = endTime
        ? `${datePart} · ${startTime} – ${endTime}`
        : `${datePart} · ${startTime}`;
    } else {
      eventDate = datePart;
    }
  }

  const eventTitle = event.title && event.title !== clientName ? event.title : null;

  // CSS custom property values for alignment — consumed via inline styles.
  // --portal-hero-align maps: 'center' → center, 'left' → flex-start / left.
  const alignStyle = {
    textAlign: 'var(--portal-hero-align, center)' as React.CSSProperties['textAlign'],
  };
  // For flex containers: 'center' → center, 'left' → start
  // CSS can't do this mapping natively, so we use a second token.
  // We'll just set both text-align and align-items via the same var.

  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn('w-full max-w-2xl mx-auto', className)}
      style={alignStyle}
    >
      <div className="flex mb-4" style={alignStyle}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-widest"
          style={{
            border: '1px solid color-mix(in oklch, var(--color-unusonic-success) 35%, transparent)',
            background: 'oklch(0.95 0.04 145 / 0.3)',
            color: 'oklch(0.40 0.12 145)',
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'oklch(0.40 0.12 145)' }}
            />
          </span>
          Live
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
        className="relative rounded-[var(--portal-radius)] portal-levitation-strong"
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          padding: 'var(--portal-card-padding)',
          textAlign: 'var(--portal-hero-align, center)' as React.CSSProperties['textAlign'],
        }}
      >
        {workspace.logoUrl ? (
          <div className="flex mb-5" style={alignStyle}>
            <img
              src={workspace.logoUrl}
              alt={workspace.name}
              className="h-10 w-auto object-contain"
            />
          </div>
        ) : (
          <p
            className="mb-5"
            style={{
              color: 'var(--portal-text-secondary)',
              fontSize: 'var(--portal-label-size)',
              fontWeight: 'var(--portal-label-weight)',
              letterSpacing: 'var(--portal-label-tracking)',
              textTransform: 'var(--portal-label-transform)' as React.CSSProperties['textTransform'],
            }}
          >
            {workspace.name}
          </p>
        )}

        <p
          className="text-base sm:text-lg tracking-wide mb-1.5"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Prepared for {clientName}
        </p>
        <h1
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-[1.15]"
          style={{
            color: 'var(--portal-text)',
            fontFamily: 'var(--portal-font-heading)',
            fontWeight: 'var(--portal-heading-weight)',
            letterSpacing: 'var(--portal-heading-tracking)',
          }}
        >
          {eventTitle ?? 'Proposal'}
        </h1>

        <div className="flex flex-wrap gap-2.5 mt-6" style={alignStyle}>
          {eventDate && (
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium"
              style={{
                border: 'var(--portal-border-width) solid var(--portal-border)',
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text)',
                borderRadius: 'var(--portal-btn-radius)',
              }}
            >
              <Calendar className="size-3.5 shrink-0 opacity-50" aria-hidden />
              {eventDate}
            </span>
          )}
          <span
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium"
            style={{
              border: 'var(--portal-border-width) solid var(--portal-border)',
              backgroundColor: 'var(--portal-accent-subtle)',
              color: 'var(--portal-text)',
              borderRadius: 'var(--portal-btn-radius)',
            }}
          >
            <Building2 className="size-3.5 shrink-0 opacity-50" aria-hidden />
            {workspace.name}
          </span>
          {venue && (
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium"
              style={{
                border: 'var(--portal-border-width) solid var(--portal-border)',
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text)',
                borderRadius: 'var(--portal-btn-radius)',
              }}
            >
              <MapPin className="size-3.5 shrink-0 opacity-50" aria-hidden />
              {venue.name}
            </span>
          )}
        </div>
      </motion.div>
    </motion.header>
  );
}
