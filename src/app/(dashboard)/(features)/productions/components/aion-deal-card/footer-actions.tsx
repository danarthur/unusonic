'use client';

/**
 * Footer action cluster for the AionDealCard.
 *
 * Extracted from aion-deal-card.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - FooterActions — composes the primary + secondary CTAs in the card
 *     footer. When both an outbound nudge and a pipeline advance exist for
 *     the same deal, renders them as co-equal peers (NBA pattern).
 *   - OutboundButton / PipelineButton — channel-aware label helpers shared
 *     between the primary and secondary footer slots.
 *   - PrimaryCta — bright accent button for the chosen recommendation.
 *   - PipelineCollapsedLine — single-line variant rendered when the deal
 *     has only a pipeline suggestion (no outbound).
 *   - ArchiveOutboundRow + ActionMenu — compact outstanding-only listing
 *     used by the archive context.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MessageSquare } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { OutboundRow, PipelineRow } from '../../actions/get-aion-card-for-deal';
import type { PrimaryRecommendation } from './types';
import { humanizeStageTag } from './signals';

// ---------------------------------------------------------------------------
// FooterActions — primary + (optional) secondary CTA pair
// ---------------------------------------------------------------------------

export function FooterActions({
  primary,
  outboundRow,
  pipelineRow,
  onAcceptAdvance,
  onDraftNudge,
}: {
  primary: PrimaryRecommendation;
  outboundRow: OutboundRow | null;
  pipelineRow: PipelineRow | null;
  onAcceptAdvance: (row: PipelineRow) => void;
  onDraftNudge: (row: OutboundRow) => void;
}) {
  // When both kinds of recommendation exist for this deal, render them as
  // co-equal peers by intent (NBA research: two actions labeled by intent,
  // not primary/alternative). Secondary gets variant="secondary" (matte);
  // the primary action — picked by outbound-first bias — keeps
  // variant="default" (bright accent).
  const hasBoth = outboundRow != null && pipelineRow != null;

  if (hasBoth) {
    // Primary is outbound-first per composer bias. Secondary is the other.
    const secondaryIsPipeline = primary.kind === 'outbound';

    return (
      <>
        {secondaryIsPipeline && pipelineRow ? (
          <PipelineButton
            row={pipelineRow}
            variant="secondary"
            onClick={() => onAcceptAdvance(pipelineRow)}
          />
        ) : outboundRow ? (
          <OutboundButton
            row={outboundRow}
            variant="secondary"
            onClick={() => onDraftNudge(outboundRow)}
          />
        ) : null}
        <PrimaryCta
          primary={primary}
          onAcceptAdvance={onAcceptAdvance}
          onDraftNudge={onDraftNudge}
        />
      </>
    );
  }

  return (
    <PrimaryCta
      primary={primary}
      onAcceptAdvance={onAcceptAdvance}
      onDraftNudge={onDraftNudge}
    />
  );
}

// ---------------------------------------------------------------------------
// Button helpers — used by both PrimaryCta and the secondary footer slot
// ---------------------------------------------------------------------------

function OutboundButton({
  row,
  variant,
  onClick,
}: {
  row: OutboundRow;
  variant: 'default' | 'secondary';
  onClick: () => void;
}) {
  const channel = row.suggestedChannel;
  const ctaLabel =
    channel === 'sms' ? 'Draft a text'
      : channel === 'phone' ? 'Log a call'
        : 'Draft nudge';
  return (
    <Button variant={variant} size="sm" onClick={onClick}>
      <MessageSquare className="size-3.5" />
      {ctaLabel}
    </Button>
  );
}

function PipelineButton({
  row,
  variant,
  onClick,
}: {
  row: PipelineRow;
  variant: 'default' | 'secondary';
  onClick: () => void;
}) {
  const stageLabel = humanizeStageTag(row.suggestedStageTag ?? '') || 'next stage';
  return (
    <Button variant={variant} size="sm" onClick={onClick}>
      Move to {stageLabel}
      <ArrowRight className="size-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Primary CTA — the bright accent action (always variant="default")
// ---------------------------------------------------------------------------

function PrimaryCta({
  primary,
  onAcceptAdvance,
  onDraftNudge,
}: {
  primary: PrimaryRecommendation;
  onAcceptAdvance: (row: PipelineRow) => void;
  onDraftNudge: (row: OutboundRow) => void;
}) {
  if (primary.kind === 'outbound') {
    return (
      <OutboundButton
        row={primary.row}
        variant="default"
        onClick={() => onDraftNudge(primary.row)}
      />
    );
  }
  return (
    <PipelineButton
      row={primary.row}
      variant="default"
      onClick={() => onAcceptAdvance(primary.row)}
    />
  );
}

// ---------------------------------------------------------------------------
// Collapsed-line variant (Pipeline only, no stall)
// ---------------------------------------------------------------------------

export function PipelineCollapsedLine({
  row,
  onAccept,
  onDismiss,
}: {
  row: PipelineRow;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const stageLabel = humanizeStageTag(row.suggestedStageTag ?? '') || 'next stage';
  const ctaLabel = `Move to ${stageLabel}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <span
        className="truncate"
        style={{
          fontSize: 'var(--stage-text-body, 13px)',
          color: 'var(--stage-text-secondary)',
        }}
      >
        {row.title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onAccept}>
          {ctaLabel}
        </Button>
        <button
          type="button"
          aria-label="Not yet"
          onClick={onDismiss}
          className="text-xs text-[var(--stage-text-secondary)] hover:underline underline-offset-2 px-2"
        >
          Not yet
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Archive context row — compact outbound-only listing
// ---------------------------------------------------------------------------

export function ArchiveOutboundRow({
  row,
  onDraft,
  onDismiss,
  onSnooze,
}: {
  row: OutboundRow;
  onDraft: () => void;
  onDismiss: () => void;
  onSnooze: (days: number) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const channel = row.suggestedChannel;
  const ctaLabel = channel === 'sms' ? 'Draft a text'
    : channel === 'phone' ? 'Log a call'
      : 'Draft nudge';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <span
        className="truncate"
        style={{ fontSize: 'var(--stage-text-body, 13px)' }}
      >
        {row.reasonLabel}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onDraft}>
          <MessageSquare className="size-3.5" />
          {ctaLabel}
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-[var(--stage-text-secondary)]"
          >
            <span aria-hidden className="text-sm leading-none">⋯</span>
          </Button>
          {menuOpen && (
            <ActionMenu
              onDismiss={() => { setMenuOpen(false); onDismiss(); }}
              onSnooze={(days) => { setMenuOpen(false); onSnooze(days); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({
  onDismiss,
  onSnooze,
  onClose,
}: {
  onDismiss: () => void;
  onSnooze: (days: number) => void;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md p-1',
        'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
        'shadow-lg text-xs',
      )}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => onSnooze(3)}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)]"
      >
        Snooze 3 days
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSnooze(7)}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)]"
      >
        Snooze 7 days
      </button>
      <hr className="my-1 border-[var(--stage-edge-subtle)]" />
      <button
        type="button"
        role="menuitem"
        onClick={onDismiss}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)] text-[var(--stage-text-secondary)]"
      >
        Dismiss
      </button>
    </div>
  );
}
