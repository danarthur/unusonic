'use client';

/**
 * Next Actions card — stage-aware computed checklist.
 * Items auto-derive from deal state. Nothing is manually toggled.
 * Answers the PM's #1 question: "What do I need to do next?"
 */

import { motion } from 'framer-motion';
import { Circle, CheckCircle2 } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

// =============================================================================
// Types
// =============================================================================

type ActionItem = {
  id: string;
  label: string;
  done: boolean;
  /** Optional detail shown when done (e.g., "Amanda Smith") */
  detail?: string | null;
};

// =============================================================================
// Compute actions per stage
// =============================================================================

function computeActions(
  deal: DealDetail,
  proposal: ProposalWithItems | null | undefined,
  stakeholders: DealStakeholderDisplay[],
  crewCount: number,
): ActionItem[] {
  const status = deal.status;
  const items: ActionItem[] = [];

  // ── Always relevant (all pre-handover stages) ──

  const hasBillTo = stakeholders.some((s) => s.role === 'bill_to');
  const hasLegacyClient = !!deal.organization_id;
  const clientLinked = hasBillTo || hasLegacyClient;
  const clientName = stakeholders.find((s) => s.role === 'bill_to')?.name ?? null;

  items.push({
    id: 'client',
    label: 'Link a client',
    done: clientLinked,
    detail: clientName,
  });

  items.push({
    id: 'date',
    label: 'Set event date',
    done: !!deal.proposed_date,
    detail: deal.proposed_date
      ? new Date(deal.proposed_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null,
  });

  // ── Inquiry stage ──

  if (status === 'inquiry') {
    items.push({
      id: 'budget',
      label: 'Set budget estimate',
      done: deal.budget_estimated != null,
      detail: deal.budget_estimated != null
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(deal.budget_estimated)
        : null,
    });

    const hasItems = (proposal?.items?.length ?? 0) > 0;
    items.push({
      id: 'proposal',
      label: 'Build a proposal',
      done: hasItems,
      detail: hasItems ? `${proposal!.items.length} line items` : null,
    });
  }

  // ── Proposal stage ──

  if (status === 'proposal') {
    const hasItems = (proposal?.items?.length ?? 0) > 0;
    items.push({
      id: 'items',
      label: 'Add line items',
      done: hasItems,
      detail: hasItems ? `${proposal!.items.length} items` : null,
    });

    const isSent = proposal?.status === 'sent' || proposal?.status === 'viewed' || proposal?.status === 'accepted';
    items.push({
      id: 'send',
      label: 'Send to client',
      done: isSent,
    });
  }

  // ── Contract sent ──

  if (status === 'contract_sent') {
    const viewCount = proposal?.view_count ?? 0;
    items.push({
      id: 'opened',
      label: 'Client opened proposal',
      done: viewCount > 0,
      detail: viewCount > 0 ? `${viewCount} view${viewCount > 1 ? 's' : ''}` : null,
    });

    const depositSet = (proposal?.deposit_percent ?? 0) > 0;
    items.push({
      id: 'deposit_terms',
      label: 'Deposit terms set',
      done: depositSet,
      detail: depositSet ? `${proposal!.deposit_percent}%` : null,
    });

    items.push({
      id: 'signed',
      label: 'Client signed',
      done: false,
    });
  }

  // ── Contract signed / deposit received ──

  if (status === 'contract_signed' || status === 'deposit_received') {
    const depositRequired = (proposal?.deposit_percent ?? 0) > 0;
    const depositPaid = !!proposal?.deposit_paid_at;

    if (depositRequired) {
      items.push({
        id: 'deposit',
        label: 'Deposit received',
        done: depositPaid,
      });
    }

    items.push({
      id: 'crew',
      label: 'Assign crew',
      done: crewCount > 0,
      detail: crewCount > 0 ? `${crewCount} assigned` : null,
    });

    const hasVenue = stakeholders.some((s) => s.role === 'venue_contact') || !!deal.venue_id;
    items.push({
      id: 'venue',
      label: 'Confirm venue',
      done: hasVenue,
    });

    items.push({
      id: 'handover',
      label: 'Hand over to production',
      done: !!deal.event_id,
    });
  }

  // ── Won (post-handover) ──

  if (status === 'won') {
    items.push({
      id: 'handed_over',
      label: 'Handed over to production',
      done: true,
    });
  }

  return items;
}

// =============================================================================
// Component
// =============================================================================

export type NextActionsCardProps = {
  deal: DealDetail;
  proposal: ProposalWithItems | null | undefined;
  stakeholders: DealStakeholderDisplay[];
  crewCount: number;
};

export function NextActionsCard({
  deal,
  proposal,
  stakeholders,
  crewCount,
}: NextActionsCardProps) {
  const actions = computeActions(deal, proposal, stakeholders, crewCount);
  const doneCount = actions.filter((a) => a.done).length;
  const totalCount = actions.length;
  const allDone = doneCount === totalCount;
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <StagePanel elevated className="h-full p-5 flex flex-col">
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-4">
        <p className="stage-label text-[var(--stage-text-secondary)]">
          Next actions
        </p>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {doneCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[oklch(1_0_0_/_0.04)] mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={STAGE_MEDIUM}
          style={{
            background: allDone
              ? 'var(--color-unusonic-success)'
              : 'var(--stage-text-secondary)',
          }}
        />
      </div>

      {/* Action items */}
      <div className="flex flex-col gap-1.5 flex-1">
        {actions.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={STAGE_LIGHT}
            className="flex items-start gap-2.5 py-1"
          >
            {item.done ? (
              <CheckCircle2
                className="size-4 shrink-0 mt-0.5"
                style={{ color: 'var(--color-unusonic-success)' }}
              />
            ) : (
              <Circle className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm tracking-tight leading-tight',
                item.done ? 'text-[var(--stage-text-tertiary)] line-through' : 'text-[var(--stage-text-primary)]',
              )}>
                {item.label}
              </p>
              {item.done && item.detail && (
                <p className="text-[10px] text-[var(--stage-text-tertiary)] mt-0.5 truncate">
                  {item.detail}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </StagePanel>
  );
}
