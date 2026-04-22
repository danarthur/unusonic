'use client';

/**
 * Sticky scope header for the Aion chat surface.
 *
 * Renders above the message scroll in ChatInterface when the current session
 * has `scopeType !== 'general'`. Follows Linear Intelligence's pattern (the
 * cleanest shipped example — Field Expert survey 2026-04-21): scope badge +
 * record title + live status pill + jump-to-record link, all in a persistent
 * bar that does not scroll away.
 *
 * Design: docs/reference/aion-deal-chat-design.md §7.5.
 *
 * Ambient, not a callout. User Advocate on this: "a name tag, not a fence."
 * We do not explain the scope ("This conversation is scoped to…"); the badge
 * + title does the job without lecturing.
 *
 * The status pill is fetched live on mount rather than read from the stored
 * session title, so a deal that's advanced since the chat started reflects
 * its current stage here (matches the eager-re-fetch discipline in §7.4).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SessionMeta } from '@/shared/ui/providers/SessionContext';
import {
  getDealHeaderForScope,
  type DealHeaderForScope,
} from '@/app/(dashboard)/(features)/crm/actions/get-deal-header-for-scope';

type Props = {
  session: SessionMeta;
};

export function ChatScopeHeader({ session }: Props) {
  // General-scope sessions get no header — the chat surface is already the
  // entire point of the page.
  if (session.scopeType === 'general') return null;
  if (!session.scopeEntityId) return null;

  if (session.scopeType === 'deal') {
    return <DealScopeHeader session={session} />;
  }

  // Phase 2+: scopeType='event' lands when the events surface wires in.
  return null;
}

// ---------------------------------------------------------------------------
// Deal scope header — fetches live deal state on mount
// ---------------------------------------------------------------------------

function DealScopeHeader({ session }: Props) {
  const dealId = session.scopeEntityId as string;
  const [header, setHeader] = useState<DealHeaderForScope | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDealHeaderForScope(dealId).then((result) => {
      if (!cancelled) setHeader(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Before the fetch resolves, render a minimal frame with the stored title
  // so the header height is stable and the layout doesn't jump when the live
  // data arrives.
  const title = header?.title ?? session.title ?? 'Deal';
  const stageLabel = header?.stageLabel ?? null;
  const stageKind = header?.stageKind ?? null;
  const url = header?.url ?? `/crm?selected=${encodeURIComponent(dealId)}`;

  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex items-center gap-3 px-4 py-2',
        'bg-[var(--stage-surface)] border-b border-[var(--stage-edge-subtle)]',
        'text-sm',
      )}
      data-surface="surface"
    >
      {/* Scope badge */}
      <span
        className={cn(
          'stage-label font-mono text-[10px] tracking-wider uppercase shrink-0',
          'text-[var(--stage-text-tertiary)]',
        )}
      >
        DEAL
      </span>

      {/* Record title */}
      <span className="text-[var(--stage-text-primary)] truncate leading-none">
        {title}
      </span>

      {/* Stage pill — renders only once live data lands; stageKind drives color.
          Inline style instead of Tailwind arbitrary-value color-mix() —
          Tailwind v4 silently fails on complex nested function classes like
          `bg-[color-mix(...)]`, which killed the entire CSS compile. */}
      {stageLabel && (
        <span
          className="shrink-0 rounded-[6px] px-2 py-0.5 stage-badge-text leading-tight"
          style={stagePillStyle(stageKind)}
        >
          {stageLabel}
        </span>
      )}

      {/* Spacer + jump link */}
      <Link
        href={url}
        className={cn(
          'ml-auto shrink-0 flex items-center gap-1 text-xs',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
          'transition-colors duration-[80ms]',
        )}
        aria-label="Open deal"
      >
        Open
        <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
      </Link>
    </div>
  );
}

// Status pill style rules. Achromatic accent discipline: working stages render
// neutral; terminal states (won / lost) pick up the semantic status colors.
// Returns a React style object (not a Tailwind class) because Tailwind v4 fails
// to compile arbitrary-value classes wrapping `color-mix(...)` — observed to
// kill the whole CSS build on 2026-04-21.
function stagePillStyle(kind: DealHeaderForScope['stageKind']): React.CSSProperties {
  if (kind === 'won') {
    return {
      backgroundColor: 'color-mix(in oklch, var(--color-unusonic-success) 12%, transparent)',
      color: 'var(--color-unusonic-success)',
    };
  }
  if (kind === 'lost') {
    return {
      backgroundColor: 'color-mix(in oklch, var(--color-unusonic-error) 12%, transparent)',
      color: 'var(--color-unusonic-error)',
    };
  }
  return {
    backgroundColor: 'oklch(1 0 0 / 0.06)',
    color: 'var(--stage-text-secondary)',
  };
}
