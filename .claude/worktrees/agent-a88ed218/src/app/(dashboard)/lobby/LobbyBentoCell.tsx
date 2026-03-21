'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { useLobbyFocus } from './LobbyFocusContext';

interface LobbyBentoCellProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Enable optical bokeh on siblings when this card is focused */
  enableBokeh?: boolean;
}

/**
 * Wraps a Bento cell. Reports focus to LobbyFocusContext; parent applies lobby-bokeh to siblings.
 */
export function LobbyBentoCell({ id, children, className, enableBokeh = true }: LobbyBentoCellProps) {
  const { focusedCardId, setFocusedCardId, isFocused } = useLobbyFocus();
  const focused = isFocused(id);
  const hasBokehActive = focusedCardId != null;

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 280, damping: 36, mass: 1.4 }}
      onFocus={() => enableBokeh && setFocusedCardId(id)}
      onBlur={() => setFocusedCardId(null)}
      onMouseEnter={() => enableBokeh && setFocusedCardId(id)}
      onMouseLeave={() => setFocusedCardId(null)}
      tabIndex={0}
      className={cn(
        'outline-none focus:outline-none rounded-[28px]',
        focused && 'relative z-20 lobby-active-rim',
        hasBokehActive && !focused && 'lobby-recessed relative z-0',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
