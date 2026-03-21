'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileCheck, FileText, ExternalLink } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { PipelineTracker } from '@/features/sales/ui/pipeline-tracker';
import { ProposalBuilder } from '@/features/sales/ui/proposal-builder';
import { getProposalForDeal, getProposalPublicUrl } from '@/features/sales/api/proposal-actions';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { SIGNAL_PHYSICS, M3_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import { getContractForEvent } from '../actions/get-contract-for-event';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';
import { StakeholderGrid } from './stakeholder-grid';

const DEAL_PIPELINE_STAGES = ['Inquiry', 'Proposal', 'Contract sent', 'Won'] as const;
const STATUS_TO_STAGE: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
  won: 3,
  lost: 3,
};

export type DealLensProps = {
  deal: DealDetail;
  client?: DealClientContext | null;
  /** Stakeholders (Bill-To, Planner, Venue, Vendor) for this deal. */
  stakeholders?: DealStakeholderDisplay[];
  /** Current Network org id (for Add Connection OmniSearch). */
  sourceOrgId?: string | null;
  onHandover?: () => void;
  handingOver?: boolean;
  /** Called after linking a client or stakeholder so Prism can refetch. */
  onClientLinked?: () => void;
};

export function DealLens({ deal, client, stakeholders = [], sourceOrgId = null, onHandover, handingOver, onClientLinked }: DealLensProps) {
  const currentStage = STATUS_TO_STAGE[deal.status] ?? 0;
  const isLocked = !!deal.event_id;
  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null>(null);
  const [publicProposalUrl, setPublicProposalUrl] = useState<string | null>(null);
  const [contract, setContract] = useState<Awaited<ReturnType<typeof getContractForEvent>>>(null);

  useEffect(() => {
    let cancelled = false;
    getProposalForDeal(deal.id).then((p) => {
      if (!cancelled) setInitialProposal(p);
    });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  useEffect(() => {
    if (!deal.event_id) {
      setContract(null);
      return;
    }
    let cancelled = false;
    getContractForEvent(deal.event_id).then((c) => {
      if (!cancelled) setContract(c);
    });
    return () => {
      cancelled = true;
    };
  }, [deal.event_id]);

  // Refetch proposal when user returns to this tab (e.g. after sending from proposal builder)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        getProposalForDeal(deal.id).then(setInitialProposal);
        getProposalPublicUrl(deal.id).then(setPublicProposalUrl);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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
  const signedAt = (initialProposal as { accepted_at?: string } | null)?.accepted_at;
  const signedDate =
    signedAt &&
    new Date(signedAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 min-h-0"
      data-lens="deal"
    >
      {/* Stakeholder Map: Bill-To, Planner, Venue, Vendor + Add Connection */}
      <StakeholderGrid
        dealId={deal.id}
        sourceOrgId={sourceOrgId ?? null}
        stakeholders={stakeholders}
        client={client ?? null}
        onStakeholdersChange={onClientLinked ?? (() => {})}
        compact
      />

      {/* Pipeline — pinned to top */}
      <LiquidPanel className="p-6 rounded-[28px] shrink-0">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-4">
          Deal pipeline
        </p>
        <PipelineTracker
          currentStage={currentStage}
          stages={[...DEAL_PIPELINE_STAGES]}
        />
      </LiquidPanel>

      {/* When handed over: show Contract (signed) + View proposal CTA + inline receipt. */}
      {isLocked && deal.workspace_id ? (
        <div className="flex flex-col gap-6 flex-1 min-h-[200px]">
          {/* Contract + View signed proposal — primary CTA so user can always see what was signed */}
          <LiquidPanel className="p-6 rounded-[28px] border border-white/10">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl liquid-panel-nested border border-white/10 shrink-0">
                <FileCheck size={24} className="text-[var(--color-signal-success)]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1">
                  Contract
                </p>
                <h2 className="text-ceramic font-medium tracking-tight leading-none">
                  {contract?.status === 'signed' ? 'Signed by client' : 'Contract'}
                </h2>
                {contract?.signed_at && (
                  <p className="text-sm text-mercury mt-2">
                    Signed on{' '}
                    {new Date(contract.signed_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
                {contract?.pdf_url ? (
                  <a
                    href={contract.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-sm text-[var(--color-neon-blue)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
                  >
                    <ExternalLink size={16} aria-hidden />
                    View PDF
                  </a>
                ) : (
                  <p className="text-sm text-ink-muted mt-2">
                    The signed proposal is the contract record.
                  </p>
                )}
              </div>
            </div>
            {/* Primary CTA: view the signed proposal (same view the client saw) */}
            {publicProposalUrl ? (
              <div className="mt-5 pt-4 border-t border-white/10">
                <a
                  href={publicProposalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-levitation inline-flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start py-3 px-5 rounded-[28px] border border-white/10 font-medium text-sm tracking-tight bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-[28px]"
                >
                  <FileText size={18} aria-hidden />
                  View signed proposal
                </a>
              </div>
            ) : (
              <div className="mt-5 pt-4 border-t border-white/10">
                <p className="text-sm text-ink-muted">Loading proposal link…</p>
              </div>
            )}
          </LiquidPanel>

          {/* Inline proposal (read-only receipt) */}
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
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
        </div>
      ) : (
        <>
          {/* Bento grid: Proposal = hero (50% weight), Narrative + Numbers = support cells */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]">
            {/* Hero cell: Proposal — CTA to open proposal builder */}
            <motion.div
              variants={{ visible: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 8 } }}
              transition={SIGNAL_PHYSICS}
              className="md:col-span-2 md:row-span-2"
            >
              <LiquidPanel className="h-full p-6 rounded-[28px] flex flex-col border border-white/10">
                <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-2">
                  Proposal
                </p>
                <h2 className="text-[clamp(1.125rem,2.5vw,1.375rem)] font-medium text-ceramic tracking-tight leading-none mb-3">
                  {proposalSigned
                    ? 'Signed'
                    : proposalSent
                      ? 'Proposal sent'
                      : initialProposal
                        ? 'Continue editing'
                        : 'Build proposal'}
                </h2>
                <p className="text-ink-muted text-sm leading-relaxed mb-4 flex-1">
                  {proposalSigned
                    ? signedDate
                      ? `Signed on ${signedDate}. Proposal is locked; use a change order to add items.`
                      : 'Proposal is locked; use a change order to add items.'
                    : proposalSent
                      ? sentDate
                        ? `Sent on ${sentDate}. You can still edit and resend if the client needs changes.`
                        : 'You can still edit and resend if the client needs changes.'
                      : initialProposal
                        ? 'Your draft is saved. Open the proposal builder to continue editing and send to the client.'
                        : 'Open the proposal builder to hand over this deal, drag catalog items in, then send to the client.'}
                </p>
                <Link
                  href={`/crm/deal/${deal.id}/proposal-builder`}
                  className="liquid-levitation inline-flex items-center justify-center gap-2 py-3 px-5 rounded-[28px] border border-white/10 backdrop-blur-xl font-medium text-sm tracking-tight transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/20"
                >
                  {proposalSigned
                    ? 'View proposal'
                    : proposalSent
                      ? 'Open proposal'
                      : initialProposal
                        ? 'Continue editing'
                        : 'Build proposal'}
                </Link>
                {(proposalSent || proposalSigned) && (sentDate || signedDate) && (
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <p className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                      Record
                    </p>
                    <p className="text-sm text-ink-muted">
                      {proposalSigned && signedDate ? `Signed on ${signedDate}` : sentDate ? `Sent on ${sentDate}` : null}
                      {publicProposalUrl && (proposalSent || proposalSigned) && (
                        <>
                          {' · '}
                          <a
                            href={publicProposalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-neon-amber)] hover:brightness-110 underline break-all"
                          >
                            View shared link
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                )}
                {proposalSigned && !deal.event_id && onHandover && (
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <p className="text-sm text-ink-muted mb-3">
                      Hand over to production to unlock the Plan tab (run of show, crewing, logistics).
                    </p>
                    <motion.button
                      type="button"
                      onClick={onHandover}
                      disabled={handingOver}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SIGNAL_PHYSICS}
                      className="liquid-levitation w-full py-3 px-5 rounded-[28px] border border-white/10 backdrop-blur-xl font-medium text-sm tracking-tight transition-all hover:brightness-110 disabled:opacity-60 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] hover:bg-[var(--color-neon-blue)]/20"
                    >
                      {handingOver ? 'Handing over…' : 'Hand over to production'}
                    </motion.button>
                  </div>
                )}
                {deal.workspace_id ? (
                  <p className="mt-5 pt-4 border-t border-white/10 text-xs text-ink-muted leading-relaxed">
                    <Link
                      href="/catalog"
                      className="text-[var(--color-neon-amber)] hover:brightness-110 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] rounded"
                    >
                      Manage catalog
                    </Link>
                    <span className="text-ink-muted/80"> — add or edit packages to use in proposals.</span>
                  </p>
                ) : null}
              </LiquidPanel>
            </motion.div>
            {/* Support cell: Narrative */}
            <motion.div
              variants={{ visible: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 8 } }}
              transition={SIGNAL_PHYSICS}
            >
              <LiquidPanel className="h-full p-6 rounded-[28px] border border-white/10">
                <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-4">
                  Narrative
                </p>
                {deal.notes ? (
                  <p className="text-ink-muted text-sm leading-relaxed">{deal.notes}</p>
                ) : (
                  <p className="text-ink-muted/60 text-sm leading-relaxed">No notes yet.</p>
                )}
              </LiquidPanel>
            </motion.div>
            {/* Support cell: Numbers */}
            <motion.div
              variants={{ visible: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 8 } }}
              transition={SIGNAL_PHYSICS}
            >
              <LiquidPanel className="h-full p-6 rounded-[28px] border border-white/10">
                <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-4">
                  Numbers
                </p>
                <dl className="grid gap-3 text-sm leading-relaxed">
                  <div>
                    <dt className="text-ink-muted/80 text-xs uppercase tracking-wider">Proposed date</dt>
                    <dd className="text-ceramic font-medium tracking-tight mt-0.5">
                      {deal.proposed_date
                        ? new Date(deal.proposed_date).toLocaleDateString()
                        : '—'}
                    </dd>
                  </div>
                  {deal.event_archetype && (
                    <div>
                      <dt className="text-ink-muted/80 text-xs uppercase tracking-wider">Event type</dt>
                      <dd className="text-ceramic font-medium tracking-tight mt-0.5">{deal.event_archetype.replace(/_/g, ' ')}</dd>
                    </div>
                  )}
                  {deal.budget_estimated != null && (
                    <div>
                      <dt className="text-ink-muted/80 text-xs uppercase tracking-wider">Budget (est.)</dt>
                      <dd className="text-ceramic font-medium tracking-tight mt-0.5">
                        {Number(deal.budget_estimated).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </LiquidPanel>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}
