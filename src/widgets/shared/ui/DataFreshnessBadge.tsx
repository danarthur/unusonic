'use client';

/**
 * DataFreshnessBadge — Phase 2.4.
 *
 * Renders a small relative-time badge ("3 min ago") keyed off a fetch
 * timestamp. Ticks once a minute via a single setInterval and self-cleans
 * on unmount. Tooltip carries the absolute timestamp.
 *
 * Design tokens: text-xs font-mono var(--stage-text-tertiary) per the
 * analytics_result §2.7 footer pattern.
 *
 * @module widgets/shared/ui/DataFreshnessBadge
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

interface DataFreshnessBadgeProps {
  /** Fetch time — Date instance or ISO string. */
  timestamp: Date | string;
  /** Optional extra class. */
  className?: string;
  /** Override the label prefix (e.g. "Updated", "Synced"). Default: "Updated". */
  label?: string;
}

/**
 * Format a Date as "just now", "3 min ago", "2 hr ago", "yesterday", or an
 * absolute short date. Used for cache-freshness feedback on widgets.
 */
export function formatRelative(to: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - to.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  // Just now — under 60s (and also guard against clock skew returning negative).
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  if (diffHr < 48) return 'yesterday';

  // Absolute fallback — short date in the viewer's locale.
  return to.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Small status dot — neutral, never colored (Stage Engineering achromatic accent). */
function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block w-1 h-1 rounded-full bg-[var(--stage-text-tertiary)] opacity-50"
    />
  );
}

export function DataFreshnessBadge({
  timestamp,
  className,
  label = 'Updated',
}: DataFreshnessBadgeProps) {
  const ts = React.useMemo(
    () => (typeof timestamp === 'string' ? new Date(timestamp) : timestamp),
    [timestamp],
  );

  // Tick once a minute so labels drift without any re-fetch.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 1_000_000), 60_000);
    return () => clearInterval(id);
  }, []);

  const relative = formatRelative(ts);
  const absolute = ts.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        'text-xs font-mono tabular-nums',
        'text-[var(--stage-text-tertiary)]',
        className,
      )}
      title={`${label} ${absolute}`}
      aria-label={`${label} ${absolute}`}
    >
      <Dot />
      <span>{relative}</span>
    </span>
  );
}
