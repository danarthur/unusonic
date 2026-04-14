'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import {
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';
import { DataFreshnessBadge } from '@/widgets/shared/ui/DataFreshnessBadge';

interface WidgetShellProps {
  /** Domain icon displayed in the header */
  icon: LucideIcon;
  /** Widget title — rendered as uppercase silkscreen label */
  label: string;
  /** Optional deep-link rendered as ArrowUpRight in the header */
  href?: string;
  /** Accessible label for the link */
  hrefLabel?: string;
  /** Content */
  children: React.ReactNode;
  /** Extra class on the outer StagePanel */
  className?: string;
  /** Loading state — renders skeleton placeholders instead of children */
  loading?: boolean;
  /** Number of skeleton rows to show when loading (default 3) */
  skeletonRows?: number;
  /** Empty state — renders message instead of children */
  empty?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Custom empty state icon (defaults to the header icon) */
  emptyIcon?: LucideIcon;
  /**
   * Phase 2.4: optional fetch timestamp. Renders a small relative-time
   * indicator in the footer ("3 min ago") that auto-ticks every 60s.
   * Accepts a Date or ISO string. When omitted, no badge is rendered
   * (backward-compatible with every existing caller).
   */
  freshness?: Date | string;
}

/**
 * WidgetShell — Standardized wrapper for all lobby dashboard widgets.
 *
 * Provides consistent: StagePanel surface, header with icon + label + optional
 * deep-link, loading skeletons, and empty state. Every lobby card should use
 * this so the grid reads as a unified instrument panel.
 */
export function WidgetShell({
  icon: Icon,
  label,
  href,
  hrefLabel,
  children,
  className,
  loading = false,
  skeletonRows = 3,
  empty = false,
  emptyMessage = 'Nothing to show right now.',
  emptyIcon,
  freshness,
}: WidgetShellProps) {
  const EmptyIcon = emptyIcon ?? Icon;

  return (
    <StagePanel className={cn('h-full flex flex-col min-h-0', className)}>
      {/* Header — icon + silkscreen label + optional link */}
      <div className="flex items-center justify-between shrink-0 mb-2">
        <h2 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
          {label}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            aria-label={hrefLabel ?? `View ${label}`}
          >
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        )}
      </div>

      {/* Body — loading / empty / content. Branches extracted to keep the
          main component simple (lint: cognitive complexity). */}
      <WidgetShellBody
        loading={loading}
        empty={empty}
        skeletonRows={skeletonRows}
        emptyIcon={EmptyIcon}
        emptyMessage={emptyMessage}
        href={href}
        label={label}
      >
        {children}
      </WidgetShellBody>

      {/* Footer — freshness badge when the caller opts in. Hidden while loading. */}
      {freshness && !loading && (
        <div className="shrink-0 mt-2 flex items-center justify-end">
          <DataFreshnessBadge timestamp={freshness} />
        </div>
      )}
    </StagePanel>
  );
}

// ── Body extracted to keep the main component focused ────────────────────────

interface WidgetShellBodyProps {
  loading: boolean;
  empty: boolean;
  skeletonRows: number;
  emptyIcon: LucideIcon;
  emptyMessage: string;
  href?: string;
  label: string;
  children: React.ReactNode;
}

function WidgetShellBody({
  loading,
  empty,
  skeletonRows,
  emptyIcon: EmptyIcon,
  emptyMessage,
  href,
  label,
  children,
}: WidgetShellBodyProps) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-3 justify-center min-h-0">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-8 stage-skeleton rounded-[var(--stage-radius-input)]',
              i === skeletonRows - 1 && 'w-2/3',
            )}
          />
        ))}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4 min-h-0">
        <EmptyIcon
          className="w-8 h-8 text-[var(--stage-text-secondary)] opacity-20"
          strokeWidth={1}
          aria-hidden
        />
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          {emptyMessage}
        </p>
        {href && (
          <Link
            href={href}
            className="mt-2 text-xs font-medium text-[var(--stage-text-primary)] hover:underline"
          >
            View {label}
          </Link>
        )}
      </div>
    );
  }
  return (
    <motion.div
      className="flex-1 min-h-0 overflow-hidden"
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: {
            staggerChildren: STAGE_STAGGER_CHILDREN,
          },
        },
        hidden: {},
      }}
    >
      {children}
    </motion.div>
  );
}
