'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FileCheck, FileText, ExternalLink, Flame, AlertTriangle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { PipelineTracker } from '@/features/sales/ui/pipeline-tracker';
import { ProposalBuilder } from '@/features/sales/ui/proposal-builder';
import { getProposalForDeal, getProposalPublicUrl, getProposalHistoryForDeal } from '@/features/sales/api/proposal-actions';
import type { ProposalHistoryEntry } from '@/features/sales/api/proposal-actions';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { getContractForEvent } from '../actions/get-contract-for-event';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';
import { DealDetailsCard } from './deal-details-card';
import { DealHeaderStrip } from './deal-header-strip';
import { deleteDeal } from '../actions/delete-deal';
import { sendProposalReminder } from '@/features/sales/api/proposal-actions';
import { updateDealStatus } from '../actions/update-deal-status';
import { MarkAsLostModal } from './mark-as-lost-modal';
import type { LostReason } from '../actions/get-deal';
import { DealDiaryCard } from './deal-diary-card';
import { NextActionsCard } from './next-actions-card';
import { getDealCrew, type DealCrewRow } from '../actions/deal-crew';
import { getEventLoadDates } from '../actions/get-event-summary';
import { formatRelTime } from '@/shared/lib/format-currency';
import { updateDealScalars } from '../actions/update-deal-scalars';
import { ProductionTeamCard } from './production-team-card';
import { ProductionTimelineWidget } from '@/widgets/production-timeline';
import { computePaymentMilestones } from '@/features/sales/lib/compute-payment-milestones';
import { FollowUpCard } from './follow-up-card';
import { FollowUpActionLog } from './follow-up-action-log';
import { getFollowUpForDeal, type FollowUpQueueItem } from '../actions/follow-up-actions';
import { ProductionCapturesPanel } from '@/widgets/network-detail/ui/ProductionCapturesPanel';


const DEAL_PIPELINE_STAGES = ['Inquiry', 'Proposal', 'Sent', 'Signed', 'Won'] as const;
const STATUS_TO_STAGE: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
  contract_signed: 3,
  deposit_received: 3,
  won: 4,
  lost: 4,
};

export type DealLensProps = {
  deal: DealDetail;
  client?: DealClientContext | null;
  /** Stakeholders (Bill-To, Planner, Venue, Vendor) for this deal. */
  stakeholders?: DealStakeholderDisplay[];
  /** Current Network org id (for Add Connection OmniSearch). */
  sourceOrgId?: string | null;
  /** Called after linking a client or stakeholder so Prism can refetch. */
  onClientLinked?: () => void;
};

export function DealLens({ deal, client, stakeholders = [], sourceOrgId = null, onClientLinked }: DealLensProps) {
  const router = useRouter();
  const isLocked = !!deal.event_id;
  // undefined = not yet fetched; null = fetched, no proposal exists
  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null | undefined>(undefined);
  const [publicProposalUrl, setPublicProposalUrl] = useState<string | null>(null);
  const [proposalHistory, setProposalHistory] = useState<ProposalHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [contract, setContract] = useState<Awaited<ReturnType<typeof getContractForEvent>>>(null);
  const [crewRows, setCrewRows] = useState<DealCrewRow[]>([]);
  const [eventDates, setEventDates] = useState<{ loadIn: string | null; loadOut: string | null }>({ loadIn: null, loadOut: null });
  const [queueItem, setQueueItem] = useState<FollowUpQueueItem | null>(null);

  // Hard delete state — only relevant when deal has no event_id
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reminder state
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  // Mark as lost modal
  const [lostModalOpen, setLostModalOpen] = useState(false);


  // Scalar field local mirrors (for inline editing in DealHeaderStrip)
  const [localTitle, setLocalTitle] = useState<string>(deal.title ?? '');
  const [localArchetype, setLocalArchetype] = useState<string | null>(deal.event_archetype);
  const [localDate, setLocalDate] = useState<string | null>(deal.proposed_date);
  const [localBudget, setLocalBudget] = useState<number | null>(deal.budget_estimated);

  // Re-sync locals when navigating between deals or when deal data updates
  useEffect(() => {
    setLocalTitle(deal.title ?? '');
    setLocalArchetype(deal.event_archetype);
    setLocalDate(deal.proposed_date);
    setLocalBudget(deal.budget_estimated);
  }, [deal.id, deal.title, deal.event_archetype, deal.proposed_date, deal.budget_estimated]);

  const [scalarsSaving, setScalarsSaving] = useState(false);

  const handleSaveScalar = async (patch: Parameters<typeof updateDealScalars>[1]) => {
    setScalarsSaving(true);
    const result = await updateDealScalars(deal.id, patch);
    setScalarsSaving(false);
    if (!result.success) toast.error(result.error ?? 'Failed to save');
  };

  // Title debounce
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      handleSaveScalar({ title: value || null });
    }, 800);
  };

  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSendReminder = async () => {
    setReminderSending(true);
    const result = await sendProposalReminder(deal.id);
    setReminderSending(false);
    if (result.ok) {
      setReminderSent(true);
      toast.success('Reminder sent');
    } else {
      toast.error(result.error ?? 'Failed to send reminder');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteDeal(deal.id);
    setIsDeleting(false);
    if (result.success) {
      router.push('/crm');
    } else {
      toast.error(result.error ?? 'Failed to delete deal');
      setDeleteConfirm(false);
    }
  };

  const handleMarkAsLost = async (reason: LostReason, competitorName: string | null) => {
    const result = await updateDealStatus(deal.id, 'lost', { lost_reason: reason, lost_to_competitor_name: competitorName });
    if (result.success) {
      setLostModalOpen(false);
      toast.success('Deal marked as lost');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Failed to mark deal as lost');
    }
  };


  // Cleanup debounces on unmount
  useEffect(() => {
    return () => {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProposalForDeal(deal.id).then((p) => {
      if (!cancelled) setInitialProposal(p);
    });
    getProposalHistoryForDeal(deal.id).then((h) => {
      if (!cancelled) setProposalHistory(h);
    });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  // Crew data for Next Actions card + timeline
  useEffect(() => {
    getDealCrew(deal.id).then(setCrewRows);
  }, [deal.id]);
  const crewCount = crewRows.filter((r) => r.entity_id).length;

  // Follow-up queue item
  useEffect(() => {
    if (deal?.id) {
      getFollowUpForDeal(deal.id).then(setQueueItem);
    }
  }, [deal?.id]);

  useEffect(() => {
    if (!deal.event_id) {
      setContract(null);
      setEventDates({ loadIn: null, loadOut: null });
      return;
    }
    let cancelled = false;
    getContractForEvent(deal.event_id).then((c) => {
      if (!cancelled) setContract(c);
    });
    getEventLoadDates(deal.event_id).then((d) => {
      if (!cancelled) setEventDates(d);
    });
    return () => {
      cancelled = true;
    };
  }, [deal.event_id]);

  // Refetch proposal when user returns to this tab or navigates back from proposal builder
  useEffect(() => {
    const refetch = () => {
      getProposalForDeal(deal.id).then(setInitialProposal);
      getProposalPublicUrl(deal.id).then(setPublicProposalUrl);
      getProposalHistoryForDeal(deal.id).then(setProposalHistory);
      getFollowUpForDeal(deal.id).then(setQueueItem);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    const onFocus = () => refetch();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [deal.id]);

  // When proposal is sent or deal is handed over, fetch the public URL so "View signed proposal" works
  useEffect(() => {
    const sent = initialProposal?.status === 'sent' || initialProposal?.status === 'accepted' || initialProposal?.status === 'viewed';
    if (!sent && !deal.event_id) {
      setPublicProposalUrl(null);
      return;
    }
    let cancelled = false;
    getProposalPublicUrl(deal.id).then((url) => {
      if (!cancelled) setPublicProposalUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [deal.id, deal.event_id, initialProposal?.status]);

  const refetchProposal = useCallback(() => {
    getProposalForDeal(deal.id).then((p) => {
      setInitialProposal(p);
      if (p?.status === 'sent' || p?.status === 'accepted' || p?.status === 'viewed') {
        getProposalPublicUrl(deal.id).then(setPublicProposalUrl);
      } else {
        setPublicProposalUrl(null);
      }
    });
    getProposalHistoryForDeal(deal.id).then(setProposalHistory);
  }, [deal.id]);

  const proposalStatus = initialProposal?.status;
  const proposalSent = proposalStatus === 'sent' || proposalStatus === 'accepted' || proposalStatus === 'viewed';
  const proposalSigned = proposalStatus === 'accepted';
  const sentDate =
    initialProposal?.updated_at &&
    new Date(initialProposal.updated_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const signedAt = initialProposal?.accepted_at;
  const signedDate =
    signedAt &&
    new Date(signedAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const depositPaidAt = initialProposal?.deposit_paid_at;
  const depositPercent = initialProposal?.deposit_percent;

  // Past-date detection — deal has a date that's already passed and hasn't been handed over
  const today = new Date().toISOString().slice(0, 10);
  const isDatePast = !isLocked && deal.proposed_date != null && deal.proposed_date < today
    && !['won', 'lost'].includes(deal.status);

  // deal.status is authoritative but may be stale (the deal prop is not refetched after sendForSignature).
  // initialProposal IS refetched after every send, so use it to derive a minimum stage in real-time.
  const dealStage = STATUS_TO_STAGE[deal.status] ?? 0;
  const proposalImpliedStage = (() => {
    if (!initialProposal) return 0;
    if (proposalStatus === 'accepted') return 3; // signed → "Signed" stage
    if (proposalStatus === 'sent' || proposalStatus === 'viewed') return 2; // sent/viewed → "Sent" stage
    return 1; // draft exists → at least "Proposal" stage
  })();
  const currentStage = Math.max(dealStage, proposalImpliedStage);

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 min-h-0"
      data-lens="deal"
    >
      {/* Position 1: Identity header */}
      <DealHeaderStrip
        title={localTitle}
        proposedDate={localDate}
        eventArchetype={localArchetype}
        readOnly={isLocked}
        saving={scalarsSaving}
        onTitleChange={handleTitleChange}
        onSaveScalar={(patch) => {
          if (patch.proposed_date !== undefined) setLocalDate(patch.proposed_date);
          if (patch.event_archetype !== undefined) setLocalArchetype(patch.event_archetype);
          if (patch.budget_estimated !== undefined) setLocalBudget(patch.budget_estimated);
          handleSaveScalar(patch as Parameters<typeof updateDealScalars>[1]);
        }}
        deal={deal}
        stakeholders={stakeholders}
        client={client ?? null}
        sourceOrgId={sourceOrgId}
        onStakeholdersChange={onClientLinked ?? (() => {})}
      />

      {/* Position 2: Pipeline tracker */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated className="p-5">
          <p className="stage-label mb-4">
            Deal pipeline
          </p>
          <PipelineTracker
            currentStage={currentStage}
            stages={[...DEAL_PIPELINE_STAGES]}
          />
        </StagePanel>
      </motion.div>

      {/* Scalar pickers (date, archetype, budget) moved into DealHeaderStrip as portaled dropdowns */}


      {/* Follow-up card — replaces inline stall warning with actionable follow-up */}
      {!isLocked && initialProposal !== undefined && (
        <FollowUpCard
          deal={deal}
          queueItem={queueItem}
          proposal={initialProposal ?? null}
          clientPhone={client?.mainContact?.phone ?? null}
          clientEmail={client?.mainContact?.email ?? null}
        />
      )}

      {/* Master-detail split: left column scrolls, right column sticks */}
      <div className="flex flex-col lg:flex-row gap-6 min-h-0">
        {/* ── Left column: scrollable content ── */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          {/* Production timeline */}
          {initialProposal && initialProposal.status !== 'draft' && (
            <ProductionTimelineWidget
              eventDate={deal.proposed_date}
              eventTitle={deal.title}
              paymentMilestones={computePaymentMilestones({
                signedAt: initialProposal.signed_at ?? null,
                acceptedAt: initialProposal.accepted_at ?? null,
                depositPercent: initialProposal.deposit_percent ?? null,
                depositPaidAt: initialProposal.deposit_paid_at ?? null,
                depositDeadlineDays: (initialProposal as { deposit_deadline_days?: number | null }).deposit_deadline_days ?? null,
                paymentDueDays: initialProposal.payment_due_days ?? null,
                proposedDate: deal.proposed_date,
                proposalTotal: initialProposal.items?.reduce((sum, item) => {
                  if ((item as { is_optional?: boolean }).is_optional) return sum;
                  const price = (item as { override_price?: number | null }).override_price ?? Number(item.unit_price ?? 0);
                  return sum + (item.quantity ?? 1) * price;
                }, 0) ?? null,
              })}
              dealMilestones={{
                createdAt: deal.created_at,
                proposalSentAt: initialProposal.updated_at ?? null,
                proposalViewedAt: (initialProposal as unknown as Record<string, unknown>).first_viewed_at as string | null ?? null,
                proposalSignedAt: initialProposal.accepted_at ?? null,
                depositPaidAt: initialProposal.deposit_paid_at ?? null,
                handedOverAt: deal.won_at ?? null,
                crewConfirmedAt: (() => {
                  const assigned = crewRows.filter((r) => r.entity_id);
                  if (assigned.length === 0) return null;
                  const allConfirmed = assigned.every((r) => r.confirmed_at);
                  if (!allConfirmed) return null;
                  return assigned.reduce((latest, r) =>
                    r.confirmed_at && r.confirmed_at > (latest ?? '') ? r.confirmed_at : latest,
                    null as string | null
                  );
                })(),
                loadInAt: eventDates.loadIn,
                loadOutAt: eventDates.loadOut,
              }}
            />
          )}

          {/* Production team */}
          <ProductionTeamCard dealId={deal.id} sourceOrgId={sourceOrgId ?? null} eventDate={deal.proposed_date} workspaceId={deal.workspace_id} isLocked={isLocked} />

          {/* Deal diary */}
          <DealDiaryCard dealId={deal.id} dealTitle={deal.title} workspaceId={deal.workspace_id} />

          {/* Captures linked to this deal */}
          {deal.workspace_id && (
            <ProductionCapturesPanel
              workspaceId={deal.workspace_id}
              kind="deal"
              productionId={deal.id}
            />
          )}

          {/* Follow-up action log */}
          <FollowUpActionLog dealId={deal.id} />

          {/* Post-handover: contract card + inline proposal receipt */}
          {isLocked && deal.workspace_id && (
            <>
              <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
                <div className="flex items-start" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                  <div className="p-3 stage-panel-nested shrink-0" style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}>
                    <FileCheck size={24} className="text-[var(--color-unusonic-success)]" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="stage-label" style={{ marginBottom: 'var(--stage-gap, 6px)' }}>
                      Contract
                    </p>
                    <h2 className="stage-readout leading-none">
                      {contract?.status === 'signed' ? 'Signed by client' : 'Contract'}
                    </h2>
                    {contract?.signed_at && (
                      <p style={{ fontSize: 'var(--stage-input-font-size, 13px)', color: 'var(--stage-text-secondary)', marginTop: 'var(--stage-gap, 6px)' }}>
                        Signed on{' '}
                        {new Date(contract.signed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {contract?.pdf_url ? (
                      <a
                        href={contract.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                        style={{ color: 'var(--stage-accent)', marginTop: 'var(--stage-gap-wide, 12px)' }}
                      >
                        <ExternalLink size={16} aria-hidden />
                        View PDF
                      </a>
                    ) : (
                      <p style={{ fontSize: 'var(--stage-input-font-size, 13px)', color: 'var(--stage-text-secondary)', marginTop: 'var(--stage-gap, 6px)' }}>
                        The signed proposal is the contract record.
                      </p>
                    )}
                  </div>
                </div>
                {publicProposalUrl && (
                  <div style={{ marginTop: 'var(--stage-gap-wide, 12px)', paddingTop: 'var(--stage-gap-wide, 12px)', borderTop: '1px solid var(--stage-edge-subtle)' }}>
                    <a
                      href={publicProposalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="stage-btn stage-btn-secondary inline-flex items-center gap-2"
                    >
                      <FileText size={18} aria-hidden />
                      View signed proposal
                    </a>
                  </div>
                )}
              </StagePanel>

              <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                <p className="stage-label">
                  Proposal (agreed scope)
                </p>
                <ProposalBuilder
                  dealId={deal.id}
                  workspaceId={deal.workspace_id}
                  initialProposal={initialProposal}
                  readOnly={true}
                  onProposalRefetch={refetchProposal}
                  className="max-w-2xl"
                />
              </div>
            </>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          {/* Proposal card */}
          {!isLocked && (
            <StagePanel elevated className="flex flex-col" style={{ padding: 'var(--stage-padding, 16px)', overflow: 'visible' }}>
              <p className="stage-label" style={{ marginBottom: 'var(--stage-gap, 6px)' }}>
                Proposal
              </p>

              {isDatePast && (
                <div
                  className="flex items-start gap-2.5 px-3 py-2.5 text-xs leading-relaxed border-l-[3px] border-l-[var(--color-unusonic-warning)]"
                  style={{
                    background: 'var(--stage-surface)',
                    borderRadius: 'var(--stage-radius-nested, 8px)',
                    color: 'var(--color-unusonic-warning)',
                    marginBottom: 'var(--stage-gap-wide, 12px)',
                  }}
                >
                  <AlertTriangle size={14} className="shrink-0 mt-px" />
                  <div className="min-w-0">
                    <p className="font-medium">Show date has passed</p>
                    <p className="mt-0.5" style={{ color: 'var(--stage-text-secondary)' }}>
                      Update the date or mark as lost.
                    </p>
                  </div>
                </div>
              )}

              <h2 className="stage-readout-lg leading-none" style={{ marginBottom: 'var(--stage-gap, 6px)' }}>
                {proposalSigned
                  ? 'Signed'
                  : proposalSent
                    ? 'Proposal sent'
                    : initialProposal
                      ? 'Draft in progress'
                      : 'Proposal'}
              </h2>
              <p style={{ color: 'var(--stage-text-secondary)', fontSize: 'var(--stage-input-font-size, 13px)', lineHeight: '1.5', marginBottom: 'var(--stage-gap-wide, 12px)' }}>
                {proposalSigned
                  ? 'Proposal is locked. Use a change order to add items.'
                  : proposalSent
                    ? 'You can still edit and resend if the client needs changes.'
                    : initialProposal
                      ? 'Draft saved. Continue editing and send when ready.'
                      : 'Build the proposal, attach packages, then send to the client.'}
              </p>

              {proposalSigned && depositPercent && depositPercent > 0 && (
                <p
                  className="flex items-center gap-1.5"
                  style={{
                    fontSize: 'var(--stage-label-size, 11px)',
                    color: depositPaidAt ? 'var(--color-unusonic-success)' : 'var(--color-unusonic-warning)',
                    marginBottom: 'var(--stage-gap-wide, 12px)',
                  }}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                  {depositPaidAt ? 'Deposit received' : 'Deposit pending'}
                </p>
              )}
              {proposalSent && !proposalSigned && (
                <div className="flex items-center justify-between" style={{ gap: 'var(--stage-gap, 6px)', marginBottom: 'var(--stage-gap-wide, 12px)' }}>
                  {(() => {
                    const viewCount = initialProposal?.view_count ?? 0;
                    const lastViewedAt = initialProposal?.last_viewed_at ?? null;
                    const isHotLead = viewCount >= 2 && lastViewedAt
                      ? Date.now() - new Date(lastViewedAt).getTime() < 48 * 3_600_000
                      : false;

                    if (viewCount === 0) {
                      return (
                        <p className="flex items-center gap-1.5" style={{ fontSize: 'var(--stage-label-size, 11px)', color: 'var(--stage-text-secondary)' }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-unusonic-warning)' }} />
                          Not yet viewed
                        </p>
                      );
                    }

                    return (
                      <p className="flex items-center gap-1.5" style={{ fontSize: 'var(--stage-label-size, 11px)', color: 'var(--stage-text-secondary)' }}>
                        {isHotLead && (
                          <Flame size={12} style={{ color: 'var(--color-unusonic-warning)' }} className="shrink-0" aria-hidden />
                        )}
                        <span style={isHotLead ? { color: 'var(--color-unusonic-warning)' } : undefined}>
                          Viewed {viewCount} time{viewCount !== 1 ? 's' : ''}
                        </span>
                        {lastViewedAt && (
                          <span style={{ color: 'var(--stage-text-tertiary)' }}>· {formatRelTime(lastViewedAt)}</span>
                        )}
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={handleSendReminder}
                    disabled={reminderSending || reminderSent}
                    className="transition-colors disabled:opacity-45 shrink-0"
                    style={{ fontSize: 'var(--stage-label-size, 11px)', color: 'var(--stage-text-secondary)' }}
                  >
                    {reminderSent ? 'Reminder sent' : reminderSending ? 'Sending…' : 'Send reminder'}
                  </button>
                </div>
              )}

              <Link
                href={`/crm/deal/${deal.id}/proposal-builder`}
                className="stage-btn stage-btn-primary inline-flex items-center justify-center gap-2"
              >
                {proposalSigned
                  ? 'View proposal'
                  : proposalSent
                    ? 'Open proposal'
                    : initialProposal
                      ? 'Continue editing'
                      : 'Build proposal'}
              </Link>

              {/* Footer */}
              <div className="mt-auto flex flex-col" style={{ paddingTop: 'var(--stage-gap-wide, 12px)', gap: 'var(--stage-gap-wide, 12px)' }}>
                {(proposalSent || proposalSigned) && (sentDate || signedDate) && (
                  <div className="flex items-center justify-between" style={{ paddingTop: 'var(--stage-gap-wide, 12px)', borderTop: '1px solid var(--stage-edge-subtle)', gap: 'var(--stage-gap, 6px)' }}>
                    <p className="stage-label">
                      {proposalSigned && signedDate ? `Signed ${signedDate}` : sentDate ? `Sent ${sentDate}` : null}
                    </p>
                    {publicProposalUrl && (proposalSent || proposalSigned) && (
                      <a
                        href={publicProposalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="stage-label underline shrink-0"
                        style={{ color: 'var(--stage-text-secondary)' }}
                      >
                        View link
                      </a>
                    )}
                  </div>
                )}

                {proposalHistory.length > 1 && (
                  <div style={{ paddingTop: 'var(--stage-gap-wide, 12px)', borderTop: '1px solid var(--stage-edge-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="w-full flex items-center justify-between stage-label transition-colors"
                      style={{ color: 'var(--stage-text-secondary)' }}
                    >
                      <span>{proposalHistory.length} proposal{proposalHistory.length !== 1 ? 's' : ''}</span>
                      <span>{historyExpanded ? 'Hide' : 'Show history'}</span>
                    </button>
                    <AnimatePresence>
                      {historyExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={STAGE_LIGHT}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)', paddingTop: 'var(--stage-gap-wide, 12px)' }}>
                            {proposalHistory.map((entry, idx) => {
                              const version = proposalHistory.length - idx;
                              const isCurrent = idx === 0;
                              const created = new Date(entry.created_at).toLocaleDateString(undefined, {
                                month: 'short', day: 'numeric', year: 'numeric',
                              });
                              const total = entry.total.toLocaleString(undefined, {
                                style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
                              });

                              return (
                                <div
                                  key={entry.id}
                                  className="flex items-center stage-label"
                                  style={{
                                    gap: 'var(--stage-gap, 6px)',
                                    padding: 'var(--stage-gap, 6px) var(--stage-gap-wide, 12px)',
                                    borderRadius: 'var(--stage-radius-nested, 8px)',
                                    color: isCurrent ? 'var(--stage-text-primary)' : 'var(--stage-text-secondary)',
                                    background: isCurrent
                                      ? 'color-mix(in oklch, var(--stage-accent) 6%, transparent)'
                                      : 'transparent',
                                  }}
                                >
                                  <span className="font-medium tabular-nums shrink-0">v{version}</span>
                                  <ProposalStatusPill status={entry.status} />
                                  <EmailDeliveryIndicator entry={entry} />
                                  <span className="tabular-nums shrink-0">{total}</span>
                                  <span className="ml-auto shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>{created}</span>
                                  {entry.view_count > 0 && (
                                    <span className="tabular-nums shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>
                                      {entry.view_count} view{entry.view_count !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </StagePanel>
          )}

          {/* Signals */}
          <DealDetailsCard
            deal={deal}
            stakeholders={stakeholders}
            client={client ?? null}
            sourceOrgId={sourceOrgId ?? null}
            onStakeholdersChange={onClientLinked ?? (() => {})}
            initialProposal={initialProposal}
          />

          {/* Next actions */}
          <NextActionsCard
            deal={deal}
            proposal={initialProposal}
            stakeholders={stakeholders}
            crewCount={crewCount}
          />
        </div>
      </div>

      {/* Terminal actions — mark as lost + hard delete */}
      {!isLocked && (
        <div className="border-t border-[oklch(1_0_0_/_0.06)] pt-4 mt-2">
          {!deleteConfirm ? (
            <div className="flex items-center gap-4">
              {deal.status !== 'lost' && (
                <button
                  type="button"
                  onClick={() => setLostModalOpen(true)}
                  className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                >
                  Mark as lost
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
              >
                Permanently delete
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--stage-text-tertiary)] leading-relaxed">
                Deleting this deal is permanent and cannot be reversed.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-xs font-medium text-[var(--color-unusonic-error)] hover:text-[var(--color-unusonic-error)] border-[var(--color-unusonic-error)]/40 bg-[var(--color-unusonic-error)]/10 px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-unusonic-error)]/60 disabled:opacity-45"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                >
                  {isDeleting ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <MarkAsLostModal
        open={lostModalOpen}
        onClose={() => setLostModalOpen(false)}
        onConfirm={handleMarkAsLost}
      />
    </motion.div>
  );
}

/* ─── Proposal Status Pill (history log) ─── */

const PROPOSAL_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--stage-text-tertiary)' },
  sent: { label: 'Sent', color: 'var(--color-unusonic-warning)' },
  viewed: { label: 'Viewed', color: 'var(--color-unusonic-warning)' },
  accepted: { label: 'Signed', color: 'var(--color-unusonic-success)' },
};

function EmailDeliveryIndicator({ entry }: { entry: ProposalHistoryEntry }) {
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

function ProposalStatusPill({ status }: { status: string }) {
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
