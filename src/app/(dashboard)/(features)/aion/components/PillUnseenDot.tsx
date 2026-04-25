'use client';

/**
 * Unseen-pill badge dot — Wk 10 D7.
 *
 * Stage Engineering boolean-new convention: a single 6-8px filled dot in
 * --stage-accent. One brief 100ms scale-up on appearance, static thereafter.
 * No pulsing, no count, no urgency color.
 *
 * Per design (`docs/reference/aion-pill-history-design.md` §3.2):
 *   - Dot = "something new"; count badge = "requires action". A 72h-unseen
 *     pill is new-info-only.
 *   - Achromatic accent. Red/yellow are reserved for exception states; an
 *     Aion pill is a whisper, not an alarm.
 *
 * Mount points (Wk 10):
 *   - CRM pipeline deal-row card (leading edge, near the Aion mark)
 *   - AionDealCard collapsed state (one of the two Aion-attention surfaces)
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

interface PillUnseenDotProps {
  /** Pass true to render the dot, false to render nothing. Use the badge-count
   *  query (`aion_proactive_lines_unseen_per_deal_idx`) to drive this prop. */
  show: boolean;
  /** Optional aria label for assistive tech. Defaults to "Unseen Aion pill". */
  ariaLabel?: string;
  className?: string;
  /** Diameter in px. Spec range is 6-8. Defaults to 7. */
  size?: 6 | 7 | 8;
}

export function PillUnseenDot({
  show,
  ariaLabel = 'Unseen Aion pill',
  className,
  size = 7,
}: PillUnseenDotProps) {
  if (!show) return null;
  return (
    <motion.span
      role="status"
      aria-label={ariaLabel}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      style={{ width: size, height: size }}
      className={cn(
        'inline-block rounded-full bg-[var(--stage-accent)] shrink-0',
        className,
      )}
    />
  );
}
