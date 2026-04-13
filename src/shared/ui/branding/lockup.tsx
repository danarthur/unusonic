'use client';

import { LivingLogo, type LivingLogoStatus } from './living-logo';
import { AionMark } from './aion-mark';
import { Wordmark } from './wordmark';

/**
 * Lockup — Mark + Wordmark compositions.
 *
 * Five variants decided in the brand identity session:
 *   horizontal  Phase Mark left + UNUSONIC right (primary)
 *   stacked     Phase Mark above + UNUSONIC below (square contexts)
 *   symbol      Phase Mark alone (favicon, collapsed sidebar)
 *   wordmark    UNUSONIC text only (legal, footers)
 *   aion        Aion Mark + AION (AI sub-brand)
 *
 * Critical invariant: mark rendered height = wordmark cap height.
 */

type LockupVariant = 'horizontal' | 'stacked' | 'symbol' | 'wordmark' | 'aion';
type LockupSize = 'sm' | 'md' | 'lg';

interface LockupProps {
  variant: LockupVariant;
  size?: LockupSize;
  status?: LivingLogoStatus;
  className?: string;
}

// Cap-height ratio for Geist Sans ≈ 0.72 of font-size.
// We derive font-size from mark height so that cap height = mark height.
// fontSize = markHeight / 0.72
const SIZE_SCALE = {
  sm: { mark: 24, fontSize: 11 },
  md: { mark: 40, fontSize: 18 },
  lg: { mark: 56, fontSize: 25 },
} as const;

export function Lockup({
  variant,
  size = 'md',
  status = 'idle',
  className,
}: LockupProps) {
  const scale = SIZE_SCALE[size];

  if (variant === 'symbol') {
    return <LivingLogo size={scale.mark} status={status} className={className} />;
  }

  if (variant === 'wordmark') {
    return (
      <Wordmark
        brand="unusonic"
        fontSize={scale.fontSize}
        className={`text-[var(--stage-text-primary)] ${className ?? ''}`}
      />
    );
  }

  const isAion = variant === 'aion';
  const Mark = isAion ? AionMark : LivingLogo;
  const brand = isAion ? 'aion' : 'unusonic';
  const isStacked = variant === 'stacked';

  return (
    <div
      className={`inline-flex ${isStacked ? 'flex-col items-center' : 'flex-row items-center'} ${className ?? ''}`.trim()}
      style={{ gap: isStacked ? scale.mark * 0.2 : scale.mark * 0.35 }}
      role="img"
      aria-label={isAion ? 'Aion' : 'Unusonic'}
    >
      <Mark size={scale.mark} status={status} />
      <Wordmark
        brand={brand}
        fontSize={scale.fontSize}
        className="text-[var(--stage-text-primary)]"
      />
    </div>
  );
}

export type { LockupVariant, LockupSize, LockupProps };
