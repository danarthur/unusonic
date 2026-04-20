/**
 * Proposal Builder Studio — palette-first.
 *
 * The catalog sidebar is gone: adding a line item happens exclusively through
 * PackageSelectorPalette, which is embedded inside `<ProposalBuilder>`. This
 * shell is single-column, renders a persistent "+ Add from Catalog" affordance
 * at the top of the receipt, and wires a ⌘K / ⌃K accelerator for power users.
 * Row reorder lives inside `<ProposalBuilder>` on `@dnd-kit/sortable` (Phase 2).
 *
 * Design doc: docs/reference/proposal-builder-rebuild-design.md §3 Phase 2.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { ProposalBuilder } from '@/features/sales/ui/proposal-builder';
import { getProposalForDeal, revertProposalToDraft } from '@/features/sales/api/proposal-actions';
import { useProposalBuilderEvents } from '@/features/sales/lib/use-proposal-builder-events';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

/** Contact with email for proposal "Send to" picker. */
export type ProposalBuilderContact = { id: string; name: string; email: string };

type ProposalBuilderStudioProps = {
  deal: DealDetail;
  /** Contacts from the deal (stakeholders with email) for "Send to" picker. */
  contacts?: ProposalBuilderContact[];
  /** When true, Send is allowed (bill_to from deal_stakeholders or deal.organization_id). */
  clientAttached?: boolean;
};

/**
 * Named event on window that opens the ProposalBuilder's internal palette.
 * Kept here so the studio and ProposalBuilder don't need to prop-drill
 * a shared imperative handle just to handle ⌘K + the sticky trigger.
 */
export const PROPOSAL_BUILDER_OPEN_PALETTE_EVENT = 'proposal-builder:open-palette';

export function ProposalBuilderStudio({ deal, contacts = [], clientAttached: clientAttachedProp }: ProposalBuilderStudioProps) {
  const router = useRouter();
  const events = useProposalBuilderEvents({
    workspaceId: deal.workspace_id ?? null,
    dealId: deal.id,
    variant: 'palette',
  });

  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null>(null);
  const [reverting, setReverting] = useState(false);

  /** Locked = client has agreed, signed; additions require change order. */
  const isLocked = initialProposal?.status === 'accepted';

  const refetchProposal = useCallback(() => {
    getProposalForDeal(deal.id).then(setInitialProposal);
  }, [deal.id]);

  useEffect(() => {
    getProposalForDeal(deal.id).then(setInitialProposal);
  }, [deal.id]);

  // Session start: emit once per mount so we can compute time-to-first-add
  // in the kill-criteria dashboard.
  useEffect(() => {
    events.emit('session_start');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional single-shot on mount; re-firing on events identity change would inflate session_start counts
  }, []);

  // ⌘K / ⌃K opens the palette. On the proposal-builder route we override the
  // global `CommandSpine` ⌘K (which opens Aion's command palette) by listening
  // on the document *capture* phase and calling stopPropagation — the bubble
  // phase never reaches CommandSpine's document listener. Bail when the user
  // is typing in an editable surface so we don't steal focus mid-field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      if (isLocked) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true;
      if (isEditable) return;

      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent(PROPOSAL_BUILDER_OPEN_PALETTE_EVENT, { detail: { source: 'shortcut' } }),
      );
      events.emit('palette_open', { source: 'shortcut' });
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [events, isLocked]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {isLocked && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 stage-stripe-warning bg-[var(--stage-surface)] text-[var(--stage-text-secondary)] text-sm"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 shrink-0 text-[var(--color-unusonic-warning)]" aria-hidden />
            <span>Proposal locked (signed). Additions require a change order.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!initialProposal?.id || reverting) return;
              setReverting(true);
              const result = await revertProposalToDraft(initialProposal.id);
              setReverting(false);
              if (result.success) {
                refetchProposal();
                router.refresh();
              }
            }}
            disabled={reverting}
            className="shrink-0 stage-label text-[var(--color-unusonic-warning)] disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)] rounded px-2 py-1"
          >
            {reverting ? 'Reverting…' : 'Revert to draft'}
          </button>
        </motion.div>
      )}

      {/* No studio-level sub-header — the receipt card's own toolbar owns the
          "+ Add from catalog" button and the section label. Removing the
          duplicate tightens vertical rhythm and avoids two identical CTAs
          on the page. handleOpenPaletteFromButton is still used by the ⌘K
          handler above. */}
      <div className="flex-1 min-h-0 p-4 sm:p-6">
        {deal.workspace_id && (
          <ProposalBuilder
            dealId={deal.id}
            workspaceId={deal.workspace_id}
            initialProposal={initialProposal}
            contacts={contacts}
            onProposalRefetch={refetchProposal}
            onSaved={(_, __) => refetchProposal()}
            clientAttached={clientAttachedProp ?? !!(deal.organization_id || deal.main_contact_id)}
            readOnly={isLocked}
            dealTitle={deal.title ?? 'Untitled production'}
            dealEventStartTime={deal.event_start_time}
            dealEventEndTime={deal.event_end_time}
            proposedDate={deal.proposed_date}
            clientEntityId={deal.organization_id ?? deal.main_contact_id ?? null}
            className="w-full min-h-0 flex-1"
            onItemAdded={(source, payload) => events.emitAddSuccess(source, payload)}
            onRowReorder={events.emitRowReorder}
          />
        )}
      </div>
    </div>
  );
}
