'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import {
  SurfaceProvider,
  useSurface,
  surfaceName,
  SURFACE_LEVEL,
  type SurfaceLevelName,
  type SurfaceLevelValue,
} from '@/shared/ui/surface-context';

interface StagePanelProps extends HTMLMotionProps<'div'> {
  children?: React.ReactNode;
  className?: string;
  /** Use nested variant (recessed well — darker than parent) */
  nested?: boolean;
  /** Use elevated variant (card inside a panel — lighter than parent) */
  elevated?: boolean;
  /** Make panel interactive (accent glow on hover) */
  interactive?: boolean;
  /** Status stripe color on left edge */
  stripe?: 'success' | 'warning' | 'error' | 'info' | 'accent' | 'neutral';
  /** Padding preset — uses density-aware CSS vars */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /**
   * Explicit surface level override. When set, this takes precedence over
   * nested/elevated props for the surface context. Useful for containers
   * like modals that are at `raised` level regardless of parent.
   */
  surface?: SurfaceLevelName;
}

const stripeMap = {
  success: 'stage-stripe-success',
  warning: 'stage-stripe-warning',
  error: 'stage-stripe-error',
  info: 'stage-stripe-info',
  accent: 'stage-stripe-accent',
  neutral: 'stage-stripe-neutral',
} as const;

export function StagePanel({
  children = null,
  className,
  nested = false,
  elevated = false,
  interactive = false,
  stripe,
  padding = 'md',
  surface,
  ...rest
}: StagePanelProps) {
  // Not a valid HTML attribute; avoid forwarding (e.g. mistaken layout prop).
  const motionProps = { ...rest } as Record<string, unknown>;
  delete motionProps.static;

  // CSS class is chosen by role (nested/interactive/default), NOT by the elevated
  // prop. The background is driven by the computed data-surface attribute instead,
  // so elevated panels correctly adapt to their parent context.
  const surfaceClass = nested
    ? 'stage-panel-nested'
    : interactive
      ? 'stage-panel-interactive'
      : 'stage-panel';

  // Resolve this panel's surface level for child context.
  // Priority: explicit `surface` prop > nested/elevated props > parent-relative default.
  const parentLevel = useSurface();
  let level: SurfaceLevelValue;
  if (surface) {
    level = SURFACE_LEVEL[surface];
  } else if (nested) {
    level = Math.max(0, parentLevel - 2) as SurfaceLevelValue;
  } else if (elevated) {
    level = Math.min(4, parentLevel + 1) as SurfaceLevelValue;
  } else {
    // Default stage-panel is "surface" level
    level = SURFACE_LEVEL.surface;
  }

  const levelName = surfaceName(level);

  // Density-aware padding via CSS custom properties
  const paddingStyle =
    padding === 'none'
      ? undefined
      : padding === 'sm'
        ? { padding: 'var(--stage-padding-sm, 12px)' }
        : padding === 'md'
          ? { padding: 'var(--stage-padding, 16px)' }
          : { padding: 'calc(var(--stage-padding, 16px) + 4px)' }; // lg = padding + 4

  return (
    <SurfaceProvider level={level}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
        style={paddingStyle}
        data-surface={levelName}
        className={cn(
          surfaceClass,
          stripe && stripeMap[stripe],
          className,
        )}
        {...(motionProps as HTMLMotionProps<'div'>)}
      >
        {children}
      </motion.div>
    </SurfaceProvider>
  );
}

/** Compact readout block: label on top, value below. Tesla instrument cluster pattern. */
export function StageReadout({
  label,
  value,
  size = 'md',
  className,
}: {
  label: string;
  value: string | number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}) {
  const valueClass = {
    sm: 'stage-readout-sm',
    md: 'stage-readout',
    lg: 'stage-readout-lg',
    hero: 'stage-readout-hero',
  }[size];

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="stage-label">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

/** Status dot with optional label */
export function StageDot({
  status,
  label,
  className,
}: {
  status: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={`stage-dot stage-dot-${status}`} />
      {label && <span className="text-xs" style={{ color: 'var(--stage-text-secondary)' }}>{label}</span>}
    </span>
  );
}
