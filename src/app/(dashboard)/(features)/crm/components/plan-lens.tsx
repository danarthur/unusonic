'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DispatchSummary } from './dispatch-summary';
import { DealHeaderStrip } from './deal-header-strip';
import { DealDiaryCard } from './deal-diary-card';
import { CompletionIndicators } from './completion-indicators';
import { HandoffConfirmStrip } from './handoff-confirm-strip';
import { OpsActionsCard } from './ops-actions-card';
import { ProductionTimelineWidget } from '@/widgets/production-timeline';
import { computePaymentMilestones } from '@/features/sales/lib/compute-payment-milestones';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { getDealCrew, getDealCrewForEvent, type DealCrewRow } from '../actions/deal-crew';
import { getEventLoadDates } from '../actions/get-event-summary';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

type PlanLensProps = {
  eventId: string | null;
  dealId: string | null;
  event: EventSummaryForPrism | null;
  deal: DealDetail | null;
  client: DealClientContext | null;
  stakeholders: DealStakeholderDisplay[];
  sourceOrgId?: string | null;
  onEventUpdated?: () => void;
  onHandoverSuccess?: (eventId: string) => void;
  onStakeholdersChange?: () => void;
};

export function PlanLens({
  eventId,
  dealId,
  event,
  deal,
  client,
  stakeholders,
  sourceOrgId,
  onEventUpdated,
  onHandoverSuccess,
  onStakeholdersChange,
}: PlanLensProps) {
  const isPostHandoff = !!eventId && !!event;

  // Crew — shared between pre and post handoff
  const [crewRows, setCrewRows] = useState<DealCrewRow[]>([]);
  const [crewLoading, setCrewLoading] = useState(true);
  const fetchCrew = useCallback(async () => {
    if (dealId) {
      const rows = await getDealCrew(dealId);
      setCrewRows(rows);
    } else if (eventId) {
      const rows = await getDealCrewForEvent(eventId);
      setCrewRows(rows);
    }
    setCrewLoading(false);
  }, [dealId, eventId]);
  useEffect(() => { fetchCrew(); }, [fetchCrew]);

  const handleCrewUpdated = () => {
    fetchCrew();
    onEventUpdated?.();
  };

  // Self-fetch proposal data for timeline + budget
  type ProposalSnapshot = {
    total: number | null;
    signedAt: string | null;
    acceptedAt: string | null;
    depositPercent: number | null;
    depositPaidAt: string | null;
    depositDeadlineDays: number | null;
    paymentDueDays: number | null;
    hasItems: boolean;
    status: string | null;
    updatedAt: string | null;
    firstViewedAt: string | null;
  };
  const [proposalData, setProposalData] = useState<ProposalSnapshot | null>(null);
  const [eventDates, setEventDates] = useState<{ loadIn: string | null; loadOut: string | null }>({ loadIn: null, loadOut: null });

  useEffect(() => {
    if (!dealId) return;
    getProposalForDeal(dealId).then((p) => {
      if (!p) { setProposalData(null); return; }
      const total = (p.items ?? []).reduce((sum, item) => {
        if ((item as { is_optional?: boolean }).is_optional) return sum;
        const price = (item as { override_price?: number | null }).override_price ?? Number(item.unit_price ?? 0);
        return sum + (item.quantity ?? 1) * price;
      }, 0);
      setProposalData({
        total,
        signedAt: p.signed_at ?? null,
        acceptedAt: p.accepted_at ?? null,
        depositPercent: p.deposit_percent ?? null,
        depositPaidAt: p.deposit_paid_at ?? null,
        depositDeadlineDays: (p as unknown as Record<string, unknown>).deposit_deadline_days as number | null ?? null,
        paymentDueDays: p.payment_due_days ?? null,
        hasItems: (p.items ?? []).length > 0,
        status: p.status ?? null,
        updatedAt: p.updated_at ?? null,
        firstViewedAt: (p as unknown as Record<string, unknown>).first_viewed_at as string | null ?? null,
      });
    });
  }, [dealId]);

  // Fetch load-in/load-out dates for timeline
  useEffect(() => {
    const eid = eventId ?? deal?.event_id;
    if (!eid) return;
    getEventLoadDates(eid).then(setEventDates);
  }, [eventId, deal?.event_id]);

  // Payment milestones for timeline
  const paymentMilestones = proposalData
    ? computePaymentMilestones({
        signedAt: proposalData.signedAt,
        acceptedAt: proposalData.acceptedAt,
        depositPercent: proposalData.depositPercent,
        depositPaidAt: proposalData.depositPaidAt,
        depositDeadlineDays: proposalData.depositDeadlineDays,
        paymentDueDays: proposalData.paymentDueDays,
        proposedDate: deal?.proposed_date ?? null,
        proposalTotal: proposalData.total,
      })
    : [];

  // Deal milestones for timeline (matching Deal tab's structure exactly)
  const dealMilestones = deal
    ? {
        createdAt: deal.created_at,
        proposalSentAt: proposalData?.updatedAt ?? null,
        proposalViewedAt: proposalData?.firstViewedAt ?? null,
        proposalSignedAt: proposalData?.acceptedAt ?? null,
        depositPaidAt: proposalData?.depositPaidAt ?? null,
        handedOverAt: deal.won_at ?? null,
        crewConfirmedAt: (() => {
          const assigned = crewRows.filter((r) => r.entity_id);
          if (assigned.length === 0) return null;
          if (!assigned.every((r) => r.confirmed_at)) return null;
          return assigned.reduce(
            (latest, r) => (r.confirmed_at && r.confirmed_at > (latest ?? '') ? r.confirmed_at : latest),
            null as string | null
          );
        })(),
        loadInAt: eventDates.loadIn,
        loadOutAt: eventDates.loadOut,
      }
    : undefined;

  const hasVenue = stakeholders.some((s) => s.role === 'venue_contact') || !!deal?.venue_id;

  // ── Render ──

  // Shared header strip — same component as Deal tab, read-only in Plan
  const headerStrip = deal ? (
    <DealHeaderStrip
      title={deal.title}
      proposedDate={deal.proposed_date}
      eventArchetype={deal.event_archetype ?? null}
      budgetEstimated={deal.budget_estimated}
      readOnly
      deal={deal}
      stakeholders={stakeholders}
      client={client}
      sourceOrgId={sourceOrgId ?? null}
      onStakeholdersChange={onStakeholdersChange ?? (() => {})}
    />
  ) : null;

  let content: React.ReactNode;

  if (isPostHandoff) {
    content = (
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
        {headerStrip}

        <div className="flex flex-col lg:flex-row gap-6 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <DispatchSummary
              eventId={eventId}
              dealId={dealId}
              event={event}
              crewRows={crewRows}
              crewLoading={crewLoading}
              onFlightCheckUpdated={handleCrewUpdated}
            />
            {dealId && deal?.workspace_id && (
              <DealDiaryCard dealId={dealId} workspaceId={deal.workspace_id} phaseTag="plan" />
            )}
          </div>

          <div className="lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col lg:sticky lg:top-0 lg:self-start" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <OpsActionsCard crewRows={crewRows} runOfShowData={event.run_of_show_data} eventStartsAt={event.starts_at} hasVenue={hasVenue} />
            {proposalData && proposalData.status !== 'draft' && (
              <ProductionTimelineWidget eventDate={deal?.proposed_date ?? event.starts_at?.slice(0, 10) ?? null} eventTitle={deal?.title ?? event.title} paymentMilestones={paymentMilestones} dealMilestones={dealMilestones} />
            )}
            <Link href={`/events/g/${eventId}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center min-h-[100px] rounded-[var(--stage-radius-panel)] border-2 border-dashed border-[oklch(1_0_0_/_0.08)] stage-panel-elevated p-6 text-center transition-colors hover:border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]">
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none">Launch show studio</p>
              <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-2">Run of show, crewing, and full studio</p>
            </Link>
          </div>
        </div>
      </div>
    );
  } else if (!deal) {
    content = (
      <div className="stage-panel-elevated p-6 text-[var(--stage-text-secondary)] text-sm leading-relaxed">
        No event linked yet.
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
        {headerStrip}

        <div className="flex flex-col lg:flex-row gap-6 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <CompletionIndicators deal={deal} stakeholders={stakeholders} crewRows={crewRows} hasProposal={!!proposalData?.hasItems} />
            {onHandoverSuccess && <HandoffConfirmStrip deal={deal} stakeholders={stakeholders} onSuccess={onHandoverSuccess} />}
            {deal.workspace_id && <DealDiaryCard dealId={deal.id} workspaceId={deal.workspace_id} phaseTag="plan" />}
          </div>

          <div className="lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col lg:sticky lg:top-0 lg:self-start" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            {proposalData && proposalData.status !== 'draft' && (
              <ProductionTimelineWidget eventDate={deal.proposed_date} eventTitle={deal.title} paymentMilestones={paymentMilestones} dealMilestones={dealMilestones} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return content;
}
