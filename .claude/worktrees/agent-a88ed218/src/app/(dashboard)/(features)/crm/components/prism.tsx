'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, FileText, ExternalLink } from 'lucide-react';
import { getDeal, getDealByEventId } from '../actions/get-deal';
import { getDealClientContext, type DealClientContext } from '../actions/get-deal-client';
import { getDealStakeholders } from '../actions/deal-stakeholders';
import { getEventSummaryForPrism } from '../actions/get-event-summary';
import { handoverDeal } from '../actions/handover-deal';
import { getProposalPublicUrl } from '@/features/sales/api/proposal-actions';
import { DealLens } from './deal-lens';
import { PlanLens } from './plan-lens';
import { LedgerLens } from './ledger-lens';
import { FrostedPlanLens } from './frosted-plan-lens';
import { SIGNAL_PHYSICS, M3_FADE_THROUGH_VARIANTS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealDetail } from '../actions/get-deal';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { StreamCardItem } from './stream-card';

export type PrismLens = 'deal' | 'plan' | 'ledger';

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
  const [linkedDeal, setLinkedDeal] = useState<DealDetail | null>(null);
  const [linkedProposalUrl, setLinkedProposalUrl] = useState<string | null>(null);
  const [linkedDealLoading, setLinkedDealLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmDebug = searchParams.get('crm_debug') === '1';

  const isDeal = selectedItem?.source === 'deal';
  const isEvent = selectedItem?.source === 'event';
  const dealInquiryOrProposal =
    isDeal && selectedItem?.status && ['inquiry', 'proposal'].includes(selectedItem.status);
  const planLocked = isDeal && dealInquiryOrProposal && !deal?.event_id;

  useEffect(() => {
    if (!selectedId || !selectedItem) {
      setDeal(null);
      setClient(null);
      setEventSummary(null);
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
      getEventSummaryForPrism(selectedId).then((e) => {
        setEventSummary(e);
        setDeal(null);
        setClient(null);
        setLoading(false);
        setLens('plan');
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

  const refetchDealAndClient = () => {
    if (!selectedId || selectedItem?.source !== 'deal') return;
    getDeal(selectedId).then((d) => setDeal(d ?? null));
    getDealClientContext(selectedId, sourceOrgId).then((c) => setClient(c ?? null));
    getDealStakeholders(selectedId).then((s) => setStakeholders(s ?? []));
    router.refresh();
  };

  const handleHandover = () => {
    if (!selectedId || !isDeal) return;
    startHandover(async () => {
      const result = await handoverDeal(selectedId);
      if (result.success) {
        handleHandoverSuccess(result.eventId);
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
      <div className="flex flex-col items-center justify-center flex-1 min-h-[320px] text-ink-muted">
        <p className="text-sm leading-relaxed">Select a production from the stream.</p>
      </div>
    );
  }
  if (!selectedItem) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[320px] text-ink-muted gap-3">
        <div className="h-8 w-8 rounded-xl bg-white/5 border border-white/10 animate-pulse" aria-hidden />
        <p className="text-sm leading-relaxed">Loading production…</p>
      </div>
    );
  }

  const title = selectedItem.title ?? 'Untitled Production';
  const subtitle = [selectedItem.client_name ?? 'Client', selectedItem.event_date ? new Date(selectedItem.event_date).toLocaleDateString() : null]
    .filter(Boolean)
    .join(' • ');
  const showHandover = isDeal && dealInquiryOrProposal && !deal?.event_id;

  const prismBorderColor =
    lens === 'deal' && !deal?.event_id ? 'var(--color-neon-amber)' : 'var(--color-neon-blue)';

  return (
    <motion.div
      className="flex flex-col h-full min-h-0 border-l-4"
      initial={false}
      animate={{
        borderLeftColor: handoverJustDone
          ? (['var(--color-neon-amber)', 'white', 'var(--color-neon-blue)'] as const)
          : prismBorderColor,
      }}
      transition={
        handoverJustDone
          ? { duration: 1.2, ease: 'easeInOut' as const }
          : { duration: 0.2 }
      }
    >
      {/* Prism header — liquid glass, refractive edge, identity + lens switcher */}
      <header
        className="shrink-0 flex flex-col gap-4 p-4 border-b border-white/10 backdrop-blur-xl"
        style={{ background: 'var(--color-glass-surface)' }}
      >
        <div className="flex items-center gap-3">
          {showBackToStream && (
            <motion.button
              type="button"
              onClick={onBackToStream}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="p-2 rounded-xl text-ink-muted hover:text-ceramic hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
              aria-label="Back to Stream"
            >
              <ChevronLeft size={20} aria-hidden />
            </motion.button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[clamp(1.25rem,3vw,1.5rem)] font-medium text-ceramic tracking-tight leading-none truncate">
              {title}
            </h2>
            <p className="text-sm text-ink-muted leading-relaxed truncate mt-1">{subtitle}</p>
          </div>
          {/* Pulse badge — health indicator, subtle */}
          <span
            className={cn(
              'shrink-0 h-2.5 w-2.5 rounded-full animate-pulse',
              planLocked ? 'bg-[var(--color-signal-warning)]' : 'bg-[var(--color-signal-success)]'
            )}
            aria-hidden
          />
        </div>

        <div
          className="flex rounded-[28px] overflow-hidden p-0.5 border border-white/10 backdrop-blur-xl"
          style={{ background: 'var(--color-glass-surface)' }}
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
            // Plan is always clickable for a deal so user can open it and hand over from FrostedPlanLens
            const disabled = tab.value === 'ledger' && !isEvent && !deal?.event_id;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={lens === tab.value}
                aria-disabled={disabled}
                onClick={() => !disabled && setLens(tab.value)}
                disabled={disabled}
                className={cn(
                  'px-4 py-2 text-sm font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] rounded-[22px]',
                  lens === tab.value
                    ? 'bg-obsidian/90 text-ceramic shadow-sm'
                    : disabled
                      ? 'text-ink-muted/50 cursor-not-allowed'
                      : 'text-ink-muted hover:text-ceramic'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {crmDebug && (
          <div
            className="mb-4 rounded-xl border border-[var(--color-neon-amber)]/40 bg-[var(--color-neon-amber)]/5 px-4 py-2 font-mono text-xs text-mercury"
            role="status"
            aria-label="CRM debug"
          >
            <span className="text-ink-muted">Prism:</span>{' '}
            selectedId={selectedId ?? '—'} | source={selectedItem?.source ?? '—'} | lens={lens} | loading={String(loading)} | deal={deal?.id ?? 'null'} | linkedDeal={linkedDeal?.id ?? 'null'}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
            <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 animate-pulse" aria-hidden />
            <p className="text-sm text-ink-muted leading-relaxed">Loading</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {lens === 'deal' && isDeal && (
              <motion.div
                key="deal"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SIGNAL_PHYSICS}
                className="min-h-[320px]"
              >
                {deal ? (
                  <DealLens
                    deal={deal}
                    client={client}
                    stakeholders={stakeholders}
                    sourceOrgId={sourceOrgId}
                    onHandover={showHandover ? handleHandover : undefined}
                    handingOver={handingOver}
                    onClientLinked={refetchDealAndClient}
                  />
                ) : (
                  <div className="liquid-card p-6 rounded-[28px] flex flex-col items-center justify-center min-h-[280px] gap-4 text-center">
                    <p className="text-ceramic font-medium tracking-tight">Deal could not be loaded</p>
                    <p className="text-sm text-mercury leading-relaxed">
                      The deal may have been removed or you may not have access. Try selecting another production from the stream.
                    </p>
                    <button
                      type="button"
                      onClick={() => refetchDealAndClient()}
                      className="liquid-levitation px-4 py-2 rounded-full text-sm font-medium text-ceramic border border-white/10 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
                transition={SIGNAL_PHYSICS}
                className="min-h-[320px]"
              >
                <div className="liquid-card p-6 rounded-[28px] border border-white/10 flex flex-col gap-6">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1">
                      Deal · event selected
                    </p>
                    {linkedDealLoading ? (
                      <p className="text-sm text-ink-muted leading-relaxed mt-2">
                        Checking for linked deal…
                      </p>
                    ) : linkedDeal ? (
                      <>
                        <h2 className="text-ceramic font-medium tracking-tight leading-tight mt-1">
                          {linkedDeal.title ?? 'Untitled deal'}
                        </h2>
                        <p className="text-sm text-ink-muted leading-relaxed mt-2 max-w-xl">
                          This event was handed over from the deal above. View the signed proposal or open the deal in the stream for the full Deal lens (stakeholders, pipeline, contract).
                        </p>
                        <div className="mt-5 pt-5 border-t border-white/10 flex flex-wrap items-center gap-3">
                          {linkedProposalUrl ? (
                            <a
                              href={linkedProposalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="liquid-levitation inline-flex items-center gap-2 py-3 px-5 rounded-[28px] border border-white/10 font-medium text-sm tracking-tight text-ceramic bg-[var(--color-neon-amber)]/15 hover:bg-[var(--color-neon-amber)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
                            >
                              <FileText size={18} className="text-[var(--color-neon-amber)]" aria-hidden />
                              View signed proposal
                            </a>
                          ) : (
                            <p className="text-sm text-ink-muted leading-relaxed">Loading proposal link…</p>
                          )}
                          <a
                            href={`/crm?stream=active&selected=${linkedDeal.id}`}
                            className="inline-flex items-center gap-2 py-3 px-5 rounded-[28px] text-sm font-medium tracking-tight text-ceramic border border-white/10 bg-transparent hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] transition-colors"
                          >
                            <ExternalLink size={16} className="text-ink-muted" aria-hidden />
                            Open deal in stream
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-ceramic font-medium tracking-tight leading-tight mt-1">
                          Event view
                        </h2>
                        <p className="text-sm text-ink-muted leading-relaxed mt-2 max-w-xl">
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
                initial={M3_FADE_THROUGH_VARIANTS.hidden}
                animate={M3_FADE_THROUGH_VARIANTS.visible}
                exit={M3_FADE_THROUGH_VARIANTS.hidden}
                transition={SIGNAL_PHYSICS}
              >
                {planLocked ? (
                  deal ? (
                    <FrostedPlanLens
                      dealId={selectedId}
                      deal={deal}
                      stakeholders={stakeholders}
                      onHandoverSuccess={handleHandoverSuccess}
                    />
                  ) : (
                    <div className="liquid-card p-6 rounded-[28px] text-ink-muted text-sm leading-relaxed">
                      Loading deal…
                    </div>
                  )
                ) : (isEvent && eventSummary) || (deal?.event_id && eventSummary) ? (
                  <PlanLens
                    eventId={isEvent ? selectedId : deal!.event_id!}
                    event={eventSummary}
                    onEventUpdated={async () => {
                      const id = isEvent ? selectedId : deal?.event_id;
                      if (id) {
                        const ev = await getEventSummaryForPrism(id);
                        setEventSummary(ev);
                      }
                    }}
                  />
                ) : (
                  <div className="liquid-card p-6 rounded-[28px] text-ink-muted text-sm leading-relaxed">
                    No event linked yet. Hand over the deal to unlock Plan.
                  </div>
                )}
              </motion.div>
            )}
            {lens === 'ledger' && (isEvent || deal?.event_id) && (
              <motion.div
                key="ledger"
                initial={M3_FADE_THROUGH_VARIANTS.hidden}
                animate={M3_FADE_THROUGH_VARIANTS.visible}
                exit={M3_FADE_THROUGH_VARIANTS.hidden}
                transition={SIGNAL_PHYSICS}
              >
                <LedgerLens
                  eventId={isEvent ? selectedId : deal!.event_id!}
                  eventTitle={selectedItem.title}
                />
              </motion.div>
            )}
            {lens === 'ledger' && !isEvent && !deal?.event_id && (
              <motion.div
                key="ledger-locked"
                initial={M3_FADE_THROUGH_VARIANTS.hidden}
                animate={M3_FADE_THROUGH_VARIANTS.visible}
                transition={SIGNAL_PHYSICS}
                className="liquid-card p-6 rounded-[28px] text-ink-muted text-sm leading-relaxed"
              >
                Ledger available after handover.
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
