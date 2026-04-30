'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FileCheck, FileText, ExternalLink, Flame, AlertTriangle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { PipelineTracker } from '@/features/sales/ui/pipeline-tracker';
// ProposalBuilder is heavy (full-page studio with line-item editor, palette,
// pricing rules). Only rendered when !isLocked (~60% of deals — pre-handoff).
// Dynamic import strips it from initial bundle for already-handed-off deals.
const ProposalBuilder = dynamic(
  () => import('@/features/sales/ui/proposal-builder').then((m) => ({ default: m.ProposalBuilder })),
  { ssr: false },
);
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
import { DealNarrativeStrip } from './deal-narrative-strip';
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
import { AionSuggestionRow } from './aion-suggestion-row';
import { ConflictsPanel } from './conflicts-panel';
// AionDealCard is large (~1500 LOC) and ambient — it fades in after the
// primary deal block paints (deferred via requestIdleCallback below).
// Dynamic import strips it from the initial JS bundle so first paint of
// the deal page doesn't pay for code that won't render until idle.
const AionDealCard = dynamic(
  () => import('./aion-deal-card').then((m) => ({ default: m.AionDealCard })),
  { ssr: false },
);
import { getAionCardBundle, type AionCardBundle } from '../actions/get-aion-card-bundle';
import {
  acceptAionCardAdvance,
  revertAionCardAdvance,
  dismissAionCardPipeline,
  logAionCardEvent,
} from '../actions/aion-card-actions';
import type { OutboundRow, PipelineRow, AionCardData } from '../actions/get-aion-card-for-deal';
import { snoozeFollowUp, dismissFollowUp } from '../actions/follow-up-actions';
import { DealShowsList } from './deal-shows-list';
import { SeriesCrewAffordance } from './series-crew-affordance';
import { ProductionTimelineWidget } from '@/widgets/production-timeline';
import { computePaymentMilestones } from '@/features/sales/lib/compute-payment-milestones';
import { FollowUpCard } from './follow-up-card';
import { getFollowUpForDeal, type FollowUpQueueItem } from '../actions/follow-up-actions';
import { getWorkspacePipelineStages, type WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { getDealTimeline, type DealTimelineEntry } from '../actions/get-deal-timeline';
import { getDealLensBundle } from '../actions/get-deal-lens-bundle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductionCapturesPanel } from '@/widgets/network-detail/ui/ProductionCapturesPanel';
import { RepliesCard } from '@/features/comms/replies/ui/RepliesCard';


// Legacy fallback used while the workspace's pipeline is loading (first paint)
// and for any deal whose status doesn't match a known stage slug. Phase 2d-3:
// once stages load, we render the workspace's actual working+won stages.
const DEAL_PIPELINE_STAGES_FALLBACK = ['Inquiry', 'Proposal', 'Sent', 'Signed', 'Won'] as const;
const STATUS_TO_STAGE_FALLBACK: Record<string, number> = {
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
  /**
   * Pipeline stages, lifted from Prism so DealLens doesn't fetch its own
   * copy on every mount (the value is identical workspace-wide). Pass null
   * for "still loading"; pass [] to render the legacy fallback.
   */
  pipelineStages?: WorkspacePipelineStage[] | null;
  /** Per-deal signal stack from the Prism bundle. Forwarded to DealDetailsCard. */
  signals?: import('../lib/compute-deal-signals').DealSignal[];
};

import { emitCadenceAccuracyIfPersonalized } from './deal-lens/cadence-telemetry';
import { ProposalStatusPill, EmailDeliveryIndicator } from './deal-lens/proposal-status';
import { DealActivitySection } from './deal-lens/activity-section';

export function DealLens({
  deal,
  client,
  stakeholders = [],
  sourceOrgId = null,
  onClientLinked,
  pipelineStages: pipelineStagesProp,
  signals = [],
}: DealLensProps) {
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

  // Fork C: unified Aion deal card — gated by `crm.unified_aion_card` flag.
  // When `enabled=true`, `<AionDealCard>` replaces the four legacy surfaces
  // (AionSuggestionRow, FollowUpCard, stall badge, NextActionsCard). When
  // `enabled=false`, legacy chain renders as before.
  const [aionBundle, setAionBundle] = useState<AionCardBundle>({ enabled: false, data: null });

  // Hard delete state — only relevant when deal has no event_id
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reminder state
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  // Mark as lost modal
  const [lostModalOpen, setLostModalOpen] = useState(false);

  // Phase 2d-3: workspace pipeline stages for the Deal Lens tracker.
  // null = loading (use hardcoded fallback); [] = no pipeline (fallback).
  // Lifted to Prism so we don't fetch the same workspace-wide data twice on
  // every page load. Falls back to a local fetch only when the prop is
  // truly omitted (preserves backwards compatibility for any other caller).
  const [localPipelineStages, setLocalPipelineStages] = useState<WorkspacePipelineStage[] | null>(null);
  useEffect(() => {
    if (pipelineStagesProp !== undefined) return;
    let cancelled = false;
    getWorkspacePipelineStages().then((result) => {
      if (cancelled) return;
      setLocalPipelineStages(result?.stages ?? []);
    }).catch(() => {
      if (!cancelled) setLocalPipelineStages([]);
    });
    return () => { cancelled = true; };
  }, [pipelineStagesProp]);
  const pipelineStages = pipelineStagesProp ?? localPipelineStages;

  // Unified timeline (ops.deal_timeline_v — unions deal_activity_log +
  // follow_up_log). null = not yet fetched; [] = fetched, no entries.
  // Note: we deliberately do NOT clear `activity` to null on deal.id change —
  // showing the previous deal's timeline briefly during transition is much
  // less jarring than flashing a "Loading…" placeholder. Atomic swap when
  // the new fetch resolves. (User Advocate: "never show intermediate states
  // between Deal A and Deal B".)
  const [activity, setActivity] = useState<DealTimelineEntry[] | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Single bundled fetch for the 8 deal-scoped reads deal-lens used to fire
  // as 8 separate server actions on mount. In Next.js dev each round-trip
  // pays ~600ms of proxy.ts auth overhead, so the cascade was 4-7s before
  // any card rendered. The bundle parallelizes server-side via Promise.all
  // — total wall clock is now max(individual) instead of sum(individual).
  // Mirrors into existing setStates below to keep call sites untouched.
  const queryClient = useQueryClient();
  const { data: dealLensBundle, error: dealLensBundleError } = useQuery({
    queryKey: ['deal-lens-bundle', deal.id, deal.event_id ?? null],
    queryFn: () => getDealLensBundle(deal.id, deal.event_id ?? null),
    enabled: !!deal.id,
    staleTime: 30_000,
    retry: 0,
  });
  useEffect(() => {
    if (dealLensBundleError) {
      console.error('[DealLens] bundle fetch failed:', dealLensBundleError);
    }
  }, [dealLensBundleError]);


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

  // Stable handler reference — wrapping in useCallback so children memo'd
  // by React.memo (DealHeaderStrip, etc.) don't re-render every time a
  // sibling state changes (e.g. keystroke in the title field).
  const handleSaveScalar = useCallback(
    async (patch: Parameters<typeof updateDealScalars>[1]) => {
      setScalarsSaving(true);
      const result = await updateDealScalars(deal.id, patch);
      setScalarsSaving(false);
      if (!result.success) toast.error(result.error ?? 'Failed to save');
    },
    [deal.id],
  );

  // Title debounce
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = useCallback(
    (value: string) => {
      setLocalTitle(value);
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = setTimeout(() => {
        handleSaveScalar({ title: value || null });
      }, 800);
    },
    [handleSaveScalar],
  );

  // Stable scalar-save handler for the header strip. Inline arrow functions
  // would create fresh references every render, busting any React.memo on
  // the header strip — so we lift this out and useCallback the dependency
  // chain.
  const handleHeaderSaveScalar = useCallback(
    (patch: {
      proposed_date?: string | null;
      event_archetype?: string | null;
      budget_estimated?: number | null;
      event_start_time?: string | null;
      event_end_time?: string | null;
    }) => {
      if (patch.proposed_date !== undefined) setLocalDate(patch.proposed_date);
      if (patch.event_archetype !== undefined) {
        // Header strip emits the freeform display string; the action accepts
        // the canonical archetype enum. Cast at the boundary — server-side
        // Zod parsing will reject anything outside the enum.
        setLocalArchetype(patch.event_archetype);
      }
      if (patch.budget_estimated !== undefined) setLocalBudget(patch.budget_estimated);
      handleSaveScalar(
        patch as Parameters<typeof updateDealScalars>[1],
      );
    },
    [handleSaveScalar],
  );

  // Stable no-op fallback for the optional onClientLinked prop. Without this,
  // the inline `onClientLinked ?? (() => {})` would create a fresh function
  // every render and break header-strip memoization.
  const stakeholdersChangeHandler = useCallback(() => {
    onClientLinked?.();
  }, [onClientLinked]);

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

  // Mirror bundle data into the existing useStates so call sites elsewhere
  // in the file don't need to change. The cascading useEffects this replaces
  // (proposal, proposalHistory, crew, follow-up, contract, eventDates,
  // proposalPublicUrl, timeline) all flowed into these same setters.
  useEffect(() => {
    if (!dealLensBundle) return;
    setInitialProposal(dealLensBundle.proposal);
    setProposalHistory(dealLensBundle.proposalHistory);
    setCrewRows(dealLensBundle.crew);
    setQueueItem(dealLensBundle.followUp);
    setContract(dealLensBundle.contract);
    setEventDates(dealLensBundle.eventDates);
    setPublicProposalUrl(dealLensBundle.proposalPublicUrl);
    setActivity(dealLensBundle.timeline);
  }, [dealLensBundle]);

  const crewCount = crewRows.filter((r) => r.entity_id).length;

  // Fork C bundle — flag check + card data in one round-trip.
  //
  // History note: previously deferred via requestIdleCallback (Phase 4) on
  // the assumption that cellular-bound users would benefit from the
  // primary deal block painting first. Real-world testing on WiFi
  // (2026-04-27) showed the trade-off inverts: requestIdleCallback on a
  // busy hydration page often doesn't fire until the 1500ms safety timeout,
  // which produces a *visible wave* — the Aion card pops in 1-2s after
  // everything else. Users perceived this as "loading in sections."
  //
  // Reverting to eager fetch on deal.id change. The Aion card can still
  // render its own skeleton internally if needed, but the FETCH starts
  // alongside everything else so it lands in the same coordinated paint
  // window. ~150-300ms slower first paint in exchange for one less wave —
  // worth it per User Advocate research ("never show intermediate states").
  useEffect(() => {
    if (!deal?.id) return;
    let cancelled = false;
    getAionCardBundle(deal.id)
      .then((b) => {
        if (!cancelled) setAionBundle(b);
      })
      .catch((err) => {
        // Surface failures rather than swallowing them — without the catch
        // the .then chain disappears silently when the action throws, leaving
        // the Aion slot empty and confusing the user. On error we keep
        // `enabled: true` so the defensive fallback in the JSX still renders
        // a quiet "watching" placeholder.
        // eslint-disable-next-line no-console
        console.error('[Aion bundle] failed to resolve', { dealId: deal.id, error: err });
        if (!cancelled) setAionBundle({ enabled: true, data: null });
      });
    return () => {
      cancelled = true;
    };
    // Refetch on status change too — the Aion card's voice and follow-up rows
    // depend on the deal's current stage. Without this, an override-to-won
    // leaves the card showing the previous stage's signals until reload.
  }, [deal?.id, deal?.status]);

  // Refetch the bundle on tab return / window focus so a user coming back
  // from the proposal builder sees the freshest signed status. Debounced so
  // rapid alt-tab cycles don't kick off duplicate fetches.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        queryClient.invalidateQueries({
          queryKey: ['deal-lens-bundle', deal.id, deal.event_id ?? null],
        });
      }, 250);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    const onFocus = () => refetch();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [deal.id, deal.event_id, queryClient]);

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
  // Phase 2d-3: once pipeline stages load, the tracker renders the workspace's
  // actual ordered working+won stages and currentStage is derived from slug /
  // tag lookups. Until then we fall back to the hardcoded 5-step visual.
  const trackerStages: string[] =
    pipelineStages && pipelineStages.length > 0
      ? pipelineStages.filter((s) => s.kind !== 'lost').map((s) => s.label)
      : [...DEAL_PIPELINE_STAGES_FALLBACK];

  const findStageIndexByTag = (tag: string): number => {
    if (!pipelineStages) return -1;
    const filtered = pipelineStages.filter((s) => s.kind !== 'lost');
    return filtered.findIndex((s) => s.tags?.includes(tag));
  };

  const dealStage = (() => {
    if (pipelineStages && pipelineStages.length > 0) {
      const filtered = pipelineStages.filter((s) => s.kind !== 'lost');
      const idx = filtered.findIndex((s) => s.slug === deal.status);
      return idx >= 0 ? idx : (STATUS_TO_STAGE_FALLBACK[deal.status] ?? 0);
    }
    return STATUS_TO_STAGE_FALLBACK[deal.status] ?? 0;
  })();

  const proposalImpliedStage = (() => {
    if (!initialProposal) return 0;
    if (pipelineStages && pipelineStages.length > 0) {
      // Tag-based lookup: accepted → contract_signed stage, sent/viewed →
      // proposal_sent stage, draft → also proposal_sent (stage the workspace
      // associates with "proposal out" work).
      if (proposalStatus === 'accepted') {
        const i = findStageIndexByTag('contract_signed');
        if (i >= 0) return i;
      }
      const i = findStageIndexByTag('proposal_sent');
      if (i >= 0) return i;
      return 0;
    }
    // Fallback ordinal mapping when pipeline stages are still loading.
    if (proposalStatus === 'accepted') return 3;
    if (proposalStatus === 'sent' || proposalStatus === 'viewed') return 2;
    return 1;
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
        onSaveScalar={handleHeaderSaveScalar}
        deal={deal}
        stakeholders={stakeholders}
        client={client ?? null}
        sourceOrgId={sourceOrgId}
        onStakeholdersChange={stakeholdersChangeHandler}
      />

      {/* Phase 3 §3.5 — Aion-authored deal narrative. Renders nothing until
          handoff seeds one or the user confirms an update_narrative draft. */}
      <DealNarrativeStrip dealId={deal.id} />

      {/* Position 2: Pipeline tracker — only hosts the legacy single-row
          suggestion when the unified Aion card is off. Flag ON lifts the
          Aion surface out into its own sibling panel (Position 2a below). */}
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
            stages={trackerStages}
          />
          {!(aionBundle.enabled && aionBundle.data) && (
            <div className="mt-4">
              <AionSuggestionRow dealId={deal.id} />
            </div>
          )}
        </StagePanel>
      </motion.div>

      {/* Position 2a: Aion card — a panel of its own when the beta is on.
          Sits between the pipeline tracker and the activity log so its
          primary read is "what Aion thinks about this deal," distinct from
          the factual pipeline state above.

          Renders as long as the flag is enabled, regardless of whether the
          resolver returned data. When data is null (rare — only when the
          deal/workspace check fails inside resolveAionCardForDeal), we
          fall back to AionFallbackCard with a generic "watching" message
          so the user sees Aion is here even on edge-case deals. */}
      {aionBundle.enabled && aionBundle.data && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_MEDIUM}
        >
          <AionDealCard
            data={aionBundle.data}
            dealTitle={deal.title}
            onAcceptAdvance={async (row) => {
              if (!row.suggestedStageTag) {
                toast.error('No target stage on this suggestion.');
                return;
              }
              const targetStage = pipelineStages?.find(
                (s) => Array.isArray(s.tags) && s.tags.includes(row.suggestedStageTag!),
              );
              if (!targetStage) {
                toast.error('Target stage not found in this pipeline.');
                return;
              }
              const result = await acceptAionCardAdvance(
                deal.id,
                row.insightId,
                targetStage.id,
              );
              if (!result.success) {
                toast.error(result.error ?? 'Could not move stage.');
                getAionCardBundle(deal.id).then(setAionBundle);
                return;
              }
              if (result.transitionId === null) {
                toast(`Already at ${targetStage.label}.`, { duration: 3000 });
                getAionCardBundle(deal.id).then(setAionBundle);
                return;
              }
              const priorStageId = result.priorStageId;
              toast(`Moved to ${targetStage.label}.`, {
                duration: 10_000,
                action: priorStageId
                  ? {
                      label: 'Undo',
                      onClick: async () => {
                        const revertResult = await revertAionCardAdvance(
                          deal.id,
                          priorStageId,
                        );
                        if (!revertResult.success) {
                          toast.error(revertResult.error ?? 'Could not undo.');
                          return;
                        }
                        toast.success('Reverted.');
                        getAionCardBundle(deal.id).then(setAionBundle);
                      },
                    }
                  : undefined,
              });
              getAionCardBundle(deal.id).then(setAionBundle);
            }}
            onDismissAdvance={async (row) => {
              const result = await dismissAionCardPipeline(deal.id, row.insightId);
              if (!result.success) {
                toast.error(result.error ?? 'Could not dismiss.');
                return;
              }
              getAionCardBundle(deal.id).then(setAionBundle);
            }}
            onDraftNudge={async (row) => {
              // Telemetry only — the card opens its own inline composer.
              await logAionCardEvent({
                action: 'draft_nudge',
                dealId: deal.id,
                cardVariant: aionBundle.data?.variant ?? 'outbound_only',
                source: 'deal_lens',
                followUpId: row.followUpId,
                insightId: row.linkedInsightId ?? undefined,
              });
              void emitCadenceAccuracyIfPersonalized('draft_nudge', deal.id, row.followUpId, aionBundle.data);
            }}
            onNudgeSubmitted={() => {
              getAionCardBundle(deal.id).then(setAionBundle);
              getDealTimeline(deal.id).then(setActivity).catch(() => {});
            }}
            onDismissNudge={async (row) => {
              const result = await dismissFollowUp(row.followUpId, 'other');
              if (!result.success) {
                toast.error(result.error ?? 'Could not dismiss.');
                return;
              }
              await logAionCardEvent({
                action: 'dismiss_nudge',
                dealId: deal.id,
                cardVariant: aionBundle.data?.variant ?? 'outbound_only',
                source: 'deal_lens',
                followUpId: row.followUpId,
              });
              void emitCadenceAccuracyIfPersonalized('dismiss_nudge', deal.id, row.followUpId, aionBundle.data);
              getAionCardBundle(deal.id).then(setAionBundle);
            }}
            onSnoozeNudge={async (row, days) => {
              const result = await snoozeFollowUp(row.followUpId, days);
              if (!result.success) {
                const msg = 'requireDecision' in result && result.requireDecision
                  ? result.message
                  : 'error' in result
                    ? result.error
                    : 'Could not snooze.';
                toast.error(msg ?? 'Could not snooze.');
                return;
              }
              await logAionCardEvent({
                action: 'snooze_nudge',
                dealId: deal.id,
                cardVariant: aionBundle.data?.variant ?? 'outbound_only',
                source: 'deal_lens',
                followUpId: row.followUpId,
              });
              void emitCadenceAccuracyIfPersonalized('snooze_nudge', deal.id, row.followUpId, aionBundle.data);
              toast.success(`Snoozed for ${days} ${days === 1 ? 'day' : 'days'}.`);
              getAionCardBundle(deal.id).then(setAionBundle);
            }}
          />
        </motion.div>
      )}

      {/* Defensive fallback: flag enabled but data resolution returned null.
          Rare in practice (only when the resolver hits an edge case in the
          deal/workspace check) but without it the user sees an unexplained
          empty space where the Aion card should be. */}
      {aionBundle.enabled && !aionBundle.data && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_MEDIUM}
        >
          <StagePanel elevated padding="md">
            <div className="flex items-center gap-3">
              <div
                className="size-2 rounded-full"
                style={{ background: 'var(--stage-text-tertiary)' }}
                aria-hidden
              />
              <span
                className="stage-label tracking-wide uppercase"
                style={{
                  fontSize: '11px',
                  color: 'var(--stage-text-tertiary)',
                }}
              >
                Aion
              </span>
              <span
                className="leading-snug italic"
                style={{
                  fontSize: '13px',
                  color: 'var(--stage-text-secondary)',
                }}
              >
                Watching this deal. I&apos;ll surface anything important as it develops.
              </span>
            </div>
          </StagePanel>
        </motion.div>
      )}

      {/* Position 2b: Timeline — unified stream from ops.deal_timeline_v
          (unions deal_activity_log trigger/system rows with follow_up_log
          engine rows). Base tables still back the Daily Brief readers and
          Aion dispatch writers. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated className="p-5">
          <p className="stage-label mb-4">Timeline</p>
          <DealActivitySection
            entries={activity}
            expanded={activityExpanded}
            onToggleExpanded={() => setActivityExpanded((v) => !v)}
          />
        </StagePanel>
      </motion.div>

      {/* Scalar pickers (date, archetype, budget) moved into DealHeaderStrip as portaled dropdowns */}


      {/* Follow-up card — flag ON: suppressed (the unified card above carries
          the Outbound rows). Flag OFF: legacy stall + follow-up affordance. */}
      {!isLocked && initialProposal !== undefined && !aionBundle.enabled && (
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

          {/* Shows list — visible only for series deals (is_series=true on the project).
              For singletons / multi-day this is a no-op render. */}
          <DealShowsList dealId={deal.id} isLocked={isLocked} />

          {/* Series-only affordance: apply first show's crew to all shows + persist template */}
          <SeriesCrewAffordance dealId={deal.id} isLocked={isLocked} />

          {/* Replies — client email/SMS threads scoped to this deal.
              Renders empty until the Phase 1 migrations land in the DB and
              the Resend inbound webhook starts writing ops.messages rows. */}
          <RepliesCard dealId={deal.id} readOnly={isLocked} />

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
          {/* Conflicts panel — Phase 2.1 Sprint 4 wired to live data via
              ops.feasibility_check_for_deal. Mark handled / Reopen persist
              through ops.set_deal_open_item_state. */}
          <ConflictsPanel dealId={deal.id} />
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
            onStakeholdersChange={stakeholdersChangeHandler}
            initialProposal={initialProposal}
            signals={signals}
          />

          {/* Next actions — flag ON: suppressed (absorbed by the unified
              Aion card at the top of Deal Lens). Flag OFF: legacy next-actions. */}
          {!aionBundle.enabled && (
            <NextActionsCard
              deal={deal}
              proposal={initialProposal}
              stakeholders={stakeholders}
              crewCount={crewCount}
              stage={pipelineStages?.find((s) => s.id === deal.stage_id) ?? null}
            />
          )}
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

