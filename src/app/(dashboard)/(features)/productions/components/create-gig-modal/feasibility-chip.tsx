'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ExternalLink, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { parseLocalDateString } from '../ceramic-date-picker';
import type {
  CheckDateFeasibilityResult,
  FeasibilityStatus,
  FeasibilityShow,
  FeasibilityDeal,
  FeasibilityBlackout,
  FeasibilityAdjacent,
} from '../../actions/check-date-feasibility';
import {
  getRolePoolsSummary,
  type RolePool,
} from '../../actions/get-role-pools';

// ─── Status presentation ─────────────────────────────────────────────────────

function statusColor(status: FeasibilityStatus): string {
  switch (status) {
    case 'clear':
      return 'var(--color-unusonic-success, oklch(0.74 0.17 142))';
    case 'caution':
      return 'var(--color-unusonic-warning, oklch(0.80 0.14 73))';
    case 'critical':
      return 'var(--color-unusonic-error, oklch(0.70 0.18 28))';
  }
}

/**
 * A small SVG glyph that varies by status — empty ring (clear), half-filled
 * (caution), filled (critical). Per design doc §6.1: chips must differentiate
 * by shape + text, not color alone, so colorblind users still get the signal.
 */
function StatusGlyph({ status, size = 8 }: { status: FeasibilityStatus; size?: number }) {
  const color = statusColor(status);
  if (status === 'clear') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="4" cy="4" r="3" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }
  if (status === 'caution') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="4" cy="4" r="3.25" fill={color} fillOpacity="0.55" stroke={color} strokeWidth="1.25" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="4" cy="4" r="3.5" fill={color} />
    </svg>
  );
}

function statusLabel(status: FeasibilityStatus): string {
  // For aria-label and screen readers — the text variant of the glyph.
  switch (status) {
    case 'clear':
      return 'Open';
    case 'caution':
      return 'Has open deals';
    case 'critical':
      return 'Booked';
  }
}

// ─── Popover ─────────────────────────────────────────────────────────────────

type PopoverPosition = {
  left: number;
  /** When `dropUp` is set, `bottom` is used instead of `top`. */
  top?: number;
  bottom?: number;
  width: number;
};

function computePopoverPosition(triggerRect: DOMRect, popoverHeight: number): PopoverPosition {
  const margin = 8;
  const minWidth = 280;
  const width = Math.max(triggerRect.width, minWidth);
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const dropUp = spaceBelow < popoverHeight + margin;
  const left = Math.min(
    Math.max(margin, triggerRect.left),
    window.innerWidth - width - margin,
  );
  if (dropUp) {
    return { left, bottom: window.innerHeight - triggerRect.top + margin, width };
  }
  return { left, top: triggerRect.bottom + margin, width };
}

function FeasibilityPopover({
  date,
  feasibility,
  archetypeSlug,
  triggerRef,
  onClose,
  popoverId,
}: {
  date: string;
  feasibility: CheckDateFeasibilityResult;
  archetypeSlug?: string | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  popoverId: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  // Phase 2.1 Sprint 1 — fetch role pools when the popover opens. Sparse
  // (server returns empty pools array if no entities are role-tagged), so
  // the Pool section renders an honesty-empty-state when nothing is set up
  // and disappears entirely once we know there are no pools.
  const [pools, setPools] = useState<RolePool[] | null>(null);
  const [poolsLoaded, setPoolsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // When archetype is set, the action calls the archetype-aware RPC
    // (returns required + optional roles, including zero-entity ones).
    // When not set, the action falls back to the sparse summary RPC.
    getRolePoolsSummary(date, archetypeSlug ?? null)
      .then((summary) => {
        if (cancelled) return;
        setPools(summary.pools);
        setPoolsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPools([]);
          setPoolsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, archetypeSlug]);

  // Position the popover after the first paint so we know its real height,
  // then re-measure on resize so it doesn't fall off-screen mid-interaction.
  // While `position` is null on the first render, the popover renders with
  // visibility:hidden (see style below) so the user never sees the layout jump.
  useEffect(() => {
    const measure = () => {
      if (!triggerRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const measuredHeight = popoverRef.current?.offsetHeight ?? 240;
      setPosition(computePopoverPosition(triggerRect, measuredHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [triggerRef]);

  // Escape closes; focus management returns to the trigger when the popover
  // unmounts (handled in the parent on close).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const formattedDate = (() => {
    try {
      return format(parseLocalDateString(date), 'EEE MMM d, yyyy');
    } catch {
      return date;
    }
  })();

  const headerText =
    feasibility.status === 'clear' && feasibility.blackoutCount === 0
      ? `No conflicts on ${formattedDate}`
      : `Conflicts on ${formattedDate}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      onMouseDown={onClose}
      onTouchStart={onClose}
      data-feasibility-popover-backdrop
    >
      <motion.div
        ref={popoverRef}
        id={popoverId}
        role="dialog"
        aria-label={headerText}
        initial={{ opacity: 0, scale: 0.97, y: -2 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={STAGE_LIGHT}
        data-surface="raised"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={
          position
            ? {
                position: 'fixed',
                left: position.left,
                width: position.width,
                ...(position.top !== undefined ? { top: position.top } : { bottom: position.bottom }),
              }
            : { position: 'fixed', visibility: 'hidden' }
        }
        className="max-h-[60vh] overflow-y-auto rounded-[var(--stage-radius-card,10px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
      >
        <header className="px-3 py-2.5 border-b border-[oklch(1_0_0_/_0.06)] sticky top-0 bg-[var(--ctx-dropdown)] z-10">
          <h2 className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)]">
            {headerText}
          </h2>
        </header>
        <div className="py-1">
          {(() => {
            // "Booked" combines ops.events rows with committed deals (contract
            // sent and beyond). Functionally these are bookings — the user
            // doesn't care that one is post-handoff and one isn't yet. The
            // link target differs (event detail vs deal detail) but the
            // signal is the same.
            const committedDeals = feasibility.pendingDeals.filter((d) => d.is_committed);
            const tentativeDeals = feasibility.pendingDeals.filter((d) => !d.is_committed);
            const hasBooked = feasibility.confirmedShows.length > 0 || committedDeals.length > 0;
            return (
              <>
                {hasBooked && (
                  <Section title="Booked">
                    {feasibility.confirmedShows.map((show) => (
                      <ConfirmedShowRow key={`show-${show.id}`} show={show} />
                    ))}
                    {committedDeals.map((deal) => (
                      <CommittedDealRow key={`deal-${deal.id}`} deal={deal} />
                    ))}
                  </Section>
                )}
                {tentativeDeals.length > 0 && (
                  <Section title="Open deals">
                    {tentativeDeals.map((deal) => (
                      <OpenDealRow key={deal.id} deal={deal} />
                    ))}
                  </Section>
                )}
                {feasibility.blackouts.length > 0 && (
                  <Section title="Crew unavailable" subtitle="Self-reported">
                    {feasibility.blackouts.map((b) => (
                      <BlackoutRow key={`${b.entity_id}-${b.range_start}`} blackout={b} />
                    ))}
                  </Section>
                )}
                {feasibility.adjacentEvents.length > 0 && (
                  <Section title="Adjacent">
                    {feasibility.adjacentEvents.map((adj) => (
                      <AdjacentRow key={adj.id} adjacent={adj} />
                    ))}
                  </Section>
                )}
                {poolsLoaded && pools !== null && pools.length > 0 && (
                  <Section title="Pool">
                    {pools.map((pool) => (
                      <RolePoolRow key={pool.role_tag} pool={pool} />
                    ))}
                  </Section>
                )}
                {feasibility.softLoad.is_heavy && (
                  <p className="px-3 py-2 text-[11px] text-[var(--stage-text-tertiary)] tracking-tight border-t border-[oklch(1_0_0_/_0.04)] italic">
                    Heavy weekend &mdash; {feasibility.softLoad.confirmed_in_72h} confirmed in 72h
                    {feasibility.softLoad.deals_in_72h > 0 && (
                      <> &middot; {feasibility.softLoad.deals_in_72h} {feasibility.softLoad.deals_in_72h === 1 ? 'deal' : 'deals'} in flight</>
                    )}
                  </p>
                )}
                {!hasBooked &&
                  tentativeDeals.length === 0 &&
                  feasibility.blackouts.length === 0 &&
                  feasibility.adjacentEvents.length === 0 &&
                  !feasibility.softLoad.is_heavy &&
                  (!poolsLoaded || pools === null || pools.length === 0) && (
                    <p className="px-3 py-3 text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
                      Nothing on the books for this date.
                    </p>
                  )}
              </>
            );
          })()}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-1">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-1.5 pb-1">
        <h3 className="text-[11px] uppercase tracking-[0.04em] font-medium text-[var(--stage-text-tertiary)]">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ConfirmedShowRow({ show }: { show: FeasibilityShow }) {
  const startTime = (() => {
    try {
      return format(new Date(show.starts_at), 'p');
    } catch {
      return null;
    }
  })();
  return (
    <a
      href={`/events/${show.id}`}
      className="group flex items-start gap-2 px-3 py-2 hover:bg-[oklch(1_0_0/0.05)] transition-colors duration-75"
    >
      <StatusGlyph status="critical" />
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
          {show.title}
        </div>
        {startTime && (
          <div className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight">{startTime}</div>
        )}
      </div>
      <ExternalLink size={12} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" aria-hidden />
    </a>
  );
}

function OpenDealRow({ deal }: { deal: FeasibilityDeal }) {
  return (
    <a
      href={`/productions/deal/${deal.id}`}
      className="group flex items-start gap-2 px-3 py-2 hover:bg-[oklch(1_0_0/0.05)] transition-colors duration-75"
    >
      <StatusGlyph status="caution" />
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
          {deal.title}
        </div>
        {deal.stage_label && (
          <div className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight truncate">
            {deal.stage_label}
          </div>
        )}
      </div>
      <ExternalLink size={12} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" aria-hidden />
    </a>
  );
}

/**
 * Same shape as OpenDealRow but with the red (filled) glyph and the deal's
 * stage shown in the subtitle so the user can distinguish "Contract Sent"
 * from "Deposit Received." The link still goes to the deal page, not an
 * event page — there's no event yet (handoff hasn't happened).
 */
function CommittedDealRow({ deal }: { deal: FeasibilityDeal }) {
  return (
    <a
      href={`/productions/deal/${deal.id}`}
      className="group flex items-start gap-2 px-3 py-2 hover:bg-[oklch(1_0_0/0.05)] transition-colors duration-75"
    >
      <StatusGlyph status="critical" />
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
          {deal.title}
        </div>
        {deal.stage_label && (
          <div className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight truncate">
            {deal.stage_label}
          </div>
        )}
      </div>
      <ExternalLink size={12} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" aria-hidden />
    </a>
  );
}

/**
 * One row per role pool in the popover.
 *
 * Two render modes depending on how the pool was fetched:
 *
 * **Sparse mode** (no archetype set): the pool only appears if the workspace
 * has at least one entity tagged with this role. `qty_required` and
 * `is_optional` are absent. Renders availability summary + person list.
 *
 * **Archetype-aware mode** (Sprint 3, archetype set): the pool surfaces
 * even if zero entities are tagged so the popover can flag missing required
 * roles. Adds a "Required" / "Optional" sub-label and an honesty empty
 * state ("Not set up — tag your team in Roster") on required roles with
 * no entities tagged.
 *
 * Status glyph mirrors the chip:
 *   * empty ring = available / no concern
 *   * half-fill = at-risk (last person on hold)
 *   * filled circle = committed / required-but-empty
 */
function RolePoolRow({ pool }: { pool: RolePool }) {
  const isArchetypeAware = pool.qty_required !== undefined;
  const isRequired = isArchetypeAware && pool.is_optional === false;
  const noOneTagged = pool.in_house_total === 0 && pool.preferred_total === 0;
  const qty = pool.qty_required ?? 1;
  const meetsQty = pool.in_house_available >= qty;

  const summary = (() => {
    if (noOneTagged) {
      return isRequired ? 'Not set up' : 'Not set up · optional';
    }
    if (pool.in_house_total === 0) {
      return `${pool.preferred_total} preferred`;
    }
    const bookedCount = pool.in_house_total - pool.in_house_available;
    if (bookedCount === 0) {
      return `${pool.in_house_available} of ${pool.in_house_total} open`;
    }
    if (pool.in_house_available === 0) {
      return `${pool.in_house_total} of ${pool.in_house_total} booked`;
    }
    return `${pool.in_house_available} of ${pool.in_house_total} open · ${bookedCount} booked`;
  })();

  const overallStatus: FeasibilityStatus = (() => {
    // Required + nobody tagged: red. The owner needs to know.
    if (isRequired && noOneTagged) return 'critical';
    // Optional + nobody tagged: grey. Informational.
    if (noOneTagged) return 'clear';
    // Required + not enough open: red.
    if (isRequired && !meetsQty && pool.in_house_available === 0) return 'critical';
    // Last available person on hold: amber.
    if (pool.in_house_total > 0 && pool.in_house_available === 1) return 'caution';
    // Required + below qty (have some, but not enough): amber.
    if (isRequired && !meetsQty) return 'caution';
    return 'clear';
  })();

  const requirementLabel = (() => {
    if (!isArchetypeAware) return null;
    if (isRequired) {
      return qty > 1 ? `Required · ${qty}` : 'Required';
    }
    return qty > 1 ? `Optional · ${qty}` : 'Optional';
  })();

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusGlyph status={overallStatus} />
        <span className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] font-medium">
          {pool.role_tag}
        </span>
        {requirementLabel && (
          <span className="text-[10px] uppercase tracking-[0.05em] text-[var(--stage-text-tertiary)]">
            {requirementLabel}
          </span>
        )}
        <span className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight ml-auto">
          {summary}
        </span>
      </div>
      {noOneTagged && isArchetypeAware && (
        <p className="ml-4 text-[11px] text-[var(--stage-text-tertiary)] tracking-tight italic">
          Tag your team in Roster to see availability.
        </p>
      )}
      {pool.in_house.length > 0 && (
        <ul className="ml-4 flex flex-col gap-0.5">
          {pool.in_house.map((entry) => (
            <li
              key={entry.entity_id}
              className="flex items-center gap-1.5 text-[11px] tracking-tight"
            >
              <StatusGlyph status={entry.committed ? 'critical' : 'clear'} size={6} />
              <span className="text-[var(--stage-text-secondary)]">{entry.name}</span>
              {entry.committed && entry.conflict_label && (
                <span className="text-[var(--stage-text-tertiary)] truncate">
                  · {entry.conflict_label}
                </span>
              )}
              {entry.committed && !entry.conflict_label && (
                <span className="text-[var(--stage-text-tertiary)]">· booked</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pool.preferred_total > 0 && (
        <div className="ml-4 mt-1 text-[11px] text-[var(--stage-text-tertiary)] tracking-tight">
          + {pool.preferred_total} preferred {pool.preferred_total === 1 ? 'sub' : 'subs'}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 2.1 Sprint 5 — adjacent-event row in the popover. Shows confirmed
 * events ±36h that aren't on the queried date — load-in / strike windows
 * for the wedding-doubleheader case. Links to the event page.
 */
function AdjacentRow({ adjacent }: { adjacent: FeasibilityAdjacent }) {
  const startTime = (() => {
    try {
      return format(new Date(adjacent.starts_at), 'EEE p');
    } catch {
      return null;
    }
  })();
  const sideLabel = (() => {
    if (adjacent.side === 'before') return 'Day before · check load-in window';
    if (adjacent.side === 'after') return 'Day after · check strike window';
    return 'Overlapping commitment';
  })();

  return (
    <a
      href={`/events/${adjacent.id}`}
      className="group flex items-start gap-2 px-3 py-2 hover:bg-[oklch(1_0_0/0.05)] transition-colors duration-75"
    >
      <StatusGlyph status="caution" />
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
          {adjacent.title}
        </div>
        <div className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight truncate">
          {startTime ? `${sideLabel} · ${startTime}` : sideLabel}
        </div>
      </div>
      <ExternalLink size={12} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)]" aria-hidden />
    </a>
  );
}

function BlackoutRow({ blackout }: { blackout: FeasibilityBlackout }) {
  const range =
    blackout.range_start === blackout.range_end
      ? blackout.range_start
      : `${blackout.range_start} — ${blackout.range_end}`;
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <StatusGlyph status="caution" />
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
          {blackout.entity_name}
        </div>
        <div className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight">{range}</div>
      </div>
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

export type FeasibilityChipProps = {
  /** yyyy-MM-dd that the feasibility result corresponds to. Used in the popover header. */
  date: string;
  feasibility: CheckDateFeasibilityResult | null;
  loading?: boolean;
  /** Overrides the chip body label (defaults to feasibility.message). */
  labelOverride?: string;
  /**
   * Sprint 3 — when set, the popover Pool section consults the archetype's
   * role-mix so the popover surfaces required + optional roles and flags
   * "Not set up" honesty empty states for required roles. When omitted, the
   * Pool section runs in sparse mode (only roles with ≥1 entity tagged).
   */
  archetypeSlug?: string | null;
  /**
   * If provided, renders an X button as a sibling of the trigger that calls
   * `onRemove` on tap. Used by the series-mode chip strip — the chip body
   * opens the popover, the X removes the date from the series. The two
   * actions are rendered as separate `<button>` elements inside a wrapper
   * `<div role="group">` so each gets its own focus and hover treatment.
   */
  onRemove?: () => void;
  removeAriaLabel?: string;
  className?: string;
};

/**
 * Tappable feasibility chip. On tap, opens a portaled popover anchored to the
 * trigger that lists named conflicts (confirmed shows, open deals, crew
 * blackouts) with deep links into deal/event detail pages.
 *
 * Accessibility:
 *   - aria-expanded reflects popover state
 *   - aria-haspopup="dialog"
 *   - aria-label combines status + message for screen readers
 *   - StatusGlyph differentiates by shape (filled/half/empty) so the signal
 *     does not depend on color alone
 *   - Focus returns to the chip when the popover closes
 *
 * Loading: chip renders blank — no spinner, no text — to honor the friction
 * floor (per design doc §6.2: "no spinner, no flash, never block typing").
 */
export function FeasibilityChip({
  date,
  feasibility,
  loading,
  labelOverride,
  archetypeSlug,
  onRemove,
  removeAriaLabel,
  className,
}: FeasibilityChipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  // Return focus to the trigger when the popover closes.
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  if (loading || !feasibility) {
    // Blank slot during in-flight — preserves layout without flashing a state.
    return (
      <div
        className={cn(
          'inline-flex items-center h-[var(--stage-input-height,34px)] px-2.5 min-w-[80px]',
          className,
        )}
        aria-busy="true"
        aria-live="polite"
      />
    );
  }

  const label = labelOverride ?? feasibility.message;
  const ariaLabel = `${statusLabel(feasibility.status)}: ${label}. Tap for details.`;

  // Common styles for the trigger button. When the chip has an `onRemove`
  // affordance, the trigger sits in a wrapping div with the X button next to
  // it; the wrapper carries the border, the trigger is rendered inset.
  const triggerButton = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open ? popoverId : undefined}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 min-h-[32px] tracking-tight text-[length:var(--stage-input-font-size,13px)] transition-colors duration-75',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        onRemove
          ? 'pl-2.5 pr-1.5 py-1 rounded-l-[calc(var(--stage-radius-input,6px)-1px)] hover:bg-[oklch(1_0_0_/_0.05)]'
          : 'h-[var(--stage-input-height,34px)] px-2.5 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] hover:border-[oklch(1_0_0_/_0.20)] hover:bg-[oklch(1_0_0_/_0.04)]',
      )}
    >
      <StatusGlyph status={feasibility.status} />
      <span className="text-[var(--stage-text-primary)] truncate">{label}</span>
    </button>
  );

  return (
    <>
      {onRemove ? (
        <div
          role="group"
          aria-label={label}
          className={cn(
            'inline-flex items-stretch shrink-0 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] hover:border-[oklch(1_0_0_/_0.20)]',
            className,
          )}
        >
          {triggerButton}
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeAriaLabel ?? 'Remove'}
            className="inline-flex items-center justify-center px-1.5 rounded-r-[calc(var(--stage-radius-input,6px)-1px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors duration-75"
          >
            <X size={12} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : (
        <span className={cn('inline-flex', className)}>{triggerButton}</span>
      )}
      <AnimatePresence>
        {open && (
          <FeasibilityPopover
            date={date}
            feasibility={feasibility}
            archetypeSlug={archetypeSlug}
            triggerRef={triggerRef}
            onClose={close}
            popoverId={popoverId}
          />
        )}
      </AnimatePresence>
    </>
  );
}
