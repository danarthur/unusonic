'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical, Loader2, Lock, Package } from 'lucide-react';
import { ProposalBuilder } from '@/features/sales/ui/proposal-builder';
import { getPackages, getProposalForDeal, addPackageToProposal, revertProposalToDraft } from '@/features/sales/api/proposal-actions';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';
import type { Package as PackageType } from '@/types/supabase';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

const CATALOG_DROPPABLE = 'catalog';
const RECEIPT_DROPPABLE = 'receipt';

/** Shape compatible with proposal_items for optimistic display (no id from server yet). */
type OptimisticProposalItem = {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  override_price?: null;
  actual_cost?: number | null;
  origin_package_id?: string | null;
};

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
 * Proposal Builder Studio — split view like catalog package builder.
 * Proposal belongs to the deal (Liquid phase); no event required to build or edit.
 * Locked when client signs (status accepted); additions then require a change order.
 */
export function ProposalBuilderStudio({ deal, contacts = [], clientAttached: clientAttachedProp }: ProposalBuilderStudioProps) {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageType[]>([]);
  const [initialProposal, setInitialProposal] = useState<ProposalWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [reverting, setReverting] = useState(false);
  /** Optimistic items shown in receipt immediately on drop; cleared when refetch completes. */
  const [optimisticItems, setOptimisticItems] = useState<OptimisticProposalItem[]>([]);
  /** When true, hide the drag clone so the item doesn't animate back to catalog after drop. */
  const [dropAcceptedToReceipt, setDropAcceptedToReceipt] = useState(false);

  /** Locked = client has agreed, signed; additions require change order. */
  const isLocked = initialProposal?.status === 'accepted';

  /** Proposal with optimistic items so receipt updates immediately on drop. */
  const displayProposal: ProposalWithItems | null =
    initialProposal != null
      ? ({
          ...initialProposal,
          items: [...(initialProposal.items ?? []), ...optimisticItems],
        } as ProposalWithItems)
      : optimisticItems.length > 0
        ? ({
            id: null,
            deal_id: deal.id,
            workspace_id: deal.workspace_id ?? '',
            status: 'draft',
            public_token: '',
            created_at: '',
            updated_at: '',
            items: optimisticItems,
          } as unknown as ProposalWithItems)
        : null;

  const refetchProposal = useCallback(() => {
    getProposalForDeal(deal.id).then(setInitialProposal);
  }, [deal.id]);

  useEffect(() => {
    if (!deal.workspace_id) {
      queueMicrotask(() => {
        setPackages([]);
        setLoading(false);
      });
      return;
    }
    getPackages(deal.workspace_id).then((r) => {
      setPackages(r.packages ?? []);
    });
    queueMicrotask(() => setLoading(false));
  }, [deal.workspace_id]);

  useEffect(() => {
    getProposalForDeal(deal.id).then(setInitialProposal);
  }, [deal.id]);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (isLocked) return;
      if (result.source.droppableId !== CATALOG_DROPPABLE) return;
      if (result.destination?.droppableId !== RECEIPT_DROPPABLE) return;
      const draggableId = result.draggableId;
      if (draggableId === 'receipt-placeholder') return;
      const packageId = draggableId.startsWith('catalog-') ? draggableId.slice('catalog-'.length) : draggableId;
      const pkg = packages.find((p) => p.id === packageId);
      setDropError(null);

      // Hide drag clone so it doesn't animate back to catalog (library has no slot in receipt)
      setDropAcceptedToReceipt(true);
      const dropAcceptedTimeout = setTimeout(() => setDropAcceptedToReceipt(false), 400);

      // Optimistic: show package in receipt immediately so the drop doesn’t “jump back”
      if (pkg) {
        setOptimisticItems((prev) => [
          {
            id: `pending-${packageId}-${Date.now()}`,
            name: pkg.name,
            description: pkg.description ?? null,
            quantity: 1,
            unit_price: Number(pkg.price),
            override_price: null,
            actual_cost: pkg.target_cost != null ? Number(pkg.target_cost) : null,
            origin_package_id: pkg.id,
          },
          ...prev,
        ]);
      }

      setIsAddingPackage(true);
      addPackageToProposal(deal.id, packageId)
        .then((r) => {
          if (r.success) {
            getProposalForDeal(deal.id).then((p) => {
              setInitialProposal(p);
              setOptimisticItems([]);
            });
            // Skip router.refresh() to avoid full-page revalidation and layout jump
          } else {
            setDropError(r.error ?? 'Could not add to proposal.');
            setOptimisticItems((prev) => prev.filter((i) => !i.id.startsWith(`pending-${packageId}-`)));
          }
        })
        .finally(() => {
          setIsAddingPackage(false);
          clearTimeout(dropAcceptedTimeout);
        });
    },
    [deal.id, isLocked, packages, refetchProposal]
  );

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col h-full min-h-0">
        {dropError && (
          <div className="shrink-0 px-4 py-2 stage-stripe-error bg-[var(--stage-surface)] text-sm text-[var(--color-unusonic-error)]" role="alert">
            {dropError}
          </div>
        )}
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
              className="shrink-0 text-xs font-medium uppercase tracking-widest text-[var(--color-unusonic-warning)] disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)] rounded px-2 py-1"
            >
              {reverting ? 'Reverting…' : 'Revert to draft'}
            </button>
          </motion.div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_1fr] gap-6 flex-1 min-h-0 p-4 sm:p-6">
          {/* Left: Catalog — plain div (no transform) so drag preview isn't clipped; no overflow-hidden on outer */}
          <div
            data-surface="elevated"
            className={cn(
              'flex flex-col min-h-0 rounded-[var(--stage-radius-panel)] overflow-visible bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)]',
              isLocked && 'opacity-45 pointer-events-none'
            )}
          >
            <div className="shrink-0 px-5 py-4 border-b border-[var(--stage-edge-subtle)] rounded-t-[var(--stage-radius-panel)]">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                Catalog
              </p>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-1 leading-relaxed">
                {isLocked ? 'Locked. Use change orders to add.' : 'Drag items into the proposal'}
              </p>
            </div>
            <Droppable
              droppableId={CATALOG_DROPPABLE}
              isDropDisabled={isLocked}
              renderClone={(provided, snapshot, rubric) => {
                if (dropAcceptedToReceipt) return null;
                const packageId = rubric.draggableId.replace(/^catalog-/, '');
                const pkg = packages.find((p) => p.id === packageId);
                if (!pkg) return null;
                return (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="flex items-center gap-3 rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--stage-surface-raised)] shadow-xl p-3 min-h-[56px] min-w-[200px] cursor-grabbing ring-1 ring-[var(--stage-border)]"
                  >
                    <div className="shrink-0 p-1 text-[var(--stage-text-secondary)] pointer-events-none">
                      <GripVertical className="w-4 h-4" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">{pkg.name}</p>
                      <p className="text-xs text-[var(--stage-text-secondary)] tabular-nums mt-0.5">
                        ${Number(pkg.price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              }}
            >
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex-1 overflow-y-auto p-3 space-y-2 list-none min-h-[140px] rounded-b-[var(--stage-radius-panel)]"
                >
                  {loading ? (
                    <li className="flex items-center gap-2 py-6 text-[var(--stage-text-secondary)] text-sm min-h-[52px]">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      Loading…
                    </li>
                  ) : packages.length === 0 ? (
                    <li className="py-8 flex flex-col items-center justify-center gap-2 text-center text-sm text-[var(--stage-text-secondary)] min-h-[120px]">
                      <Package className="w-8 h-8 text-[var(--stage-text-secondary)]/60" aria-hidden />
                      <span>No packages yet.</span>
                      <Link href="/catalog" className="text-[var(--stage-accent)] text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)] rounded">
                        Add in Catalog
                      </Link>
                    </li>
                  ) : (
                    packages.map((pkg, index) => (
                      <Draggable key={pkg.id} draggableId={`catalog-${pkg.id}`} index={index} isDragDisabled={isLocked}>
                        {(provided, snapshot) => (
                          <li
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={cn(
                              'flex items-center gap-3 p-3 cursor-grab active:cursor-grabbing list-none min-h-[56px] rounded-[var(--stage-radius-nested)] bg-[var(--ctx-card)] border border-[var(--stage-edge-subtle)] hover:bg-[var(--stage-surface-raised)] hover:border-[var(--stage-border)] transition-colors duration-[80ms] ease-out',
                              snapshot.isDragging && 'opacity-45 shadow-xl ring-2 ring-[var(--stage-border-focus)]'
                            )}
                          >
                            <div className="shrink-0 p-1 text-[var(--stage-text-secondary)] pointer-events-none">
                              <GripVertical className="w-4 h-4" aria-hidden />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">{pkg.name}</p>
                              <p className="text-xs text-[var(--stage-text-secondary)] tabular-nums mt-0.5">
                                ${Number(pkg.price).toLocaleString()}
                              </p>
                            </div>
                          </li>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </div>

          {/* Right: Receipt — drop zone; placeholder Draggable so empty list still accepts drops */}
          <div className="flex flex-col min-h-0 w-full">
            <Droppable droppableId={RECEIPT_DROPPABLE} isDropDisabled={isLocked}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="relative w-full min-h-[380px] flex flex-col rounded-[var(--stage-radius-panel)]"
                >
                  {/* Placeholder sized and positioned like the first receipt row so clone doesn't jump */}
                  <Draggable draggableId="receipt-placeholder" index={0} isDragDisabled={true}>
                    {(placeholderProvided) => (
                      <div
                        ref={placeholderProvided.innerRef}
                        {...placeholderProvided.draggableProps}
                        {...placeholderProvided.dragHandleProps}
                        className="absolute left-6 right-6 top-[5.5rem] z-0 min-h-[52px] opacity-0 pointer-events-none select-none"
                        aria-hidden
                      />
                    )}
                  </Draggable>
                  {deal.workspace_id && (
                    <ProposalBuilder
                      dealId={deal.id}
                      workspaceId={deal.workspace_id}
                      initialProposal={displayProposal}
                      contacts={contacts}
                      onProposalRefetch={refetchProposal}
                      onSaved={(_, __) => refetchProposal()}
                      clientAttached={clientAttachedProp ?? !!(deal.organization_id || deal.main_contact_id)}
                      readOnly={isLocked}
                      dealTitle={deal.title ?? 'Untitled production'}
                      className="w-full min-h-0 flex-1"
                      emptyDropHint="Drop catalog items here"
                      isDragOver={snapshot.isDraggingOver && !isLocked}
                    />
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}
