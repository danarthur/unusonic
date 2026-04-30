'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileCheck, FileText, ExternalLink } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { DispatchSummary } from './dispatch-summary';
import { CrewDetailRail } from './crew-detail-rail';
import { DealHeaderStrip } from './deal-header-strip';
import { AionPlanCard } from './aion-plan-card';
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
import { getWorkspacePipelineStages, type WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { ProductionCapturesPanel } from '@/widgets/network-detail/ui/ProductionCapturesPanel';

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
  /**
   * Per-event signal stack from the Prism bundle. Drives the AionPlanCard.
   * Empty array fires the card's "Nothing drifting" empty state.
   */
  eventSignals?: import('../lib/compute-event-signals').EventSignal[];
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
  eventSignals = [],
}: PlanLensProps) {
  const isPostHandoff = !!eventId && !!event;

  const [handoffWizardOpen, setHandoffWizardOpen] = useState(false);

  // Crew Hub detail rail — lifted here so both ProductionTeamCard (list rows)
  // and GearFlightCheck (crew-sourced supplier chips) can open it.
  const [selectedCrewRow, setSelectedCrewRow] = useState<DealCrewRow | null>(null);

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

  // Phase 3i: resolve the deal's current stage for tag-driven checklist /
  // handoff eligibility. null during load.
  const [pipelineStages, setPipelineStages] = useState<WorkspacePipelineStage[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWorkspacePipelineStages().then((result) => {
      if (!cancelled) setPipelineStages(result?.stages ?? []);
    }).catch(() => {
      if (!cancelled) setPipelineStages([]);
    });
    return () => { cancelled = true; };
  }, []);
  const currentStage = deal?.stage_id
    ? (pipelineStages?.find((s) => s.id === deal.stage_id) ?? null)
    : null;

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
  //
  // useQuery with placeholderData: keepPreviousData so the OLD event's gear
  // stays visible during an event swap until the new fetch lands — pairs with
  // the outer prism DetailPaneTransition (sibling-switch pattern).
  const { data: gearItemsLive = [], refetch: refetchGearItems } = useQuery<EventGearItem[]>({
    queryKey: ['plan-lens', 'gear-items', eventId],
    queryFn: () => (eventId ? getEventGearItems(eventId) : Promise.resolve([])),
    enabled: !!eventId,
    placeholderData: keepPreviousData,
  });
  const fetchGearItems = useCallback(() => {
    void refetchGearItems();
  }, [refetchGearItems]);

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

  // Full proposal for read-only receipt + contract reference
  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null | undefined>(undefined);
  const [publicProposalUrl, setPublicProposalUrl] = useState<string | null>(null);

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

  // Event-scoped reads — useQuery with keepPreviousData so the OLD event's
  // contract / load dates / ledger stay visible while the new fetch resolves.
  // Combined with the outer prism DetailPaneTransition this delivers the
  // sibling-switch hold pattern called out in the load-time strategy doc.
  const eventScopedId = eventId ?? deal?.event_id ?? null;

  const { data: contract = null } = useQuery<Awaited<ReturnType<typeof getContractForEvent>>>({
    queryKey: ['plan-lens', 'contract', eventScopedId],
    queryFn: () => (eventScopedId ? getContractForEvent(eventScopedId) : Promise.resolve(null)),
    enabled: !!eventScopedId,
    placeholderData: keepPreviousData,
  });

  const { data: eventDates = { loadIn: null, loadOut: null } } = useQuery<{ loadIn: string | null; loadOut: string | null }>({
    queryKey: ['plan-lens', 'event-load-dates', eventScopedId],
    queryFn: () => (eventScopedId ? getEventLoadDates(eventScopedId) : Promise.resolve({ loadIn: null, loadOut: null })),
    enabled: !!eventScopedId,
    placeholderData: keepPreviousData,
  });

  const { data: ledger = null } = useQuery<EventLedgerDTO | null>({
    queryKey: ['plan-lens', 'ledger', eventScopedId],
    queryFn: () => (eventScopedId ? getEventLedger(eventScopedId) : Promise.resolve(null)),
    enabled: !!eventScopedId,
    placeholderData: keepPreviousData,
  });

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
  // Brief Me moved onto AionPlanCard (Plan Aion v1, 2026-04-28). The card
  // owns awareness; the header is identity. Keeping Brief Me in both places
  // would split discovery and dilute the card's primary CTA.
  const headerStrip = deal ? (
    <DealHeaderStrip
      title={localTitle}
      proposedDate={deal.proposed_date}
      eventArchetype={deal.event_archetype ?? null}
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

        {/* ── Tier 1: Identity + Show Status (full width) ── */}
        {headerStrip}
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

        {/* ── Tier 1.25: Aion Plan card — drift / silence / conflict + Brief Me ──
            Sits below the deterministic status surfaces (Show Health,
            Readiness Ribbon) so its advisory voice doesn't compete with
            them for status authority. The card answers "what needs my
            attention?" — different from "what's red?" or "what's left?".
            See docs/reference/aion-plan-card-design.md. */}
        {eventId && (
          <AionPlanCard
            eventId={eventId}
            eventTitle={event.title ?? deal?.title ?? null}
            startsAt={event.starts_at}
            signals={eventSignals}
          />
        )}

        {/* ── Tier 1.5: T-0 show control (self-gated to ~24h window) ── */}
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

        {/* ── Tier 2: Advancing checklist (promoted, full width) ──
            Production owner's lead question post-handoff is "what do I need
            to do to be ready?", not "did they pay?". The checklist is the
            day-by-day to-do; financials drop to a lower tier. */}
        <AdvancingChecklist
          eventId={eventId}
          crewRows={crewRows}
          runOfShowData={event.run_of_show_data}
          contractStatus={contract?.status ?? null}
          archetype={deal?.event_archetype ?? null}
          eventDate={deal?.proposed_date ?? event.starts_at?.slice(0, 10) ?? null}
          transportMode={event.run_of_show_data?.transport_mode ?? null}
        />

        {/* ── Tier 3: Production team (promoted, full width) ──
            "Who's working this show?" is the next question. Promoting the
            crew card out of the Workflow column gives it the real estate it
            needs and clears it from the half-width compromise it lived in. */}
        {dealId && (
          <ProductionTeamCard
            dealId={dealId}
            sourceOrgId={sourceOrgId ?? null}
            eventDate={deal?.proposed_date}
            workspaceId={deal?.workspace_id}
            isLocked={isPostHandoff}
            eventId={eventId}
            onOpenCrewDetail={setSelectedCrewRow}
          />
        )}

        {/* ── Tier 4: Workflow ↔ Reference (60/40 columns) ── */}
        <div className="flex flex-col lg:flex-row gap-6 min-h-0">

          {/* Left: Workflow — dispatch, comms, agreed scope. Production team
              promoted out to its own full-width tier above. */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            <DispatchSummary
              eventId={eventId}
              dealId={dealId}
              event={event}
              crewRows={crewRows}
              crewLoading={crewLoading}
              onFlightCheckUpdated={handleCrewUpdated}
              hideVitals
              sourceOrgId={sourceOrgId ?? null}
              onOpenCrewDetail={setSelectedCrewRow}
            />

            {/* Client comms — crew comms absorbed into Crew Hub header */}
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

            {/* Agreed scope — proposal + contract */}
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
          </div>

          {/* Right: Reference — pure look-up, no actions */}
          <div className="lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            {event.venue_entity_id && (
              <VenueIntelCard venueEntityId={event.venue_entity_id} />
            )}
            <ShowDayContactsCard
              eventId={eventId}
              initialContacts={(event.show_day_contacts ?? []) as { role: string; name: string; phone: string | null; email: string | null }[]}
              onSaved={onEventUpdated}
            />
            {proposalData && proposalData.status !== 'draft' && (
              <ProductionTimelineWidget eventDate={deal?.proposed_date ?? event.starts_at?.slice(0, 10) ?? null} eventTitle={deal?.title ?? event.title} paymentMilestones={paymentMilestones} dealMilestones={dealMilestones} />
            )}
            <DjPrepSummaryCard rosData={event.run_of_show_data as Record<string, unknown> | null} />
            <RunOfShowIndexCard eventId={eventId} startsAt={event?.starts_at} />
          </div>
        </div>

        {/* ── Tier 5: At-a-glance KPIs (demoted, full width) ──
            Financials + plan vitals are glance-checks, not lead questions
            post-handoff. When PlanVitalsStrip has nothing to render (no
            guest count, no tech requirements, no dock/power info — common
            for fresh handovers), Financial expands to full width instead
            of leaving an empty slot to the right. */}
        {(() => {
          const hasVitals = event.guest_count_expected != null
            || event.guest_count_actual != null
            || (event.tech_requirements && Object.keys(event.tech_requirements).length > 0)
            || !!event.logistics_dock_info
            || !!event.logistics_power_info;
          return (
            <div
              className={hasVitals ? 'grid grid-cols-1 md:grid-cols-2' : 'grid grid-cols-1'}
              style={{ gap: 'var(--stage-gap-wide, 12px)' }}
            >
              <FinancialSummaryCard
                crewRows={crewRows}
                proposalTotal={proposalData?.total ?? null}
                budgetEstimated={deal?.budget_estimated ?? null}
                ledgerActual={ledger?.totalCost ?? null}
                ledgerCollected={ledger?.collected ?? null}
              />
              {hasVitals && (
                <PlanVitalsStrip
                  guestCountExpected={event.guest_count_expected}
                  guestCountActual={event.guest_count_actual}
                  techRequirements={event.tech_requirements}
                  logisticsDockInfo={event.logistics_dock_info}
                  logisticsPowerInfo={event.logistics_power_info}
                />
              )}
            </div>
          );
        })()}

        {/* ── Tier 6: Journal (full width) ── */}
        {dealId && deal?.workspace_id && (
          <DealDiaryCard dealId={dealId} workspaceId={deal.workspace_id} phaseTag="plan" />
        )}

        {/* ── Tier 6b: Captures linked to this event (inc. predecessor deal) ── */}
        {eventId && deal?.workspace_id && (
          <ProductionCapturesPanel
            workspaceId={deal.workspace_id}
            kind="event"
            productionId={eventId}
            predecessorDealId={dealId}
          />
        )}

        {/* ── Tier 7: Wrap report (full width, post-event only) ── */}
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
            <CompletionIndicators deal={deal} stakeholders={stakeholders} crewRows={crewRows} hasProposal={!!proposalData?.hasItems} stage={currentStage} />
            {onHandoverSuccess && (
              <HandoffConfirmStrip
                deal={deal}
                stakeholders={stakeholders}
                onOpenWizard={() => setHandoffWizardOpen(true)}
                stage={currentStage}
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
      {/* Crew Hub Detail Rail — opens from ProductionTeamCard row clicks
          AND from crew-sourced gear supplier chips in GearFlightCheck. */}
      <CrewDetailRail
        row={selectedCrewRow}
        eventId={eventId}
        sourceOrgId={sourceOrgId ?? null}
        workspaceId={deal?.workspace_id ?? null}
        eventDate={deal?.proposed_date ?? event?.starts_at?.slice(0, 10) ?? null}
        eventStartsAt={event?.starts_at ?? null}
        dealId={dealId}
        onClose={() => setSelectedCrewRow(null)}
        onRowChanged={handleCrewUpdated}
      />
    </>
  );
}
