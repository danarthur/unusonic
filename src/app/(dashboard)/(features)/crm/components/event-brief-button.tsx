'use client';

/**
 * EventBriefButton — Phase 3 §3.9 mobile-primary "Brief me" affordance.
 *
 * Lives on the event page header. On mobile, this is the ambient way to hear
 * what the day looks like — owner walks into Cipriani at 2pm for a 6pm call,
 * taps, gets 90 seconds of text/audio. On desktop, it's a secondary
 * convenience for the same owner at a laptop.
 *
 * Fire-and-forget telemetry: on each open, POST to /api/aion/telemetry/brief-open
 * so the kill-if-usage metric (§3.9 U1 — <30% opens-twice-in-week at 90-day
 * mark = cut) can be tracked without aion_events table (which lands Sprint 3).
 * Non-blocking; a network error here does not prevent the overlay.
 */

import React, { useCallback, useState } from 'react';
import { Headphones } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { BriefOverlay } from './brief-overlay';

export interface EventBriefButtonProps {
  eventId: string;
  className?: string;
}

export function EventBriefButton({ eventId, className }: EventBriefButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
    // Fire-and-forget telemetry — no error handling; the overlay runs either way.
    void fetch('/api/aion/telemetry/brief-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    }).catch(() => {});
  }, [eventId]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'border border-[oklch(1_0_0_/_0.08)] hover:border-[oklch(1_0_0_/_0.14)] transition-colors',
          className,
        )}
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        aria-label="Brief me on this event"
      >
        <Headphones size={12} aria-hidden />
        Brief me
      </button>
      <BriefOverlay eventId={eventId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
