'use client';

/**
 * Inline citation pill for Aion chat responses — Phase 2 Sprint 1 / Week 3.
 *
 * Sonnet emits `<citation kind="..." id="...">Label</citation>` inline after
 * using `lookup_historical_deals` / `lookup_catalog`. Those tags are
 * pre-processed into markdown links with a custom `citation:` scheme inside
 * `AionMarkdown`, and this component renders each one as a styled pill.
 *
 * Behavior:
 *   - Compact inline pill that click-navigates to the record.
 *   - On hover (after a short delay), resolves snippet + label via
 *     `resolveCitation`; renders a small card below the pill.
 *   - Resolution is lazy — the pill mounts as plain text with fallback label,
 *     then upgrades on hover. Nothing fetches until the user expresses intent.
 *   - RLS guards the resolver — cross-workspace / unknown ids degrade to a
 *     plain-label pill with no hover card.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.3.
 */

import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Package, User, Mail, ArrowUpRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  resolveCitation,
  type CitationKind,
  type CitationResolution,
} from '../actions/resolve-citation';

interface CitationPillProps {
  kind: CitationKind;
  id: string;
  /** Label emitted by Sonnet between the tags — used before resolution completes. */
  fallbackLabel: string;
}

const HOVER_OPEN_DELAY_MS = 250;

// Lucide icons at 11px match the rest of the Stage Engineering iconography
// system — never ASCII shapes, which read as debug placeholders. One glyph
// per kind so owners can scan a response without reading every pill.
const KIND_ICON: Record<CitationKind, typeof Briefcase> = {
  deal: Briefcase,
  entity: User,
  catalog: Package,
  message: Mail,
};

const KIND_LABEL: Record<CitationKind, string> = {
  deal: 'Deal',
  entity: 'Contact',
  catalog: 'Catalog',
  message: 'Message',
};

/**
 * Synthesize an href from kind + id without waiting for the resolver.
 * The resolver still runs — it upgrades the label and snippet — but the
 * pill is a functional link the instant it mounts. Previously, clicks
 * before the resolver returned did nothing (or worse, bubbled up to an
 * ancestor and mis-navigated).
 */
const KIND_HREF: Record<CitationKind, (id: string) => string> = {
  deal: (id) => `/events?selected=${id}`,
  entity: (id) => `/network/${id}`,
  catalog: (id) => `/settings/catalog?open=${id}`,
  // Message fallback href — resolveCitation upgrades this to the full
  // /events/deal/<id>/replies?message=<id> path once it returns the deal_id.
  // The raw /messages route does not exist today; in that gap the pill is
  // still a visual pill with a hover card, just not click-navigable.
  message: () => '#',
};

// Pill component is memo'd because chat streams can re-render the parent
// markdown block on every text-delta; without memo the pill would re-mount
// on every chunk and lose hover state.
export const CitationPill = memo(function CitationPill({
  kind,
  id,
  fallbackLabel,
}: CitationPillProps) {
  const [resolved, setResolved] = useState<CitationResolution | null | 'unresolvable'>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();

  // createPortal needs a document target, which is only available after
  // hydration. Guarding with a mount flag avoids SSR/hydration mismatches
  // while still allowing the tooltip to render in a portal on the client.
  useEffect(() => { setMounted(true); }, []);

  // Resolve eagerly on mount so the pill is a functional <Link> immediately
  // — a click shouldn't require a prior hover to activate navigation. Each
  // chat message carries at most ~3 pills so the query load is tiny; lazy
  // deferral was causing "nothing happens on click" when the user skipped
  // the hover interaction.
  useEffect(() => {
    let cancelled = false;
    resolveCitation(kind, id)
      .then((result) => {
        if (cancelled) return;
        setResolved(result ?? 'unresolvable');
      })
      .catch(() => {
        if (cancelled) return;
        setResolved('unresolvable');
      });
    return () => { cancelled = true; };
  }, [kind, id]);

  const handleEnter = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => setIsHovered(true), HOVER_OPEN_DELAY_MS);
  }, []);

  const handleLeave = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    setIsHovered(false);
  }, []);

  useEffect(() => {
    return () => { if (openTimerRef.current) clearTimeout(openTimerRef.current); };
  }, []);

  // Compute tooltip anchor position when the hover opens. We read the pill's
  // bounding rect relative to the viewport and pick a placement:
  //   - below when there's enough room
  //   - above when the pill is in the lower third of the viewport
  // Portaling to <body> means the tooltip can't be clipped by a scroll
  // ancestor's overflow, which is what was cutting the bottom off inside the
  // chat container on the /aion tab.
  useLayoutEffect(() => {
    if (!isHovered || !anchorRef.current) {
      setTooltipPos(null);
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    // Leave ~120px clearance for the tooltip itself + a bit of breathing room
    const roomBelow = viewportH - rect.bottom;
    const placement: 'below' | 'above' = roomBelow < 140 ? 'above' : 'below';
    setTooltipPos({
      top: placement === 'below' ? rect.bottom + 6 : rect.top - 6,
      left: rect.left,
      placement,
    });
  }, [isHovered]);

  const label = resolved && resolved !== 'unresolvable' ? resolved.label : fallbackLabel;
  // Always compute an href from kind+id so the pill is a functional <Link>
  // from mount. The resolver's href is preferred once it returns (may carry
  // a more specific path), but the synthesized kind-based href covers the
  // pre-resolution window.
  const href =
    (resolved && resolved !== 'unresolvable' && resolved.href) ||
    KIND_HREF[kind](id);
  const snippet = resolved && resolved !== 'unresolvable' ? resolved.snippet : null;
  const isUnresolvable = resolved === 'unresolvable';

  // Inline pill — matte surface at raised brightness, lucide icon, pill shape.
  // Padding, font size, line height, and text-decoration are driven via
  // inline style so the Stage prose cascade can't override them; earlier
  // versions used Tailwind arbitrary classes but they occasionally lost the
  // specificity fight against global `.aion-prose a` rules.
  const Icon = KIND_ICON[kind];
  // Inline-block (not flex) so the pill sits on the text baseline like a
  // proper inline element instead of stretching to the line height. Padding
  // is generous enough to read as a deliberate chip, not a squeezed
  // underline replacement.
  const pillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    fontSize: '0.88em',
    lineHeight: 1.15,
    textDecoration: 'none',
    verticalAlign: 'middle',
    margin: '0 1px',
  };
  const pillClasses = cn(
    'group/pill',
    'rounded-full',
    'bg-[oklch(1_0_0_/_0.06)]',
    'ring-1 ring-inset ring-[oklch(1_0_0_/_0.08)]',
    'text-[var(--stage-text-primary)]',
    'font-medium',
    'transition-[background-color,box-shadow] duration-[100ms] ease-out',
    !isUnresolvable && [
      'cursor-pointer',
      'hover:bg-[oklch(1_0_0_/_0.10)]',
      'hover:ring-[oklch(1_0_0_/_0.14)]',
      'hover:shadow-[0_0_0_1px_oklch(1_0_0_/_0.04),0_1px_2px_oklch(0_0_0_/_0.25)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.72_0_0)]',
    ],
    isUnresolvable && 'opacity-60 cursor-default',
  );

  const pillBody = (
    <>
      <Icon
        size={11}
        strokeWidth={2}
        className={cn(
          'shrink-0',
          'text-[var(--stage-text-tertiary)]',
          'transition-colors duration-[100ms]',
          !isUnresolvable && 'group-hover/pill:text-[var(--stage-text-secondary)]',
        )}
        aria-hidden
      />
      <span
        className="truncate max-w-[32ch]"
        style={{ textDecoration: 'none' }}
      >
        {label}
      </span>
      {!isUnresolvable && (
        <ArrowUpRight
          size={10}
          strokeWidth={2.25}
          className={cn(
            'shrink-0',
            'text-[var(--stage-text-tertiary)]',
            'opacity-0 -ml-[2px] -mr-[1px] w-0',
            'transition-[opacity,width,margin,color] duration-[120ms]',
            'group-hover/pill:opacity-100 group-hover/pill:w-[10px] group-hover/pill:ml-[1px] group-hover/pill:text-[var(--stage-text-secondary)]',
          )}
          aria-hidden
        />
      )}
    </>
  );

  // Explicit navigation on click. We use `window.location.assign` rather than
  // router.push because when the pill is clicked while ON the same route
  // (e.g. /events?selected=A → /events?selected=B), Next.js sometimes fails to
  // re-render the deal-card state that depends on server-fetched data keyed
  // on the query param — the URL changes but the old deal stays on screen.
  // A full page load forces the target route to render its server component
  // with the new param. Cost: one extra network round-trip vs client-side
  // routing; benefit: 100% reliable.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Honor middle-click / cmd-click / ctrl-click — let the browser do its
      // normal open-in-new-tab behavior.
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      // Client-side navigation + explicit refresh. router.push alone doesn't
      // re-fetch server components when only the query string changes, which
      // previously left the stale deal on screen. `router.refresh` forces a
      // re-render with the new search params so the destination deal renders
      // correctly. Using client-side nav (not window.location.assign) keeps
      // in-flight server actions from being aborted mid-flight, which was
      // generating "Failed to fetch" noise in Sentry.
      router.push(href);
      router.refresh();
    },
    [href, router],
  );

  const interactivePill = (
    <a
      ref={anchorRef}
      href={href}
      style={pillStyle}
      className={pillClasses}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {pillBody}
    </a>
  );

  const tooltip =
    mounted && isHovered && !isUnresolvable && tooltipPos ? (
      createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: tooltipPos.placement === 'above' ? 'translateY(-100%)' : undefined,
            zIndex: 9999,
          }}
          className={cn(
            'min-w-[200px] max-w-[280px]',
            'flex flex-col gap-[2px]',
            'px-3 py-2 rounded-[8px]',
            'ring-1 ring-inset ring-[oklch(1_0_0_/_0.08)]',
            'bg-[var(--stage-surface-raised,oklch(0.22_0_0))]',
            'shadow-[0_8px_24px_-6px_oklch(0_0_0_/_0.5),0_0_0_1px_oklch(0_0_0_/_0.3)]',
            'pointer-events-none',
          )}
        >
          <span className="flex items-center gap-1.5 text-[var(--stage-text-tertiary)] text-[0.68rem] leading-none tracking-[0.04em] uppercase font-medium">
            <Icon size={10} strokeWidth={2} aria-hidden />
            {KIND_LABEL[kind]}
          </span>
          <span className="block text-[var(--stage-text-primary)] text-[0.88rem] leading-[1.35] font-medium truncate">
            {label}
          </span>
          {snippet ? (
            <span className="block text-[var(--stage-text-secondary)] text-[0.76rem] leading-[1.4]">
              {snippet}
            </span>
          ) : resolved === null ? (
            <span className="block text-[var(--stage-text-tertiary)] text-[0.76rem] leading-[1.4] italic">
              Loading…
            </span>
          ) : null}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <>
      {interactivePill}
      {tooltip}
    </>
  );
});
