'use client';

import { ArrowRight, Calendar, MapPin, Building2 } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { DealDetail } from '../actions/get-deal';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';
import type { WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';

type HandoffConfirmStripProps = {
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  onOpenWizard: () => void;
  /** The deal's current stage. Drives handoff eligibility: either the stage
   *  signals handoff-readiness (tags contract_signed / deposit_received /
   *  ready_for_handoff) or the deal is already kind='won'. */
  stage: WorkspacePipelineStage | null;
};

export function HandoffConfirmStrip({
  deal,
  stakeholders,
  onOpenWizard,
  stage,
}: HandoffConfirmStripProps) {
  const venue = stakeholders.find((s) => s.role === 'venue_contact');
  const client = stakeholders.find((s) => s.role === 'bill_to');
  const dateFormatted = deal.proposed_date
    ? new Date(deal.proposed_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No date set';

  const tags = stage?.tags ?? [];
  const handoffReadyTag =
    tags.includes('contract_signed')
    || tags.includes('deposit_received')
    || tags.includes('ready_for_handoff');
  const canHandoff = handoffReadyTag || stage?.kind === 'won' || deal.status === 'won';
  if (!canHandoff) return null;

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <h3 className="stage-label mb-4">
        Ready to hand over
      </h3>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md stage-badge-text bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]">
          <Calendar size={10} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" />
          {dateFormatted}
        </span>
        {venue && (
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md stage-badge-text bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]">
            <MapPin size={10} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" />
            {venue.name}
          </span>
        )}
        {client && (
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md stage-badge-text bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]">
            <Building2 size={10} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" />
            {client.name}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenWizard}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        Hand over to production
        <ArrowRight size={14} strokeWidth={1.5} />
      </button>
    </StagePanel>
  );
}
