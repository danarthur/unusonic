'use client';

/**
 * ProposalBuilderSidebar + RailTabButton — docked sidebar for the studio.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 *
 * Holds the Catalog picker, Line Inspector, and Team picker as tab-switched
 * views. Animates width 0 ↔ SIDEBAR_WIDTH; open/closed state persists in
 * localStorage at the parent level.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeftClose } from 'lucide-react';
import { toast } from 'sonner';

import {
  addPackageToProposal,
  deleteProposalItem,
  deleteProposalItemsByPackageInstanceId,
} from '@/features/sales/api/proposal-actions';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type {
  DealCrewRow,
  CrewSearchResult,
} from '../../actions/deal-crew';
import type { ProposalWithItems } from '@/features/sales/model/types';
import type { DemoBlock } from './types';
import { TeamPicker } from './team-picker';
import { LineInspector, FinancialInspector } from './inspectors';
import { CatalogPicker } from './catalog-picker';

const SIDEBAR_WIDTH = 340;

// ---------------------------------------------------------------------------
// ProposalBuilderSidebar — docked sidebar attached to the main app nav, like
// the Aion chat-history sidebar. Holds the Catalog picker and Line Inspector
// as tab-switched views. Animates width 0↔SIDEBAR_WIDTH; state persists in
// localStorage.
// ---------------------------------------------------------------------------

type RailTab = 'catalog' | 'inspector' | 'team';

export function ProposalBuilderSidebar({
  isOpen,
  onToggle,
  scopeBlocks,
  selectedBlockIdx,
  onSelectBlock,
  subtotal,
  tax,
  total,
  taxRate,
  workspaceId,
  dealId,
  proposalId,
  forceDemo,
  insertAfterSortOrder,
  onItemAdded,
  onRefetchProposal,
  onClearSelection,
  dealCrew,
  roster,
  onRefetchCrew,
  isRequiredRole,
  totalCost,
  costKnown,
  proposal,
}: {
  isOpen: boolean;
  onToggle: () => void;
  scopeBlocks: DemoBlock[];
  selectedBlockIdx: number | null;
  onSelectBlock: (idx: number) => void;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  workspaceId: string | null;
  dealId: string;
  proposalId: string | null;
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
  onRefetchProposal: () => void;
  onClearSelection: () => void;
  dealCrew: DealCrewRow[];
  roster: CrewSearchResult[];
  onRefetchCrew: () => void;
  isRequiredRole: (catalogItemId: string, roleNote: string) => boolean;
  totalCost: number;
  costKnown: boolean;
  proposal: ProposalWithItems | null;
}) {
  const [tab, setTab] = useState<RailTab>('catalog');
  // When LineInspector's "Assign" button is clicked for a specific role, we
  // jump to the Team tab and keep the role in context so the click handler
  // there knows which slot it's trying to fill.
  const [teamRoleFocus, setTeamRoleFocus] = useState<string | null>(null);

  // Swap mode — captured when the PM clicks Swap on a selected line. Flips
  // the Catalog tab into a "pick a replacement" state; the next catalog click
  // deletes the original and inserts the new row at the same sort_order.
  type SwapTarget = {
    itemId: string;
    title: string;
    sortOrder: number;
    packageInstanceId: string | null;
    isHeader: boolean;
  };
  const [swap, setSwap] = useState<SwapTarget | null>(null);

  // When the user clicks a scope row to select it, jump to the Inspector tab
  // so the line details are immediately visible. When they deselect, leave the
  // tab where it is — the Financial overview takes over without moving them.
  useEffect(() => {
    if (selectedBlockIdx != null) setTab('inspector');
  }, [selectedBlockIdx]);

  // Clear the role focus when the user leaves the Team tab — the focus is
  // an ephemeral hand-off from LineInspector, not a sticky filter.
  useEffect(() => {
    if (tab !== 'team') setTeamRoleFocus(null);
  }, [tab]);

  // Leaving the Catalog tab while in swap mode cancels the swap — users should
  // see the banner the whole time they're picking a replacement.
  useEffect(() => {
    if (tab !== 'catalog') setSwap(null);
  }, [tab]);

  const selectedBlock =
    selectedBlockIdx != null ? scopeBlocks[selectedBlockIdx] : undefined;

  const handleAssignRoleFromInspector = useCallback((role: string) => {
    setTeamRoleFocus(role);
    setTab('team');
  }, []);

  const handleEnterSwap = useCallback((target: SwapTarget) => {
    setSwap(target);
    setTab('catalog');
  }, []);

  // When a catalog item is clicked while in swap mode, we delete the target
  // and reuse insertAfterSortOrder on addPackageToProposal so the new row
  // lands where the old one was. Returned from the sidebar so CatalogPicker
  // can defer its click handling.
  const handleSwapPick = useCallback(
    async (newPackageId: string) => {
      if (!swap || !proposalId) return;
      try {
        if (swap.isHeader && swap.packageInstanceId) {
          await deleteProposalItemsByPackageInstanceId(proposalId, swap.packageInstanceId);
        } else {
          await deleteProposalItem(swap.itemId);
        }
        await addPackageToProposal(dealId, newPackageId, swap.sortOrder - 1);
        toast.success('Swapped line item');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Swap failed');
        return;
      } finally {
        setSwap(null);
        onClearSelection();
      }
      onItemAdded();
    },
    [swap, proposalId, dealId, onItemAdded, onClearSelection],
  );

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {/* Mobile backdrop — clicking it closes the sidebar. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40 bg-[oklch(0.06_0_0/0.75)] lg:hidden"
            onClick={onToggle}
            aria-hidden
          />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="shrink-0 overflow-hidden h-full fixed lg:relative z-50 lg:z-auto"
            data-surface="surface"
          >
            <div
              className="flex flex-col h-full bg-[var(--stage-surface)] border-r border-[var(--stage-edge-subtle)]"
              style={{ width: SIDEBAR_WIDTH }}
            >
              {/* Header — label + close button */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3">
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  Build tools
                </span>
                <button
                  type="button"
                  onClick={onToggle}
                  className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  aria-label="Close build tools"
                >
                  <PanelLeftClose size={15} strokeWidth={1.5} />
                </button>
              </div>

              {/* Tab switcher */}
              <div className="shrink-0 px-3 pb-3">
                <div className="inline-flex items-center p-0.5 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)]">
                  <RailTabButton
                    label="Catalog"
                    active={tab === 'catalog'}
                    onClick={() => setTab('catalog')}
                  />
                  <RailTabButton
                    label="Inspector"
                    active={tab === 'inspector'}
                    onClick={() => setTab('inspector')}
                  />
                  <RailTabButton
                    label="Team"
                    active={tab === 'team'}
                    onClick={() => setTab('team')}
                  />
                </div>
              </div>

              {/* Body — tab contents */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'catalog' && (
                  <CatalogPicker
                    workspaceId={workspaceId}
                    dealId={dealId}
                    forceDemo={forceDemo}
                    insertAfterSortOrder={insertAfterSortOrder}
                    onItemAdded={onItemAdded}
                    swap={swap}
                    onSwapPick={handleSwapPick}
                    onCancelSwap={() => setSwap(null)}
                  />
                )}
                {tab === 'inspector' && (
                  <div className="h-full overflow-y-auto flex flex-col">
                    {/* Scope-picker row — always visible so the PM can jump
                         between line items without scrolling through the doc
                         or back out to the Financial overview. Same filter-chip
                         geometry as the Team tab's Needed-roles row. */}
                    {scopeBlocks.length > 0 && scopeBlocks[0].headerItemId && (
                      <div className="shrink-0 px-3 pt-3 pb-2 flex flex-col gap-1.5">
                        <span className="stage-label text-[var(--stage-text-tertiary)]">
                          {selectedBlockIdx == null ? 'Line items' : 'Inspecting'}
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                          {scopeBlocks.map((b, i) => {
                            const active = selectedBlockIdx === i;
                            // Non-standard items get a subtle prefix so the PM
                            // sees at-a-glance which lines are optional or
                            // internal. Internal wins over optional if both are
                            // set (internal is the stronger "not what the client
                            // sees" signal).
                            const marker = b.isClientVisible === false
                              ? '◌ '
                              : b.isOptional === true
                                ? '+ '
                                : null;
                            const markerTitle = b.isClientVisible === false
                              ? 'Internal only — hidden from client'
                              : b.isOptional === true
                                ? 'Optional — client can decline'
                                : undefined;
                            return (
                              <button
                                key={b.headerItemId ?? `block-${i}`}
                                type="button"
                                onClick={() => onSelectBlock(i)}
                                title={markerTitle}
                                className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap',
                                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                                )}
                                style={
                                  active
                                    ? {
                                        backgroundColor: 'var(--stage-surface-raised)',
                                        borderColor: 'var(--stage-edge-top)',
                                        color: 'var(--stage-text-primary)',
                                      }
                                    : {
                                        backgroundColor: 'transparent',
                                        borderColor: 'oklch(1 0 0 / 0.08)',
                                        color: 'var(--stage-text-secondary)',
                                      }
                                }
                                aria-pressed={active}
                              >
                                {marker && (
                                  <span className="text-[var(--stage-text-tertiary)] mr-0.5">
                                    {marker}
                                  </span>
                                )}
                                {b.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex-1 min-h-0 p-3">
                      {selectedBlock ? (
                        <LineInspector
                          block={selectedBlock}
                          proposalId={proposalId}
                          dealCrew={dealCrew}
                          onAssignRole={handleAssignRoleFromInspector}
                          onRefetchCrew={onRefetchCrew}
                          onRefetchProposal={onRefetchProposal}
                          onClearSelection={onClearSelection}
                          onSwap={handleEnterSwap}
                          isRequiredRole={isRequiredRole}
                        />
                      ) : (
                        <FinancialInspector
                          scopeBlocks={scopeBlocks}
                          subtotal={subtotal}
                          tax={tax}
                          total={total}
                          taxRate={taxRate}
                          totalCost={totalCost}
                          costKnown={costKnown}
                          onSelectBlock={onSelectBlock}
                          proposal={proposal}
                          onRefetchProposal={onRefetchProposal}
                        />
                      )}
                    </div>
                  </div>
                )}
                {tab === 'team' && (
                  <TeamPicker
                    dealId={dealId}
                    selectedBlock={selectedBlock}
                    dealCrew={dealCrew}
                    roster={roster}
                    forceDemo={forceDemo}
                    roleFocus={teamRoleFocus}
                    onSetRoleFocus={setTeamRoleFocus}
                    onRefetchCrew={onRefetchCrew}
                    isRequiredRole={isRequiredRole}
                  />
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function RailTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 px-3 rounded-[calc(var(--stage-radius-input)-2px)] text-[12px] font-medium tracking-[0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        active
          ? 'bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
      )}
    >
      {label}
    </button>
  );
}
