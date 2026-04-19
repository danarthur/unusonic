'use client';

/**
 * AionDealCard — the unified Aion voice surface on the deal detail page.
 * Replaces the four legacy surfaces (follow-up card, AionSuggestionRow,
 * computeStallSignal badge, NextActionsCard).
 *
 * Phase 3 shipping behind feature flag `crm.unified_aion_card`. See design
 * doc §7, §9, §10, §20.
 *
 * This component is presentational — receives a pre-composed AionCardData
 * from the consolidated reader. All server action wiring (accept-advance
 * with undo, dismiss, draft, etc.) lands in Phase 4.
 *
 * Variants (§7.1):
 *   - both            → voice paragraph + Outbound + Pipeline sections
 *   - outbound_only   → voice paragraph + Outbound section only
 *   - pipeline_only   → single-line affordance (no voice paragraph)
 *   - collapsed       → nothing renders (caller hides)
 *
 * Archive context variant: pipelineRows suppressed, no voice header beyond
 * "Outstanding" label.
 *
 * Brand voice — binding rules (design §20.8):
 *   - Sentence case, no exclamation marks
 *   - Deal fact first, pattern as measuring stick
 *   - Possessive framing
 *   - "Move" not "Advance" in CTAs
 *   - "Draft a check-in" / "Draft a nudge" — never "Compose follow-up"
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MessageSquare, X } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type {
  AionCardData,
  OutboundRow,
  PipelineRow,
} from '../actions/get-aion-card-for-deal';
import { ConfidenceDot, SectionHeader, WhyThisTooltip } from './aion-card-primitives';

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export type AionDealCardContext = 'deal_lens' | 'archive';

export type AionDealCardProps = {
  data: AionCardData;
  context?: AionDealCardContext;
  /** Optional callbacks — Phase 4 wires the real handlers. */
  onAcceptAdvance?: (row: PipelineRow) => void;
  onDismissAdvance?: (row: PipelineRow) => void;
  onDraftNudge?: (row: OutboundRow) => void;
  onDismissNudge?: (row: OutboundRow) => void;
  onSnoozeNudge?: (row: OutboundRow, days: number) => void;
};

export function AionDealCard({
  data,
  context = 'deal_lens',
  onAcceptAdvance,
  onDismissAdvance,
  onDraftNudge,
  onDismissNudge,
  onSnoozeNudge,
}: AionDealCardProps) {
  // Suppress: all events in the past → card must not render on live deal page
  if (data.suppress && context !== 'archive') return null;

  // Archive context hides Pipeline rows entirely (won/lost deals don't advance)
  const pipelineRows = context === 'archive' ? [] : data.pipelineRows;
  const outboundRows = data.outboundRows;

  const hasOutbound = outboundRows.length > 0;
  const hasPipeline = pipelineRows.length > 0;

  // Archive + no outbound = nothing to show (P1-2 fix — no "All clear" filler)
  if (context === 'archive' && !hasOutbound) return null;

  // Collapsed variant: card hides entirely (design §7.1)
  if (data.variant === 'collapsed' || (!hasOutbound && !hasPipeline)) return null;

  // Pipeline-only collapsed-line variant (design §7.1 middle block)
  if (data.variant === 'pipeline_only' && hasPipeline && !hasOutbound) {
    return (
      <PipelineCollapsedLine
        row={pipelineRows[0]}
        onAccept={() => onAcceptAdvance?.(pipelineRows[0])}
        onDismiss={() => onDismissAdvance?.(pipelineRows[0])}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
    >
      <StagePanel elevated padding="md" className="space-y-3">
        {context !== 'archive' && <CardHeader voice={data.voice} />}
        {context === 'archive' && (
          <SectionHeader>Outstanding</SectionHeader>
        )}

        {hasOutbound && (
          <section aria-labelledby="aion-outbound-label" className="space-y-2">
            {context !== 'archive' && (
              <div id="aion-outbound-label">
                <SectionHeader>Outbound</SectionHeader>
              </div>
            )}
            <ul className="space-y-1.5">
              {outboundRows.map((row) => (
                <li key={row.followUpId}>
                  <OutboundRowView
                    row={row}
                    cadenceTooltip={data.cadenceTooltip}
                    primary={context !== 'archive'}
                    onDraft={() => onDraftNudge?.(row)}
                    onDismiss={() => onDismissNudge?.(row)}
                    onSnooze={(days) => onSnoozeNudge?.(row, days)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasPipeline && (
          <section aria-labelledby="aion-pipeline-label" className="space-y-2">
            <div id="aion-pipeline-label">
              <SectionHeader>Pipeline</SectionHeader>
            </div>
            <ul className="space-y-1.5">
              {pipelineRows.map((row) => (
                <li key={row.insightId}>
                  <PipelineRowView
                    row={row}
                    primary={!hasOutbound}
                    onAccept={() => onAcceptAdvance?.(row)}
                    onDismiss={() => onDismissAdvance?.(row)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </StagePanel>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Header + voice paragraph
// ---------------------------------------------------------------------------

function CardHeader({ voice }: { voice: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <AionMark size={12} status="idle" />
        <p
          className="stage-label tracking-wide uppercase"
          style={{ fontSize: '10px', color: 'var(--stage-text-tertiary,var(--stage-text-secondary))' }}
        >
          Aion
        </p>
      </div>
      {voice && (
        <p
          className="leading-snug"
          style={{
            fontSize: 'var(--stage-text-body, 13px)',
            color: 'var(--stage-text-secondary)',
          }}
        >
          {voice}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outbound row
// ---------------------------------------------------------------------------

function OutboundRowView({
  row,
  cadenceTooltip,
  onDraft,
  onDismiss,
  onSnooze,
}: {
  row: OutboundRow;
  cadenceTooltip: string | null;
  /**
   * @deprecated Kept on the parent-mapped prop for API stability but no longer
   * consumed — the unified card uses `variant="secondary"` for both rows and
   * leans on the achromatic-accent philosophy (text + icon carry the weight).
   */
  primary?: boolean;
  onDraft: () => void;
  onDismiss: () => void;
  onSnooze: (days: number) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const channel = row.suggestedChannel;
  const ctaLabel = channel === 'sms' ? 'Draft a text'
    : channel === 'phone' ? 'Log a call'
    : 'Draft a check-in';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ConfidenceDot confidence={row.confidence} />
        <span
          className="truncate"
          style={{ fontSize: 'var(--stage-text-body, 13px)' }}
        >
          {row.reasonLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={onDraft}
        >
          <MessageSquare className="size-3.5" />
          {ctaLabel}
        </Button>

        <WhyThisTooltip
          breakdown={row.priorityBreakdown}
          cadenceTooltip={cadenceTooltip}
        />

        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-[var(--stage-text-secondary)]"
          >
            <X className="size-3.5 rotate-45" aria-hidden />
          </Button>
          {menuOpen && (
            <OutboundActionMenu
              onDismiss={() => {
                setMenuOpen(false);
                onDismiss();
              }}
              onSnooze={(days) => {
                setMenuOpen(false);
                onSnooze(days);
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OutboundActionMenu({
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

// ---------------------------------------------------------------------------
// Pipeline row
// ---------------------------------------------------------------------------

function PipelineRowView({
  row,
  onAccept,
  onDismiss,
}: {
  row: PipelineRow;
  /**
   * @deprecated See OutboundRowView. Kept for call-site compatibility.
   */
  primary?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const ctaLabel = row.suggestedStageTag
    ? `Move to ${humanizeStageTag(row.suggestedStageTag)}`
    : 'Advance stage';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ConfidenceDot confidence={row.confidence} />
        <span
          className="truncate"
          style={{ fontSize: 'var(--stage-text-body, 13px)' }}
        >
          {row.title}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={onAccept}
        >
          {ctaLabel}
          <ArrowRight className="size-3.5" />
        </Button>

        <WhyThisTooltip breakdown={row.priorityBreakdown} />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
          className="text-[var(--stage-text-secondary)]"
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsed-line variant (Pipeline only, no stall)
// ---------------------------------------------------------------------------

function PipelineCollapsedLine({
  row,
  onAccept,
  onDismiss,
}: {
  row: PipelineRow;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const ctaLabel = row.suggestedStageTag
    ? `Move to ${humanizeStageTag(row.suggestedStageTag)}`
    : 'Advance stage';

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
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="text-[var(--stage-text-secondary)]">★</span>
        <span
          className="truncate"
          style={{
            fontSize: 'var(--stage-text-body, 13px)',
            color: 'var(--stage-text-secondary)',
          }}
        >
          {row.title}
        </span>
      </div>

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
// Helpers
// ---------------------------------------------------------------------------

/** Map stage tag slug to CTA verb phrase. Matches the existing TAG_COPY
 *  from AionSuggestionRow but uses "Move" not "Advance" per User Advocate. */
function humanizeStageTag(tag: string): string {
  const map: Record<string, string> = {
    proposal_sent: 'Proposal',
    contract_out: 'Contract',
    contract_signed: 'Contract Signed',
    deposit_received: 'Deposit Received',
    ready_for_handoff: 'Handoff',
    won: 'Won',
  };
  return map[tag] ?? tag.replace(/_/g, ' ');
}
