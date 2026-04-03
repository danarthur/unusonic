'use client';

import { motion } from 'framer-motion';
import { Calendar, Building2, MapPin, Clock } from 'lucide-react';
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
function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

export function ProposalHero({ data, className }: ProposalHeroProps) {
  const { event, workspace, venue } = data;
  const clientName = event.clientName ?? event.title ?? 'Client';

  let eventDate: string | null = null;
  if (event.startsAt) {
    eventDate = new Date(event.startsAt).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // Build time label from raw HH:MM strings (avoids timezone issues)
  let timeLabel: string | null = null;
  if (event.hasEventTimes && event.eventStartTime) {
    timeLabel = formatTime12(event.eventStartTime);
    if (event.eventEndTime) {
      timeLabel += ` \u2013 ${formatTime12(event.eventEndTime)}`;
    }
  }

  const eventTitle = event.title && event.title !== clientName ? event.title : null;

  // Alignment — driven by --portal-hero-align (center | left depending on theme).
  // text-align works for text. For flex containers, we need justify-content.
  // CSS can't map 'left' → 'flex-start' via a single var, so we read the computed value client-side isn't possible in SSR.
  // Instead: use 'center' as default, and add a CSS class that themes can override.
  const textAlignStyle = {
    textAlign: 'var(--portal-hero-align, center)' as React.CSSProperties['textAlign'],
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn('w-full max-w-2xl mx-auto', className)}
      style={textAlignStyle}
    >
      <div className="mb-4" style={textAlignStyle}>
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
          <div className="mb-5" style={textAlignStyle}>
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

        <div className="mt-6 [&>*]:mr-2.5 [&>*]:mb-2.5" style={textAlignStyle}>
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
          {timeLabel && (
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium"
              style={{
                border: 'var(--portal-border-width) solid var(--portal-border)',
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text)',
                borderRadius: 'var(--portal-btn-radius)',
              }}
            >
              <Clock className="size-3.5 shrink-0 opacity-50" aria-hidden />
              {timeLabel}
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
