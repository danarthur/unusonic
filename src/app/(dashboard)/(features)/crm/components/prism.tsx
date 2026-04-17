'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { SurfaceProvider, SURFACE_LEVEL } from '@/shared/ui/surface-context';
import { ChevronLeft, ChevronDown, Check, FileText, ExternalLink, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getDeal, getDealByEventId } from '../actions/get-deal';
import { getDealClientContext, type DealClientContext } from '../actions/get-deal-client';
import { getDealStakeholders } from '../actions/deal-stakeholders';
import { getEventSummaryForPrism } from '../actions/get-event-summary';
import { handoverDeal } from '../actions/handover-deal';
import { updateDealStatus, type DealStatus } from '../actions/update-deal-status';
import { getWorkspacePipelineStages, type WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { getProposalPublicUrl } from '@/features/sales/api/proposal-actions';
import { getEventLedger } from '@/features/finance/api/get-event-ledger';
import { MarkAsLostModal } from './mark-as-lost-modal';
import type { LostReason } from '../actions/get-deal';
import { DealLens } from './deal-lens';
import { PlanLens } from './plan-lens';
import { LedgerLens } from './ledger-lens';
import { STAGE_HEAVY, STAGE_MEDIUM, STAGE_LIGHT, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealDetail } from '../actions/get-deal';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { EventLedgerDTO } from '@/features/finance/api/get-event-ledger';
import type { StreamCardItem } from './stream-card';

export type PrismLens = 'deal' | 'plan' | 'ledger';

const DEAL_STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  contract_sent: 'Sent',
  contract_signed: 'Signed',
  deposit_received: 'Deposit received',
  won: 'Won',
  lost: 'Lost',
};

function dealStatusColor(s: string): string {
  if (s === 'won') return 'var(--color-unusonic-success)';
  if (s === 'lost') return 'var(--color-unusonic-error)';
  return 'var(--color-unusonic-warning)';
}

const OVERRIDE_STATUS_MESSAGES: Record<string, string> = {
  contract_signed: 'This bypasses the contract flow and marks the deal as signed manually.',
  deposit_received: 'This bypasses the payment flow and marks the deposit as received manually.',
  won: 'This marks the deal as won without the handoff wizard. No linked event will be created.',
};

function OverrideStatusConfirm({
  status,
  onConfirm,
  onCancel,
  submitting,
}: {
  status: string;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-[oklch(0.06_0_0/0.75)]"
        style={{ zIndex: 0 }}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm" style={{ zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={STAGE_HEAVY}
        >
          <div
            className="p-6 flex flex-col gap-4"
            style={{ background: 'var(--stage-surface-raised)', borderRadius: 'var(--stage-radius-panel, 12px)', boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 8px 32px oklch(0 0 0 / 0.6)' }}
          >
            <div>
              <p className="stage-label text-[var(--color-unusonic-warning)] mb-1.5">Manual override</p>
              <h2 className="stage-readout leading-snug">
                Set status to &ldquo;{DEAL_STATUS_LABELS[status] ?? status}&rdquo;?
              </h2>
            </div>
            <p className="stage-field-label leading-relaxed">
              {OVERRIDE_STATUS_MESSAGES[status]}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="flex-1 border border-[oklch(1_0_0_/_0.10)] py-2.5 text-sm font-medium text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] transition-colors focus:outline-none disabled:opacity-45"
                style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting}
                className="flex-1 border border-[var(--color-unusonic-warning)]/40 bg-[var(--color-unusonic-warning)]/10 py-2.5 text-sm font-medium text-[var(--color-unusonic-warning)] hover:bg-[var(--color-unusonic-warning)]/20 transition-colors focus:outline-none disabled:opacity-45 disabled:pointer-events-none"
                style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}
              >
                {submitting ? 'Saving…' : 'Override anyway'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

type PrismProps = {
  selectedId: string | null;
  selectedItem: StreamCardItem | null;
  onBackToStream: () => void;
  showBackToStream: boolean;
  /** Current Network org id (for client picker and relationshipId lookup). */
  sourceOrgId?: string | null;
};

export function Prism({
  selectedId,
  selectedItem,
  onBackToStream,
  showBackToStream,
  sourceOrgId = null,
}: PrismProps) {
  const [lens, setLens] = useState<PrismLens>('deal');
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [client, setClient] = useState<DealClientContext | null>(null);
  const [stakeholders, setStakeholders] = useState<Awaited<ReturnType<typeof getDealStakeholders>>>([]);
  const [eventSummary, setEventSummary] = useState<EventSummaryForPrism | null>(null);
  const [loading, setLoading] = useState(false);
  const [handingOver, startHandover] = useTransition();
  const [handoverJustDone, setHandoverJustDone] = useState(false);
  const [ledger, setLedger] = useState<EventLedgerDTO | null>(null);
  const [linkedDeal, setLinkedDeal] = useState<DealDetail | null>(null);
  const [linkedProposalUrl, setLinkedProposalUrl] = useState<string | null>(null);
  const [linkedDealLoading, setLinkedDealLoading] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [pendingOverrideStatus, setPendingOverrideStatus] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<WorkspacePipelineStage[] | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Phase 2b: fetch the workspace's pipeline stages once per session so the
  // dropdown renders the workspace-owned stage labels/flags instead of a
  // hardcoded constant. Fallback to the legacy hardcoded list while loading.
  useEffect(() => {
    let cancelled = false;
    getWorkspacePipelineStages().then((result) => {
      if (cancelled) return;
      setPipelineStages(result?.stages ?? []);
    }).catch(() => {
      if (!cancelled) setPipelineStages([]);
    });
    return () => { cancelled = true; };
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmDebug = searchParams.get('crm_debug') === '1';

  const isDeal = selectedItem?.source === 'deal';
  const isEvent = selectedItem?.source === 'event';
  const dealSignedOrDeposit =
    isDeal && selectedItem?.status && ['contract_signed', 'deposit_received', 'won'].includes(selectedItem.status);

  useEffect(() => {
    if (!selectedId || !selectedItem) {
      setDeal(null);
      setClient(null);
      setEventSummary(null);
      setLedger(null);
      setLinkedDeal(null);
      setLinkedProposalUrl(null);
      setLens('deal');
      return;
    }
    if (selectedItem.source === 'event') {
      setLinkedDeal(null);
      setLinkedProposalUrl(null);
    }
    setLoading(true);
    if (selectedItem.source === 'deal') {
      Promise.all([
        getDeal(selectedId),
        getDealClientContext(selectedId, sourceOrgId),
        getDealStakeholders(selectedId),
      ]).then(([d, c, s]) => {
        setDeal(d ?? null);
        setClient(c ?? null);
        setStakeholders(s ?? []);
        setEventSummary(null);
        setLoading(false);
        if (d?.event_id) {
          getEventSummaryForPrism(d.event_id).then(setEventSummary);
        }
        setLens(d?.event_id ? 'plan' : 'deal');
      });
    } else {
      // Event card: fetch event summary AND linked deal in parallel
      Promise.all([
        getEventSummaryForPrism(selectedId),
        getDealByEventId(selectedId),
      ]).then(([e, d]) => {
        setEventSummary(e);
        setDeal(d ?? null);
        setClient(null);
        setLoading(false);
        setLens('plan');
        // Fetch stakeholders if we found a linked deal
        if (d?.id) {
          getDealStakeholders(d.id).then((s) => setStakeholders(s ?? []));
          getDealClientContext(d.id, sourceOrgId).then((c) => setClient(c ?? null));
        }
      });
    }
  }, [selectedId, selectedItem?.source, sourceOrgId]);

  // When viewing an event and user opens Deal tab, resolve linked deal (deal.event_id = this event) for contract/signed proposal
  useEffect(() => {
    if (!selectedId || !isEvent) {
      setLinkedDeal(null);
      setLinkedProposalUrl(null);
      setLinkedDealLoading(false);
      return;
    }
    setLinkedDealLoading(true);
    setLinkedDeal(null);
    setLinkedProposalUrl(null);
    let cancelled = false;
    getDealByEventId(selectedId).then((d) => {
      if (cancelled) return;
      setLinkedDeal(d ?? null);
      setLinkedDealLoading(false);
      if (d?.id) {
        getProposalPublicUrl(d.id).then((url) => {
          if (!cancelled) setLinkedProposalUrl(url);
        });
      } else {
        setLinkedProposalUrl(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, isEvent]);

  // Fetch ledger data when the ledger lens is active and an eventId is known
  const ledgerEventId = isEvent ? selectedId : deal?.event_id ?? null;
  useEffect(() => {
    if (lens !== 'ledger' || !ledgerEventId) {
      return;
    }
    let cancelled = false;
    getEventLedger(ledgerEventId).then((l) => {
      if (!cancelled) setLedger(l ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [lens, ledgerEventId]);

  const refetchDealAndClient = () => {
    if (!selectedId || selectedItem?.source !== 'deal') return;
    getDeal(selectedId).then((d) => setDeal(d ?? null));
    getDealClientContext(selectedId, sourceOrgId).then((c) => setClient(c ?? null));
    getDealStakeholders(selectedId).then((s) => setStakeholders(s ?? []));
    router.refresh();
  };

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!statusDropdownRef.current?.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropdownOpen]);

  const handleStatusChange = async (status: string) => {
    if (!deal) return;
    setStatusDropdownOpen(false);
    setStatusChanging(true);
    // Cast is safe: Phase 2b stage slugs are still the legacy seven. Phase 2d
    // stage CRUD will widen updateDealStatus's accepted set.
    const result = await updateDealStatus(deal.id, status as DealStatus);
    setStatusChanging(false);
    if (result.success) {
      setDeal((prev) => prev ? { ...prev, status } : prev);
      router.refresh();
    } else {
      toast.error(result.error ?? 'Failed to update status');
    }
  };

  const handleMarkAsLost = async (reason: LostReason, competitorName: string | null) => {
    if (!deal) return;
    const result = await updateDealStatus(deal.id, 'lost', { lost_reason: reason, lost_to_competitor_name: competitorName });
    if (result.success) {
      setLostModalOpen(false);
      setDeal((prev) => prev ? { ...prev, status: 'lost' } : prev);
      router.refresh();
    } else {
      toast.error(result.error ?? 'Failed to mark deal as lost');
    }
  };

  const handleOverrideConfirm = async () => {
    if (!deal || !pendingOverrideStatus) return;
    setStatusChanging(true);
    const result = await updateDealStatus(
      deal.id,
      pendingOverrideStatus as 'contract_signed' | 'deposit_received' | 'won',
      undefined,
      true
    );
    setStatusChanging(false);
    if (result.success) {
      setPendingOverrideStatus(null);
      setDeal((prev) => prev ? { ...prev, status: pendingOverrideStatus } : prev);
      router.refresh();
    } else {
      toast.error(result.error ?? 'Failed to update status');
    }
  };

  const handleHandover = () => {
    if (!selectedId || !isDeal) return;
    startHandover(async () => {
      const result = await handoverDeal(selectedId);
      if (result.success) {
        handleHandoverSuccess(result.eventId);
      } else {
        toast.error(result.error ?? 'Failed to hand over deal');
      }
    });
  };

  /** Shared success path: refetch deal + event summary, run border animation, switch to Plan lens. Used after direct handover (Deal tab) or after HandoffWizard completes. */
  const handleHandoverSuccess = async (eventId: string) => {
    setHandoverJustDone(true);
    const [updatedDeal, ev] = await Promise.all([
      getDeal(selectedId!),
      getEventSummaryForPrism(eventId),
    ]);
    setDeal(updatedDeal ?? null);
    setEventSummary(ev);
    router.refresh();
    const lensSwitchTimer = setTimeout(() => setLens('plan'), 500);
    setTimeout(() => {
      clearTimeout(lensSwitchTimer);
      setHandoverJustDone(false);
    }, 1200);
  };

  if (!selectedId) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[320px] text-[var(--stage-text-secondary)]">
        <p className="stage-field-label leading-relaxed">Select a production from the stream.</p>
      </div>
    );
  }
  if (!selectedItem) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[320px] text-[var(--stage-text-secondary)] gap-3">
        <div className="h-8 w-8 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.10)] stage-skeleton" style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }} aria-hidden />
        <p className="stage-field-label leading-relaxed">Loading production…</p>
      </div>
    );
  }

  const title = selectedItem.title ?? 'Untitled production';
  const subtitle = [selectedItem.client_name ?? 'Client', selectedItem.event_date ? new Date(selectedItem.event_date + 'T00:00:00').toLocaleDateString() : null]
    .filter(Boolean)
    .join(' • ');
  const showHandover = isDeal && dealSignedOrDeposit && !deal?.event_id;

  return (
    <>
    <motion.div
      className="flex flex-col flex-1 min-h-0"
      initial={false}
      animate={{
        borderLeftColor: handoverJustDone
          ? (['var(--color-unusonic-warning)', 'white', 'var(--color-unusonic-success)'] as const)
          : 'var(--stage-edge-subtle, oklch(1 0 0 / 0.03))',
      }}
      style={{ borderLeftWidth: handoverJustDone ? 4 : 1, borderLeftStyle: 'solid' }}
      transition={
        handoverJustDone
          ? { duration: 1.2, ease: 'easeInOut' as const }
          : { duration: 0.2 }
      }
    >
      {/* Prism header — stage surface, identity + lens switcher */}
      <header
        className="shrink-0 flex flex-col gap-4 p-4 border-b border-[var(--stage-edge-subtle,oklch(1_0_0/0.03))] relative z-10"
        style={{ background: 'var(--stage-surface)' }}
      >
        <div className="flex items-center gap-3">
          {showBackToStream && (
            <motion.button
              type="button"
              onClick={onBackToStream}
              transition={STAGE_LIGHT}
              className="p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              style={{ color: 'var(--stage-text-secondary)', borderRadius: 'var(--stage-radius-input, 6px)' }}
              aria-label="Back to Stream"
            >
              <ChevronLeft size={20} aria-hidden />
            </motion.button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="stage-readout-lg leading-none truncate">
              {title}
            </h2>
            <p className="stage-label leading-relaxed truncate mt-1">{subtitle}</p>
          </div>
          {/* Status indicator — clickable pill for deals, health dot for events */}
          {isDeal && deal?.status ? (
            <div className="relative shrink-0" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen((v) => !v)}
                disabled={statusChanging}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                style={{
                  color: dealStatusColor(deal.status),
                  backgroundColor: `color-mix(in oklch, ${dealStatusColor(deal.status)} 12%, transparent)`,
                  borderColor: `color-mix(in oklch, ${dealStatusColor(deal.status)} 20%, transparent)`,
                }}
                aria-label="Change deal status"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: dealStatusColor(deal.status) }}
                />
                <span className="stage-label whitespace-nowrap">
                  {DEAL_STATUS_LABELS[deal.status] ?? deal.status}
                </span>
                <ChevronDown size={10} className="ml-0.5 text-[var(--stage-text-secondary)]" />
              </button>

              <AnimatePresence>
                {statusDropdownOpen && (
                  <>
                  {/* Absorbs pointer events so nothing behind the dropdown is hoverable */}
                  <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setStatusDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={STAGE_LIGHT}
                    className="absolute right-0 top-full mt-1.5 z-50 w-48 overflow-hidden py-1"
                    style={{
                      background: 'var(--stage-surface-raised)',
                      borderRadius: 'var(--stage-radius-panel, 12px)',
                      boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
                    }}
                  >
                    {(() => {
                      // Fallback to the legacy hardcoded list until the workspace
                      // stages load (preserves the three-group UX exactly).
                      const working = pipelineStages
                        ? pipelineStages.filter((s) => s.kind === 'working')
                        : [
                            { slug: 'inquiry', label: 'Inquiry', requires_confirmation: false },
                            { slug: 'proposal', label: 'Proposal', requires_confirmation: false },
                            { slug: 'contract_sent', label: 'Sent', requires_confirmation: false },
                            { slug: 'contract_signed', label: 'Signed', requires_confirmation: true },
                            { slug: 'deposit_received', label: 'Deposit received', requires_confirmation: true },
                          ] as const;
                      const normal = working.filter((s) => !s.requires_confirmation);
                      const override = working.filter((s) => s.requires_confirmation);
                      const wonStage = pipelineStages?.find((s) => s.kind === 'won') ?? { slug: 'won', label: 'Won', requires_confirmation: true };
                      const lostStage = pipelineStages?.find((s) => s.kind === 'lost') ?? { slug: 'lost', label: 'Lost' };
                      return (
                        <>
                          {normal.map((s) => (
                            <button
                              key={s.slug}
                              type="button"
                              onClick={() => handleStatusChange(s.slug as DealStatus)}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors hover:bg-[var(--stage-accent-muted)] focus:outline-none"
                            >
                              <span className="flex-1 tracking-tight text-[var(--stage-text-primary)]">{s.label}</span>
                              {deal.status === s.slug && <Check size={11} className="shrink-0" style={{ color: 'var(--stage-text-primary)' }} />}
                            </button>
                          ))}
                          <div className="mx-3 border-t border-[oklch(1_0_0_/_0.06)] my-1" />
                          {/* Override stages — bypass system flows with confirmation */}
                          {override.map((s) => (
                            <button
                              key={s.slug}
                              type="button"
                              onClick={() => { setStatusDropdownOpen(false); setPendingOverrideStatus(s.slug); }}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors hover:bg-[var(--stage-accent-muted)] focus:outline-none"
                            >
                              <span className="flex-1 tracking-tight text-[var(--stage-text-secondary)]">{s.label}</span>
                              {deal.status === s.slug
                                ? <Check size={11} className="shrink-0" style={{ color: 'var(--stage-text-primary)' }} />
                                : <span className="stage-micro shrink-0">override</span>
                              }
                            </button>
                          ))}
                          <button
                            key={wonStage.slug}
                            type="button"
                            onClick={() => { setStatusDropdownOpen(false); setPendingOverrideStatus(wonStage.slug); }}
                            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors hover:bg-[var(--stage-accent-muted)] focus:outline-none"
                          >
                            <span className="flex-1 tracking-tight text-[var(--stage-text-secondary)]">{wonStage.label}</span>
                            {deal.status === wonStage.slug
                              ? <Check size={11} className="shrink-0" style={{ color: 'var(--stage-text-primary)' }} />
                              : <span className="stage-micro shrink-0">override</span>
                            }
                          </button>
                          <div className="mx-3 border-t border-[oklch(1_0_0_/_0.06)] my-1" />
                          <button
                            type="button"
                            onClick={() => { setStatusDropdownOpen(false); setLostModalOpen(true); }}
                            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors hover:bg-[var(--color-unusonic-error)]/5 focus:outline-none"
                          >
                            <span className="flex-1 tracking-tight text-[var(--color-unusonic-error)]">{lostStage.label}</span>
                            {deal.status === lostStage.slug && <Check size={11} className="text-[var(--color-unusonic-error)] shrink-0" />}
                          </button>
                        </>
                      );
                    })()}
                  </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <span
              className="shrink-0 h-2.5 w-2.5 rounded-full bg-[var(--color-unusonic-success)]"
              aria-hidden
            />
          )}
        </div>

        {/* Prism Lens: filled-pill style toggle — switching perspective on the selected item.
            Active lens has a sliding filled accent indicator behind it, like a mode selector on an instrument. */}
        <div
          className="relative flex p-1"
          style={{
            background: 'var(--stage-surface-elevated)',
            borderRadius: 'var(--stage-radius-nested, 8px)',
            border: '1px solid var(--stage-edge-subtle)',
          }}
          role="tablist"
          aria-label="Lens"
        >
          {(
            [
              { value: 'deal' as const, label: 'Deal' },
              { value: 'plan' as const, label: 'Plan' },
              { value: 'ledger' as const, label: 'Ledger' },
            ] as const
          ).map((tab) => {
            const disabled = tab.value === 'ledger' && !isEvent && !deal?.event_id;
            const isActive = lens === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-disabled={disabled}
                onClick={() => !disabled && setLens(tab.value)}
                disabled={disabled}
                className={cn(
                  'relative z-10 px-4 py-1.5 stage-label transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                  isActive
                    ? 'text-[var(--stage-text-on-accent)]'
                    : disabled
                      ? 'text-[var(--stage-text-tertiary)] cursor-not-allowed'
                      : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                )}
                style={{ borderRadius: 'calc(var(--stage-radius-nested, 8px) - 2px)' }}
              >
                {/* Sliding filled indicator — accent background on active lens */}
                {isActive && (
                  <motion.div
                    layoutId="prism-lens-indicator"
                    className="absolute inset-0"
                    style={{
                      background: 'var(--stage-accent)',
                      borderRadius: 'calc(var(--stage-radius-nested, 8px) - 2px)',
                    }}
                    transition={STAGE_LIGHT}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <SurfaceProvider level={SURFACE_LEVEL.void}>
      <div className="flex-1 min-h-0 overflow-y-auto p-6" style={{ background: 'var(--stage-void)' }} data-surface="void">
        {/* Handover banner — visible across all tabs */}
        <AnimatePresence mode="wait">
          {showHandover && !handoverJustDone && (
            <motion.div
              key="handover-banner"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_MEDIUM}
              className="mb-6 stage-panel-elevated p-5 border border-[oklch(1_0_0_/_0.10)] flex items-center justify-between gap-4 flex-wrap"
              style={{ borderRadius: 'var(--stage-radius-panel)' }}
            >
              <div className="min-w-0">
                <p className="stage-readout">
                  Contract signed — ready for production
                </p>
                <p className="stage-badge-text text-[var(--stage-text-secondary)] mt-0.5">
                  Hand over to access run of show, crewing, and logistics.
                </p>
              </div>
              <button
                type="button"
                onClick={handleHandover}
                disabled={handingOver}
                className="stage-btn stage-btn-primary shrink-0 flex items-center gap-2 disabled:opacity-45 disabled:pointer-events-none"
              >
                {handingOver ? 'Handing over…' : 'Hand over to production'}
                {!handingOver && <ArrowRight size={16} aria-hidden />}
              </button>
            </motion.div>
          )}
          {handoverJustDone && (
            <motion.div
              key="handover-success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_MEDIUM}
              className="mb-6 p-4 flex items-center gap-3 border border-[oklch(1_0_0_/_0.08)] border-l-[3px] border-l-[var(--color-unusonic-success)]"
              style={{
                borderRadius: 'var(--stage-radius-panel)',
                background: 'var(--stage-surface)',
              }}
            >
              <CheckCircle2 size={18} className="text-[var(--color-unusonic-success)] shrink-0" aria-hidden />
              <p className="stage-readout-sm">
                Handed over — Plan tab is now live.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {crmDebug && (
          <div
            className="mb-4 px-4 py-2 font-mono text-xs"
            style={{ borderRadius: 'var(--stage-radius-input, 6px)', background: 'var(--stage-surface)', border: '1px solid var(--stage-edge-subtle)', color: 'var(--stage-text-secondary)' }}
            role="status"
            aria-label="CRM debug"
          >
            <span className="text-[var(--stage-text-secondary)]">Prism:</span>{' '}
            selectedId={selectedId ?? '—'} | source={selectedItem?.source ?? '—'} | lens={lens} | loading={String(loading)} | deal={deal?.id ?? 'null'} | linkedDeal={linkedDeal?.id ?? 'null'}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
            <div className="h-10 w-10 stage-skeleton" style={{ background: 'var(--stage-surface)', borderRadius: 'var(--stage-radius-nested, 8px)' }} aria-hidden />
            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">Loading...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {lens === 'deal' && isDeal && (
              <motion.div
                key="deal"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="min-h-[320px]"
              >
                {deal ? (
                  <DealLens
                    deal={deal}
                    client={client}
                    stakeholders={stakeholders}
                    sourceOrgId={sourceOrgId}
                    onClientLinked={refetchDealAndClient}
                  />
                ) : (
                  <div className="stage-panel-elevated p-6 flex flex-col items-center justify-center min-h-[280px] gap-4 text-center">
                    <p className="text-[var(--stage-text-primary)] font-medium tracking-tight">Deal could not be loaded</p>
                    <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                      The deal may have been removed or you may not have access. Try selecting another production from the stream.
                    </p>
                    <button
                      type="button"
                      onClick={() => refetchDealAndClient()}
                      className="px-4 py-2 rounded-full text-sm font-medium text-[var(--stage-text-primary)] bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[var(--stage-surface-raised)] transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </motion.div>
            )}
            {lens === 'deal' && !isDeal && (
              <motion.div
                key="deal-event"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="min-h-[320px]"
              >
                <div className="stage-panel-elevated p-6 flex flex-col gap-6">
                  <div>
                    <p className="stage-label mb-1">
                      Deal · event selected
                    </p>
                    {linkedDealLoading ? (
                      <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-2">
                        Checking for linked deal…
                      </p>
                    ) : linkedDeal ? (
                      <>
                        <h2 className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-tight mt-1">
                          {linkedDeal.title ?? 'Untitled deal'}
                        </h2>
                        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-2 max-w-xl">
                          This event was handed over from the deal above. View the signed proposal or open the deal in the stream for the full Deal lens (stakeholders, pipeline, contract).
                        </p>
                        <div className="mt-5 pt-5 border-t border-[oklch(1_0_0_/_0.10)] flex flex-wrap items-center gap-3">
                          {linkedProposalUrl ? (
                            <a
                              href={linkedProposalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="stage-btn stage-btn-secondary inline-flex items-center gap-2"
                            >
                              <FileText size={18} aria-hidden />
                              View signed proposal
                            </a>
                          ) : (
                            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">Loading proposal link…</p>
                          )}
                          <a
                            href={`/crm?stream=active&selected=${linkedDeal.id}`}
                            className="inline-flex items-center gap-2 py-3 px-5 text-sm font-medium tracking-tight text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.10)] bg-transparent hover:bg-[var(--stage-accent-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)] transition-colors"
                            style={{ borderRadius: 'var(--stage-radius-panel)' }}
                          >
                            <ExternalLink size={16} className="text-[var(--stage-text-secondary)]" aria-hidden />
                            Open deal in stream
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-tight mt-1">
                          Event view
                        </h2>
                        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-2 max-w-xl">
                          The Deal tab shows contract and signed proposal for deals. Select a deal from the stream (Inquiry or Active) to see its Deal lens.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            {lens === 'plan' && (
              <motion.div
                key="plan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_NAV_CROSSFADE}
              >
                <PlanLens
                  eventId={isEvent ? selectedId : (deal?.event_id ?? null)}
                  dealId={deal?.id ?? linkedDeal?.id ?? eventSummary?.deal_id ?? null}
                  event={eventSummary ?? null}
                  deal={deal ?? linkedDeal ?? null}
                  client={client}
                  stakeholders={stakeholders}
                  sourceOrgId={sourceOrgId}
                  onEventUpdated={async () => {
                    const id = isEvent ? selectedId : deal?.event_id;
                    if (id) {
                      const ev = await getEventSummaryForPrism(id);
                      setEventSummary(ev);
                    }
                  }}
                  onHandoverSuccess={handleHandoverSuccess}
                  onStakeholdersChange={refetchDealAndClient}
                  onDealUpdated={refetchDealAndClient}
                />
              </motion.div>
            )}
            {lens === 'ledger' && (isEvent || deal?.event_id) && (
              <motion.div
                key="ledger"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_NAV_CROSSFADE}
              >
                <LedgerLens
                  eventId={isEvent ? selectedId : deal!.event_id!}
                  ledger={ledger}
                />
              </motion.div>
            )}
            {lens === 'ledger' && !isEvent && !deal?.event_id && (
              <motion.div
                key="ledger-locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={STAGE_NAV_CROSSFADE}
                className="stage-panel-elevated p-6 text-[var(--stage-text-secondary)] text-sm leading-relaxed"
              >
                Ledger available after handover.
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      </SurfaceProvider>
    </motion.div>

    <MarkAsLostModal
      open={lostModalOpen}
      onClose={() => setLostModalOpen(false)}
      onConfirm={handleMarkAsLost}
    />
    {pendingOverrideStatus && (
      <OverrideStatusConfirm
        status={pendingOverrideStatus}
        onConfirm={handleOverrideConfirm}
        onCancel={() => setPendingOverrideStatus(null)}
        submitting={statusChanging}
      />
    )}
    </>
  );
}
