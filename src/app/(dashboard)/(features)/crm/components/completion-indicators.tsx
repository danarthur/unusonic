'use client';

import { Check, AlertCircle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { DealDetail } from '../actions/get-deal';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';
import type { DealCrewRow } from '../actions/deal-crew';

type CompletionIndicatorsProps = {
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  crewRows: DealCrewRow[];
  hasProposal: boolean;
};

type Indicator = {
  label: string;
  done: boolean;
  detail?: string;
};

export function CompletionIndicators({
  deal,
  stakeholders,
  crewRows,
  hasProposal,
}: CompletionIndicatorsProps) {
  const indicators: Indicator[] = [
    {
      label: 'Client',
      done: stakeholders.some((s) => s.role === 'bill_to') || !!deal.organization_id,
    },
    {
      label: 'Date',
      done: !!deal.proposed_date,
      detail: deal.proposed_date
        ? new Date(deal.proposed_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : undefined,
    },
    {
      label: 'Venue',
      done: stakeholders.some((s) => s.role === 'venue_contact') || !!deal.venue_id,
    },
    {
      label: 'Proposal',
      done: hasProposal,
    },
    {
      label: 'Contract',
      done: ['contract_signed', 'deposit_received', 'won'].includes(deal.status),
      detail: deal.status === 'contract_signed' ? 'Signed' : deal.status === 'deposit_received' ? 'Deposit received' : undefined,
    },
    {
      label: 'Crew',
      done: crewRows.filter((r) => r.entity_id).length > 0,
      detail: crewRows.length > 0
        ? `${crewRows.filter((r) => r.entity_id).length}/${crewRows.length}`
        : undefined,
    },
  ];

  const doneCount = indicators.filter((i) => i.done).length;
  const progress = indicators.length > 0 ? (doneCount / indicators.length) * 100 : 0;

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          Production readiness
        </h3>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {doneCount}/{indicators.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[oklch(1_0_0_/_0.04)] mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--stage-text-primary)] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {indicators.map((ind) => (
          <span
            key={ind.label}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] tracking-tight border ${
              ind.done
                ? 'bg-[oklch(1_0_0_/_0.04)] border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]'
                : 'bg-transparent border-dashed border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-tertiary)]'
            }`}
          >
            {ind.done ? (
              <Check size={10} strokeWidth={1.5} className="text-[var(--color-unusonic-success)]" />
            ) : (
              <AlertCircle size={10} strokeWidth={1.5} className="opacity-40" />
            )}
            {ind.label}
            {ind.detail && <span className="text-[var(--stage-text-tertiary)] ml-0.5">{ind.detail}</span>}
          </span>
        ))}
      </div>
    </StagePanel>
  );
}
