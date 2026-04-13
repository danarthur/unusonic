'use client';

import { motion } from 'framer-motion';
import { Calendar, Building2, MapPin, Clock } from 'lucide-react';
import type { PublicProposalDTO } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const spring = STAGE_MEDIUM;

export interface ProposalHeroProps {
  data: PublicProposalDTO;
  className?: string;
  /** Optional hero background image URL (from workspace portal settings). */
  heroImageUrl?: string | null;
  /** Accent-colored stripe on hero card edge. */
  accentBand?: 'none' | 'top' | 'bottom';
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

export function ProposalHero({ data, className, heroImageUrl, accentBand = 'none' }: ProposalHeroProps) {
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
      className={cn('w-full mx-auto', className)}
      style={{
        ...textAlignStyle,
        maxWidth: 'var(--portal-content-max-width, 48rem)',
      } as React.CSSProperties}
    >
      <div className="mb-4" style={textAlignStyle}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest"
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
        className="relative rounded-[var(--portal-radius)] portal-levitation-strong overflow-hidden"
        style={{
          backgroundColor: 'var(--portal-hero-surface, var(--portal-surface))',
          border: heroImageUrl ? 'none' : 'var(--portal-border-width) solid var(--portal-border)',
          padding: 'var(--portal-hero-padding, var(--portal-card-padding))',
          textAlign: 'var(--portal-hero-align, center)' as React.CSSProperties['textAlign'],
        }}
      >
        {/* Accent band — colored stripe at top or bottom edge */}
        {accentBand !== 'none' && !heroImageUrl && (
          <div
            className={cn(
              'absolute left-0 right-0',
              accentBand === 'top' ? 'top-0' : 'bottom-0',
            )}
            style={{
              height: '4px',
              backgroundColor: 'var(--portal-accent)',
            }}
          />
        )}

        {/* Background image with tint overlay */}
        {heroImageUrl && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImageUrl})` }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'oklch(0.10 0 0 / 0.55)' }}
            />
          </>
        )}
        {/* Content wrapper — relative z-10 to sit above background image */}
        <div className={cn(heroImageUrl && 'relative z-10')}>
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
                color: heroImageUrl ? 'oklch(1 0 0 / 0.7)' : 'var(--portal-text-secondary)',
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
            style={{ color: heroImageUrl ? 'oklch(1 0 0 / 0.75)' : 'var(--portal-text-secondary)' }}
          >
            Prepared for {clientName}
          </p>
          <h1
            className="leading-[1.15]"
            style={{
              color: heroImageUrl ? 'oklch(1 0 0 / 0.95)' : 'var(--portal-text)',
              fontFamily: 'var(--portal-font-heading)',
              fontWeight: 'var(--portal-heading-weight)',
              letterSpacing: 'var(--portal-heading-tracking)',
              fontSize: 'var(--portal-hero-title-size, 2rem)',
            }}
          >
            {eventTitle ?? 'Proposal'}
          </h1>

          <div className="mt-6 [&>*]:mr-2.5 [&>*]:mb-2.5" style={textAlignStyle}>
            {eventDate && (
              <span
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium"
                style={{
                  border: heroImageUrl ? '1px solid oklch(1 0 0 / 0.2)' : 'var(--portal-border-width) solid var(--portal-border)',
                  backgroundColor: heroImageUrl ? 'oklch(1 0 0 / 0.1)' : 'var(--portal-accent-subtle)',
                  color: heroImageUrl ? 'oklch(1 0 0 / 0.9)' : 'var(--portal-text)',
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
                  border: heroImageUrl ? '1px solid oklch(1 0 0 / 0.2)' : 'var(--portal-border-width) solid var(--portal-border)',
                  backgroundColor: heroImageUrl ? 'oklch(1 0 0 / 0.1)' : 'var(--portal-accent-subtle)',
                  color: heroImageUrl ? 'oklch(1 0 0 / 0.9)' : 'var(--portal-text)',
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
                border: heroImageUrl ? '1px solid oklch(1 0 0 / 0.2)' : 'var(--portal-border-width) solid var(--portal-border)',
                backgroundColor: heroImageUrl ? 'oklch(1 0 0 / 0.1)' : 'var(--portal-accent-subtle)',
                color: heroImageUrl ? 'oklch(1 0 0 / 0.9)' : 'var(--portal-text)',
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
                  border: heroImageUrl ? '1px solid oklch(1 0 0 / 0.2)' : 'var(--portal-border-width) solid var(--portal-border)',
                  backgroundColor: heroImageUrl ? 'oklch(1 0 0 / 0.1)' : 'var(--portal-accent-subtle)',
                  color: heroImageUrl ? 'oklch(1 0 0 / 0.9)' : 'var(--portal-text)',
                  borderRadius: 'var(--portal-btn-radius)',
                }}
              >
                <MapPin className="size-3.5 shrink-0 opacity-50" aria-hidden />
                {venue.name}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.header>
  );
}
