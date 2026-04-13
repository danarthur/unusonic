'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileCheck, FileText, ExternalLink } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { DispatchSummary } from './dispatch-summary';
import { DealHeaderStrip } from './deal-header-strip';
import { DealDiaryCard } from './deal-diary-card';
import { CompletionIndicators } from './completion-indicators';
import { HandoffConfirmStrip } from './handoff-confirm-strip';
import { HandoffWizard } from './handoff-wizard';
import { FinancialSummaryCard } from './financial-summary-card';
import { ProductionTeamCard } from './production-team-card';
import { AdvancingChecklist } from './advancing-checklist';
import { ShowHealthCard } from './show-health-card';
import { ReadinessRibbon } from './readiness-ribbon';
import { ShowDayContactsCard } from './show-day-contacts-card';
import { VenueIntelCard } from './venue-intel-card';
import { DjPrepSummaryCard } from './dj-prep-summary-card';
import { WrapReportCard } from './wrap-report-card';
import { DaySheetActionStrip } from './day-sheet-action-strip';
import { ClientUpdateStrip } from './client-update-strip';
import { ShowControlStrip } from './show-control-strip';
import { PlanVitalsStrip } from './plan-vitals-strip';
import { getEventLedger, type EventLedgerDTO } from '@/features/finance/api/get-event-ledger';
import { ProductionTimelineWidget } from '@/widgets/production-timeline';
import { RunOfShowIndexCard } from '@/widgets/run-of-show/ui/run-of-show-mini';
import { ProposalBuilder } from '@/features/sales/ui/proposal-builder';
import { computePaymentMilestones } from '@/features/sales/lib/compute-payment-milestones';
import { computeReadiness } from '../lib/compute-readiness';
import { getProposalForDeal, getProposalPublicUrl } from '@/features/sales/api/proposal-actions';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { getDealCrew, getDealCrewForEvent, type DealCrewRow } from '../actions/deal-crew';
import { getEventGearItems, type EventGearItem } from '../actions/event-gear-items';
import { getEventLoadDates } from '../actions/get-event-summary';
import { getContractForEvent } from '../actions/get-contract-for-event';
import { updateDealScalars } from '../actions/update-deal-scalars';
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
  /** Called when deal scalars are updated so parent can refetch deal data. */
  onDealUpdated?: () => void;
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
  onDealUpdated,
}: PlanLensProps) {
  const isPostHandoff = !!eventId && !!event;

  const [handoffWizardOpen, setHandoffWizardOpen] = useState(false);

  // Show a Retry affordance when event summary takes > 5s so owners don't
  // sit in front of an indefinite spinner if the fetch has stalled.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (eventId && !event) {
      const t = setTimeout(() => setLoadTimedOut(true), 5000);
      return () => clearTimeout(t);
    }
    setLoadTimedOut(false);
  }, [eventId, event]);

  // ── Scalar editing (same pattern as DealLens, with confirmation for post-handoff) ──
  const [localTitle, setLocalTitle] = useState(deal?.title ?? '');
  const [scalarsSaving, setScalarsSaving] = useState(false);
  const [confirmingPostHandoffSave, setConfirmingPostHandoffSave] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<Parameters<typeof updateDealScalars>[1] | null>(null);

  useEffect(() => {
    setLocalTitle(deal?.title ?? '');
  }, [deal?.id, deal?.title]);

  const doSaveScalar = async (patch: Parameters<typeof updateDealScalars>[1]) => {
    if (!dealId) return;
    setScalarsSaving(true);
    const result = await updateDealScalars(dealId, patch);
    setScalarsSaving(false);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to save');
    } else {
      onDealUpdated?.();
    }
  };

  const handleSaveScalar = async (patch: Parameters<typeof updateDealScalars>[1]) => {
    if (!dealId) return;
    // Post-handoff: confirm before saving
    if (isPostHandoff) {
      setPendingPatch(patch);
      setConfirmingPostHandoffSave(true);
      return;
    }
    await doSaveScalar(patch);
  };

  const handleConfirmPostHandoffSave = async () => {
    if (!pendingPatch) return;
    setConfirmingPostHandoffSave(false);
    await doSaveScalar(pendingPatch);
    setPendingPatch(null);
  };

  const handleCancelPostHandoffSave = () => {
    setConfirmingPostHandoffSave(false);
    setPendingPatch(null);
  };

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      handleSaveScalar({ title: value || null });
    }, 800);
  };

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

  // Live gear items from ops.event_gear_items — feeds the readiness ribbon with
  // the real source of truth instead of the stale event.run_of_show_data.gear_items
  // JSONB snapshot that only ever gets populated at handoff via
  // syncGearFromProposalToEvent. Prior behavior: the ribbon's gear counts froze at
  // handoff and never reflected Gear Flight Check mutations.
  const [gearItemsLive, setGearItemsLive] = useState<EventGearItem[]>([]);
  const fetchGearItems = useCallback(async () => {
    if (!eventId) {
      setGearItemsLive([]);
      return;
    }
    const items = await getEventGearItems(eventId);
    setGearItemsLive(items);
  }, [eventId]);
  useEffect(() => { fetchGearItems(); }, [fetchGearItems]);

  const handleCrewUpdated = () => {
    fetchCrew();
    fetchGearItems();
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

  // Full proposal for read-only receipt + contract reference
  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null | undefined>(undefined);
  const [publicProposalUrl, setPublicProposalUrl] = useState<string | null>(null);
  const [contract, setContract] = useState<Awaited<ReturnType<typeof getContractForEvent>>>(null);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    getProposalForDeal(dealId).then((p) => {
      if (cancelled) return;
      setInitialProposal(p);
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
    // Public proposal URL for "View signed proposal" link
    getProposalPublicUrl(dealId).then((url) => { if (!cancelled) setPublicProposalUrl(url); });
    return () => { cancelled = true; };
  }, [dealId]);

  // Contract for event
  useEffect(() => {
    const eid = eventId ?? deal?.event_id;
    if (!eid) { setContract(null); return; }
    let cancelled = false;
    getContractForEvent(eid).then((c) => { if (!cancelled) setContract(c); });
    return () => { cancelled = true; };
  }, [eventId, deal?.event_id]);

  // Fetch load-in/load-out dates for timeline
  useEffect(() => {
    const eid = eventId ?? deal?.event_id;
    if (!eid) return;
    getEventLoadDates(eid).then(setEventDates);
  }, [eventId, deal?.event_id]);

  // Fetch ledger data for unified financial summary
  const [ledger, setLedger] = useState<EventLedgerDTO | null>(null);
  useEffect(() => {
    const eid = eventId ?? deal?.event_id;
    if (!eid) return;
    let cancelled = false;
    getEventLedger(eid).then((l) => { if (!cancelled) setLedger(l); });
    return () => { cancelled = true; };
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

  // ── Readiness ribbon (post-handoff only) ──
  // gear counts come from the live ops.event_gear_items table via `gearItemsLive`
  // state, not from event.run_of_show_data.gear_items (the handoff-time snapshot).
  // Everything else still reads from event.run_of_show_data because logistics/transport
  // are authored directly in that JSONB today.
  const readiness = useMemo(() => {
    if (!isPostHandoff) return null;
    const loadedStatuses = ['loaded', 'on_site', 'returned'];
    return computeReadiness({
      crewAssigned: crewRows.filter((r) => r.entity_id).length,
      crewConfirmed: crewRows.filter((r) => r.confirmed_at).length,
      crewDeclined: crewRows.filter((r) => r.declined_at).length,
      gearTotal: gearItemsLive.length,
      gearLoaded: gearItemsLive.filter((g) => loadedStatuses.includes(g.status)).length,
      gearAllocatedOnly: gearItemsLive.filter((g) => g.status === 'allocated').length,
      hasVenueStakeholder: stakeholders.some((s) => s.role === 'venue_contact'),
      venueAccessConfirmed: event?.run_of_show_data?.logistics?.venue_access_confirmed ?? false,
      hasTransportMode: !!(event?.run_of_show_data?.transport_mode || event?.run_of_show_data?.logistics?.transport_mode),
      truckLoaded: event?.run_of_show_data?.logistics?.truck_loaded ?? false,
      transportMode: event?.run_of_show_data?.transport_mode ?? null,
      hasClientStakeholder: stakeholders.some((s) => s.role === 'bill_to'),
    });
  }, [crewRows, gearItemsLive, event, stakeholders, isPostHandoff]);

  const hasVenue = stakeholders.some((s) => s.role === 'venue_contact') || !!deal?.venue_id;

  // ── Render ──

  // Shared header strip — editable on Plan (with confirmation for post-handoff changes)
  const headerStrip = deal ? (
    <DealHeaderStrip
      title={localTitle}
      proposedDate={deal.proposed_date}
      eventArchetype={deal.event_archetype ?? null}
      budgetEstimated={deal.budget_estimated}
      saving={scalarsSaving}
      onTitleChange={handleTitleChange}
      onSaveScalar={(patch) => {
        handleSaveScalar(patch as Parameters<typeof updateDealScalars>[1]);
      }}
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
        {/* Post-handoff save confirmation */}
        {confirmingPostHandoffSave && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.03)]">
            <span className="stage-label">This show has been handed off. Save this change?</span>
            <button className="stage-btn stage-btn-primary text-sm px-3 py-1.5" onClick={handleConfirmPostHandoffSave}>Save</button>
            <button className="stage-btn stage-btn-secondary text-sm px-3 py-1.5" onClick={handleCancelPostHandoffSave}>Cancel</button>
          </div>
        )}
        {/* ── Layer 1: Identity + Show Status ── */}
        {headerStrip}
        {/* Merge 1: ShowHealthCard with ReadinessRibbon nested inside */}
        <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
          {dealId && deal && (
            <ShowHealthCard dealId={dealId} health={deal.show_health} onSaved={() => onDealUpdated?.()} inline />
          )}
          {readiness && (
            <div style={{ marginTop: dealId && deal ? 'var(--stage-gap-wide, 12px)' : 0 }}>
              <ReadinessRibbon readiness={readiness} />
            </div>
          )}
        </StagePanel>

        {/* ── Layer 2: Two-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-6 min-h-0">

          {/* ── Main column: plan → prepare → execute → reference → close ── */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>

            {/* Plan: Advancing checklist */}
            <AdvancingChecklist
              eventId={eventId}
              crewRows={crewRows}
              runOfShowData={event.run_of_show_data}
              contractStatus={contract?.status ?? null}
              archetype={deal?.event_archetype ?? null}
              eventDate={deal?.proposed_date ?? event.starts_at?.slice(0, 10) ?? null}
              transportMode={event.run_of_show_data?.transport_mode ?? null}
            />

            {/* Prepare: Crew */}
            {dealId && (
              <ProductionTeamCard dealId={dealId} sourceOrgId={sourceOrgId ?? null} eventDate={deal?.proposed_date} workspaceId={deal?.workspace_id} isLocked={isPostHandoff} />
            )}

            {/* Prepare: Gear + logistics + day sheet send */}
            <DispatchSummary
              eventId={eventId}
              dealId={dealId}
              event={event}
              crewRows={crewRows}
              crewLoading={crewLoading}
              onFlightCheckUpdated={handleCrewUpdated}
              hideVitals
              sourceOrgId={sourceOrgId ?? null}
            />
            {/* Crew comms — Day sheet send (lives with the crew cluster) */}
            {dealId && eventId && (
              <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                  <p className="stage-label">Crew comms</p>
                  <DaySheetActionStrip
                    eventId={eventId}
                    dealId={dealId}
                    crewCount={crewRows.filter((r) => r.entity_id).length}
                    crewWithEmailCount={crewRows.filter((r) => r.entity_id && r.email).length}
                  />
                </div>
              </StagePanel>
            )}
            {/* T-0 lifecycle transition — Start / End show. Date-gated to
                render only within ~24h of starts_at; hidden once wrapped. */}
            {eventId && (
              <ShowControlStrip
                eventId={eventId}
                status={event.status}
                startsAt={event.starts_at}
                endsAt={event.ends_at}
                showStartedAt={event.show_started_at}
                showEndedAt={event.show_ended_at}
                archivedAt={event.archived_at}
                onStateChanged={onEventUpdated}
              />
            )}

            {/* Merge 3: Agreed scope with contract info collapsed into header */}
            {dealId && deal?.workspace_id && (
              <StagePanel style={{ padding: 'var(--stage-padding, 16px)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                  <div className="flex items-center justify-between">
                    <p className="stage-label">
                      Agreed scope
                    </p>
                    <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
                      {contract?.status === 'signed' && (
                        <span className="flex items-center gap-1 text-label tracking-tight px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in oklch, var(--color-unusonic-success) 15%, transparent)', color: 'var(--color-unusonic-success)', border: '1px solid color-mix(in oklch, var(--color-unusonic-success) 20%, transparent)' }}>
                          <FileCheck size={10} aria-hidden />
                          Signed{contract.signed_at ? ` ${new Date(contract.signed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                        </span>
                      )}
                      {contract?.pdf_url && (
                        <a href={contract.pdf_url} target="_blank" rel="noopener noreferrer" className="text-label tracking-tight px-2 py-0.5 rounded-full transition-colors hover:bg-[oklch(1_0_0_/_0.06)]" style={{ color: 'var(--stage-text-tertiary)', border: '1px solid oklch(1 0 0 / 0.08)' }}>
                          PDF
                        </a>
                      )}
                      {publicProposalUrl && (
                        <a href={publicProposalUrl} target="_blank" rel="noopener noreferrer" className="text-label tracking-tight px-2 py-0.5 rounded-full transition-colors hover:bg-[oklch(1_0_0_/_0.06)]" style={{ color: 'var(--stage-text-tertiary)', border: '1px solid oklch(1 0 0 / 0.08)' }}>
                          View proposal
                        </a>
                      )}
                    </div>
                  </div>
                  <ProposalBuilder
                    dealId={dealId}
                    workspaceId={deal.workspace_id}
                    initialProposal={initialProposal}
                    readOnly
                  />
                </div>
              </StagePanel>
            )}

            {/* Client comms — Client update send (lives with the client cluster) */}
            {dealId && eventId && (
              <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                  <p className="stage-label">Client comms</p>
                  <ClientUpdateStrip
                    eventId={eventId}
                    dealId={dealId}
                    clientName={client?.organization?.name ?? null}
                  />
                </div>
              </StagePanel>
            )}

            {/* Journal */}
            {dealId && deal?.workspace_id && (
              <DealDiaryCard dealId={dealId} workspaceId={deal.workspace_id} phaseTag="plan" />
            )}

            {/* Close out: Wrap report (only after event date has passed) */}
            {event && new Date(event.starts_at) < new Date() && (
              <WrapReportCard
                eventId={eventId!}
                eventStartsAt={event.starts_at}
                crewRows={crewRows}
                gearItems={gearItemsLive}
                archivedAt={event.archived_at}
              />
            )}
          </div>

          {/* ── Sidebar: context + financials + timeline ── */}
          <div className="lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <FinancialSummaryCard
              crewRows={crewRows}
              proposalTotal={proposalData?.total ?? null}
              budgetEstimated={deal?.budget_estimated ?? null}
              ledgerActual={ledger?.totalCost ?? null}
              ledgerCollected={ledger?.collected ?? null}
            />
            <PlanVitalsStrip
              guestCountExpected={event.guest_count_expected}
              guestCountActual={event.guest_count_actual}
              techRequirements={event.tech_requirements}
              logisticsDockInfo={event.logistics_dock_info}
              logisticsPowerInfo={event.logistics_power_info}
            />
            <ShowDayContactsCard
              eventId={eventId}
              initialContacts={(event.show_day_contacts ?? []) as { role: string; name: string; phone: string | null; email: string | null }[]}
              onSaved={onEventUpdated}
            />
            <DjPrepSummaryCard rosData={event.run_of_show_data as Record<string, unknown> | null} />
            {event.venue_entity_id && (
              <VenueIntelCard venueEntityId={event.venue_entity_id} />
            )}
            {proposalData && proposalData.status !== 'draft' && (
              <ProductionTimelineWidget eventDate={deal?.proposed_date ?? event.starts_at?.slice(0, 10) ?? null} eventTitle={deal?.title ?? event.title} paymentMilestones={paymentMilestones} dealMilestones={dealMilestones} />
            )}
            <RunOfShowIndexCard eventId={eventId} startsAt={event?.starts_at} />
          </div>
        </div>
      </div>
    );
  } else if (eventId && !event) {
    // Event ID known but summary still loading (async fetch in progress)
    content = (
      <div className="stage-panel-elevated p-6 text-[var(--stage-text-secondary)] text-sm leading-relaxed flex flex-col gap-3">
        <span>Loading show data...</span>
        {loadTimedOut && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--stage-text-tertiary)]">
              This is taking longer than expected.
            </span>
            <button
              type="button"
              onClick={() => {
                setLoadTimedOut(false);
                onEventUpdated?.();
              }}
              className="stage-btn stage-btn-ghost text-xs px-3 py-1.5 rounded-lg"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  } else if (!deal) {
    // No deal and no event — genuinely unlinked
    content = (
      <div className="stage-panel-elevated p-6 text-[var(--stage-text-secondary)] text-sm leading-relaxed">
        No deal linked to this event.
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
        {headerStrip}

        <div className="flex flex-col lg:flex-row gap-6 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <CompletionIndicators deal={deal} stakeholders={stakeholders} crewRows={crewRows} hasProposal={!!proposalData?.hasItems} />
            {onHandoverSuccess && (
              <HandoffConfirmStrip
                deal={deal}
                stakeholders={stakeholders}
                onOpenWizard={() => setHandoffWizardOpen(true)}
              />
            )}
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

  return (
    <>
      {content}
      <AnimatePresence>
        {handoffWizardOpen && deal && dealId && (
          <HandoffWizard
            key="handoff-wizard"
            dealId={dealId}
            deal={deal}
            stakeholders={stakeholders}
            onSuccess={(eventId) => {
              setHandoffWizardOpen(false);
              onHandoverSuccess?.(eventId);
            }}
            onDismiss={() => setHandoffWizardOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
