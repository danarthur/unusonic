'use client';

/**
 * Proposal-status pills for DealLens.
 *
 * Extracted from deal-lens.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - ProposalStatusPill — colored dot + label for a proposal's status
 *     (draft / sent / viewed / accepted).
 *   - EmailDeliveryIndicator — secondary delivery signal (delivered / bounced)
 *     rendered next to the status pill in the proposal history list.
 */

import type { ProposalHistoryEntry } from '@/features/sales/api/proposal-actions';

const PROPOSAL_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--stage-text-tertiary)' },
  sent: { label: 'Sent', color: 'var(--color-unusonic-warning)' },
  viewed: { label: 'Viewed', color: 'var(--color-unusonic-warning)' },
  accepted: { label: 'Signed', color: 'var(--color-unusonic-success)' },
};

export function EmailDeliveryIndicator({ entry }: { entry: ProposalHistoryEntry }) {
  // Only show for sent/viewed/accepted proposals (drafts haven't been emailed)
  if (entry.status === 'draft') return null;

  if (entry.email_bounced_at) {
    return (
      <span
        className="inline-flex items-center gap-1 text-label font-medium"
        style={{ color: 'var(--color-unusonic-error)' }}
        title={`Bounced ${new Date(entry.email_bounced_at).toLocaleString()}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-unusonic-error)' }} />
        Bounced
      </span>
    );
  }

  if (entry.email_delivered_at) {
    return (
      <span
        className="inline-flex items-center gap-1 text-label"
        style={{ color: 'var(--stage-text-tertiary)' }}
        title={`Delivered ${new Date(entry.email_delivered_at).toLocaleString()}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-unusonic-success)' }} />
      </span>
    );
  }

  // Sent but no delivery confirmation yet
  return null;
}

export function ProposalStatusPill({ status }: { status: string }) {
  const style = PROPOSAL_STATUS_STYLES[status] ?? { label: status, color: 'var(--stage-text-tertiary)' };
  return (
    <span
      className="inline-flex items-center gap-1 text-label font-medium tracking-wide"
      style={{ color: style.color }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: style.color }}
      />
      {style.label}
    </span>
  );
}
