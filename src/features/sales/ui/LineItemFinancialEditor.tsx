'use client';

/**
 * LineItemFinancialEditor — Slide-over panel for inspecting and editing a single
 * proposal line item. Triggered by clicking any row in the receipt.
 *
 * Design contract:
 * - Fixed right-side overlay (z-50), full viewport height
 * - Entrance: slides in from right with STAGE_HEAVY spring
 * - Section transitions: M3_FADE_THROUGH_VARIANTS per item change (keyed on selectedIndex)
 * - Scrollable interior; header and nav footer are sticky
 *
 * Section order (cognitive flow: who → what → how billed → math → margins → crew):
 *   1. Item name (editable, local draft)
 *   2. Description / client notes (local draft textarea)
 *   3. Internal notes (PM-only, local draft textarea)
 *   4. Visibility toggle (isClientVisible)
 *   5. Pricing (override price + floor price warning)
 *   6. Billing method (unitType + unitMultiplier)
 *   7. Math breakdown (formula display)
 *   8. Actual cost (cost per unit, category-gated)
 *   9. Sub-rental unlock (rental/retail_sale only)
 *  10. Cost breakdown card + margin row
 *  11. MarginProgressBar
 *  12. Crew / required roles
 *  13. Swap item picker
 *
 * @module features/sales/ui/LineItemFinancialEditor
 */

import { useEffect, useState, useRef } from 'react';
import { useModalLayer } from '@/shared/lib/use-modal-layer';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Eye,
  EyeOff,
  Users,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { MarginProgressBar } from './MarginProgressBar';
import { SwapItemPicker } from './SwapItemPicker';
import { cn } from '@/shared/lib/utils';
import { STAGE_HEAVY, M3_FADE_THROUGH_VARIANTS } from '@/shared/lib/motion-constants';
import type { ProposalBuilderLineItem, ProposalLineItemCategory, UnitType } from '../model/types';
import { estimatedRoleCost } from '../api/package-types';
import type { RequiredRole } from '../api/package-types';

// =============================================================================
// estimatedRoleCostForItem — unitMultiplier-aware crew cost helper
// When the item is billed per hour, uses item.unitMultiplier instead of default_hours
// so the PM's custom duration is reflected in the cost estimate.
// =============================================================================

function estimatedRoleCostForItem(role: RequiredRole, item: ProposalBuilderLineItem): number {
  if (item.unitType === 'hour' && role.booking_type === 'labor') {
    const rate = role.default_rate ?? 0;
    const hours = Math.max(
      item.unitMultiplier ?? 1,
      role.minimum_hours ?? 0
    );
    const qty = Math.max(1, role.quantity ?? 1);
    return rate * hours * qty;
  }
  return estimatedRoleCost(role);
}

// =============================================================================
// Props
// =============================================================================

export interface LineItemFinancialEditorProps {
  /** All line items in the receipt (for prev/next navigation). */
  lineItems: ProposalBuilderLineItem[];
  /** Index of the currently selected item. Null = panel closed. */
  selectedIndex: number | null;
  /** Proposal id needed for swap action. Null until proposal first saved. */
  proposalId: string | null;
  /** Workspace id for SwapItemPicker catalog fetch. */
  workspaceId: string;
  /** When true, no edits allowed (e.g. accepted proposal). */
  readOnly?: boolean;

  // --- Navigation ---
  onSelectIndex: (index: number | null) => void;

  // --- Scalar update callbacks ---
  onUpdateName: (index: number, name: string) => void;
  onUpdateDescription: (index: number, description: string | null) => void;
  onUpdateInternalNotes: (index: number, notes: string | null) => void;
  onUpdateIsClientVisible: (index: number, visible: boolean) => void;
  onUpdateOverridePrice: (index: number, value: number | null) => void;
  onUpdateActualCost: (index: number, value: number | null) => void;
  /** Atomic: always update both together to avoid footgun of type without resetting multiplier. */
  onUpdateBillingMethod: (index: number, unitType: UnitType, unitMultiplier: number) => void;

  // --- Swap item ---
  /** Returns success/error so the editor can surface it inline. */
  onSwapItem: (newPackageId: string) => Promise<{ success: boolean; error?: string }>;

  // --- Computed value functions (passed as functions to prevent stale display during edits) ---
  effectiveUnitPriceFn: (item: ProposalBuilderLineItem) => number;
  lineTotalFn: (item: ProposalBuilderLineItem) => number;
}

// =============================================================================
// Component
// =============================================================================

export function LineItemFinancialEditor({
  lineItems,
  selectedIndex,
  proposalId,
  workspaceId,
  readOnly = false,
  onSelectIndex,
  onUpdateName,
  onUpdateDescription,
  onUpdateInternalNotes,
  onUpdateIsClientVisible,
  onUpdateOverridePrice,
  onUpdateActualCost,
  onUpdateBillingMethod,
  onSwapItem,
  effectiveUnitPriceFn,
  lineTotalFn,
}: LineItemFinancialEditorProps) {
  const isOpen = selectedIndex != null;
  const item = selectedIndex != null ? lineItems[selectedIndex] ?? null : null;

  // --- Local draft state for text fields (committed on blur) ---
  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localInternalNotes, setLocalInternalNotes] = useState('');

  // --- Sub-rental unlock (rental/retail_sale cost field) ---
  const [subRentalCostUnlocked, setSubRentalCostUnlocked] = useState(false);

  // --- Swap picker ---
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Sync local draft state when selected item changes (index drives which row is open).
  useEffect(() => {
    if (item == null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLocalName(item.name ?? '');
      setLocalDescription(item.description ?? '');
      setLocalInternalNotes(item.internalNotes ?? '');
      setSubRentalCostUnlocked(false);
      setSwapOpen(false);
      setSwapError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIndex, item]);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalLayer({
    open: isOpen && item != null,
    onClose: () => onSelectIndex(null),
    containerRef: panelRef,
  });

  // --- Derived category flags ---
  const category: ProposalLineItemCategory | null = item?.category ?? null;
  const costFullyEditable = category === 'service' || category === 'talent';
  const costRentalRetail = category === 'rental' || category === 'retail_sale';
  const costEditable = costFullyEditable || (costRentalRetail && subRentalCostUnlocked) || category == null;
  const costHidden = category === 'package' || category === 'fee';
  const isPackageHeaderOrChild = !!(item?.isPackageHeader || (item?.packageInstanceId && !item.isPackageHeader));
  const canSwap = !!(item?.id && proposalId && !isPackageHeaderOrChild);

  // --- Computed prices ---
  const effectivePrice = item ? effectiveUnitPriceFn(item) : 0;
  const lineTotal = item ? lineTotalFn(item) : 0;

  // --- Floor price ---
  const floorPrice = item?.floorPrice ?? null;
  const belowFloor = floorPrice != null && effectivePrice < floorPrice;

  // --- Margin (null-safe: never show when actualCost is null) ---
  const hasCostData = item?.actualCost != null;
  const actualCostPerUnit = hasCostData ? (item!.actualCost as number) : null;
  const unitMult = item
    ? item.unitType === 'hour' || item.unitType === 'day'
      ? Math.max(0, Number(item.unitMultiplier) || 1)
      : 1
    : 1;
  const totalCost = hasCostData ? (actualCostPerUnit! * unitMult * (item?.quantity ?? 1)) : null;
  const marginPercent =
    hasCostData && lineTotal > 0
      ? ((lineTotal - totalCost!) / lineTotal) * 100
      : null;

  // --- Crew / required roles ---
  const roles: RequiredRole[] = item?.requiredRoles ?? [];
  const showCrew = roles.length > 0 && category !== 'rental' && category !== 'retail_sale' && category !== 'fee';

  // --- Navigation ---
  const prevIndex = selectedIndex != null && selectedIndex > 0 ? selectedIndex - 1 : null;
  const nextIndex = selectedIndex != null && selectedIndex < lineItems.length - 1 ? selectedIndex + 1 : null;

  // --- Handlers ---
  const handleSwap = async (packageId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await onSwapItem(packageId);
    if (!result.success) setSwapError(result.error ?? 'Failed to swap item.');
    else { setSwapOpen(false); setSwapError(null); }
    return result;
  };

  return (
    <AnimatePresence>
      {isOpen && item && (
        <>
          {/* Backdrop — click to close */}
          <motion.div
            key="editor-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-40 stage-scrim"
            onClick={() => onSelectIndex(null)}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            key="editor-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Line item editor"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={STAGE_HEAVY}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[min(100%,28rem)] flex flex-col border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] shadow-[0_8px_32px_-4px_oklch(0_0_0_/_0.6)] outline-none"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-[oklch(1_0_0_/_0.08)]">
              <div className="flex items-center gap-2 min-w-0">
                <Calculator className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)] truncate">
                  Line item
                </h2>
                {category && (
                  <span className="ml-1 shrink-0 rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                    {category.replace('_', ' ')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectIndex(null)}
                className="shrink-0 p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
                aria-label="Close editor"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable body — section content transitions per item */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedIndex}
                  variants={M3_FADE_THROUGH_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="p-5 space-y-5"
                >

                  {/* ── 1. Item name ── */}
                  <div>
                    <label
                      htmlFor="editor-name"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5"
                    >
                      Item name
                    </label>
                    <input
                      id="editor-name"
                      type="text"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      onBlur={() => {
                        const trimmed = localName.trim();
                        if (trimmed) {
                          onUpdateName(selectedIndex!, trimmed);
                        } else {
                          // Revert to existing name if field emptied
                          setLocalName(item.name ?? '');
                        }
                      }}
                      readOnly={readOnly}
                      placeholder="e.g. Stage lighting rig"
                      className="w-full rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)] read-only:opacity-70"
                    />
                  </div>

                  {/* ── 2. Description / client notes ── */}
                  <div>
                    <label
                      htmlFor="editor-description"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5"
                    >
                      Client description
                    </label>
                    <textarea
                      id="editor-description"
                      rows={3}
                      value={localDescription}
                      onChange={(e) => setLocalDescription(e.target.value)}
                      onBlur={() =>
                        onUpdateDescription(selectedIndex!, localDescription.trim() || null)
                      }
                      readOnly={readOnly}
                      placeholder="Visible on the proposal PDF — describe what the client is getting."
                      className="w-full rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)] resize-none leading-relaxed read-only:opacity-70"
                    />
                  </div>

                  {/* ── 3. Internal notes (PM-only) ── */}
                  {!readOnly && (
                    <div>
                      <label
                        htmlFor="editor-internal-notes"
                        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5"
                      >
                        <Lock className="w-3 h-3 opacity-60" strokeWidth={1.5} aria-hidden />
                        Internal notes
                        <span className="ml-1 text-[10px] normal-case tracking-normal text-[var(--stage-text-tertiary)]">
                          (not on client PDF)
                        </span>
                      </label>
                      <textarea
                        id="editor-internal-notes"
                        rows={2}
                        value={localInternalNotes}
                        onChange={(e) => setLocalInternalNotes(e.target.value)}
                        onBlur={() =>
                          onUpdateInternalNotes(
                            selectedIndex!,
                            localInternalNotes.trim() || null
                          )
                        }
                        placeholder="Vendor contact, order number, setup notes — only your team sees this."
                        className="w-full rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)] resize-none leading-relaxed"
                      />
                    </div>
                  )}

                  {/* ── 4. Visibility toggle ── */}
                  {!readOnly && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.isClientVisible !== false ? (
                          <Eye className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--stage-text-tertiary)] shrink-0" strokeWidth={1.5} aria-hidden />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--stage-text-primary)]">
                            {item.isClientVisible !== false ? 'Visible to client' : 'Hidden from client'}
                          </p>
                          <p className="text-[11px] text-[var(--stage-text-secondary)] leading-tight mt-0.5">
                            {item.isClientVisible !== false
                              ? 'Shows on proposal PDF and public view.'
                              : 'Appears on your pull sheet only.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.isClientVisible !== false}
                        onClick={() =>
                          onUpdateIsClientVisible(selectedIndex!, !(item.isClientVisible !== false))
                        }
                        className={cn(
                          'shrink-0 relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)]',
                          item.isClientVisible !== false
                            ? 'bg-[var(--stage-accent)]'
                            : 'bg-[oklch(1_0_0_/_0.15)]'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 rounded-full bg-[var(--stage-void)] shadow transition-transform',
                            item.isClientVisible !== false ? 'translate-x-4' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </div>
                  )}

                  {/* ── Divider ── */}
                  <div className="border-t border-[oklch(1_0_0_/_0.08)]" />

                  {/* ── 5. Pricing ── */}
                  <div>
                    <label
                      htmlFor="editor-price"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5"
                    >
                      Price (what client pays)
                    </label>
                    <CurrencyInput
                      id="editor-price"
                      value={
                        item.overridePrice != null
                          ? String(item.overridePrice)
                          : item.unitPrice != null
                          ? String(item.unitPrice)
                          : ''
                      }
                      onChange={(v) => {
                        if (readOnly) return;
                        const n = v.trim() === '' ? null : Number(v);
                        onUpdateOverridePrice(selectedIndex!, Number.isFinite(n) ? n : null);
                      }}
                      placeholder="0.00"
                      disabled={readOnly}
                      className={cn(belowFloor && 'border-[oklch(0.80_0.16_85/0.5)]')}
                    />
                    {belowFloor && floorPrice != null && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-unusonic-warning)]">
                        <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={1.5} aria-hidden />
                        Below floor price of ${floorPrice.toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* ── 6. Billing method ── */}
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-2">
                      Billing method
                    </label>
                    <div className="flex items-start gap-2">
                      <select
                        value={item.unitType ?? 'flat'}
                        disabled={readOnly}
                        onChange={(e) => {
                          const newType = e.target.value as UnitType;
                          const newMult = newType === 'flat' ? 1 : (item.unitMultiplier ?? 1);
                          onUpdateBillingMethod(selectedIndex!, newType, newMult);
                        }}
                        className="flex-1 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)] disabled:opacity-60"
                      >
                        <option value="flat">Flat rate</option>
                        <option value="hour">Per hour</option>
                        <option value="day">Per day</option>
                      </select>
                      {(item.unitType === 'hour' || item.unitType === 'day') && (
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                          <input
                            type="number"
                            min={0.25}
                            step={0.25}
                            value={item.unitMultiplier ?? 1}
                            disabled={readOnly}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              const safe = Number.isFinite(v) ? Math.max(0.25, v) : 1;
                              onUpdateBillingMethod(selectedIndex!, item.unitType as UnitType, safe);
                            }}
                            className="w-20 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-surface-raised)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-60"
                            aria-label={item.unitType === 'hour' ? 'Number of hours' : 'Number of days'}
                          />
                          <span className="text-xs text-[var(--stage-text-secondary)]">
                            {item.unitType === 'hour' ? 'hrs' : 'days'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── 7. Math breakdown ── */}
                  {(item.unitType === 'hour' || item.unitType === 'day' || item.quantity > 1) && (
                    <div className="rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-2">
                        Calculation
                      </p>
                      {item.unitType === 'flat' ? (
                        <p className="text-xs text-[var(--stage-text-primary)] tabular-nums">
                          {item.quantity} ×{' '}
                          <span className="text-[var(--stage-text-primary)]">${effectivePrice.toLocaleString()}</span>
                          {' = '}
                          <span className="font-semibold text-[var(--stage-text-primary)]">${lineTotal.toLocaleString()}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--stage-text-primary)] tabular-nums">
                          {item.quantity} unit{item.quantity !== 1 ? 's' : ''} ×{' '}
                          {item.unitMultiplier ?? 1}{' '}
                          {item.unitType === 'hour' ? 'hr' : 'day'}{(item.unitMultiplier ?? 1) !== 1 ? 's' : ''} ×{' '}
                          <span className="text-[var(--stage-text-primary)]">${effectivePrice.toLocaleString()}/{item.unitType === 'hour' ? 'hr' : 'day'}</span>
                          {' = '}
                          <span className="font-semibold text-[var(--stage-text-primary)]">${lineTotal.toLocaleString()}</span>
                        </p>
                      )}
                      {hasCostData && totalCost != null && (
                        <p className="mt-1 text-xs text-[var(--stage-text-secondary)] tabular-nums">
                          Cost: ${(actualCostPerUnit!).toLocaleString()}/unit × {unitMult}{' '}
                          {item.unitType === 'hour' ? 'hr' : item.unitType === 'day' ? 'day' : 'unit'}{unitMult !== 1 ? 's' : ''} × {item.quantity}{' '}
                          = <span className="text-[var(--stage-text-primary)]">${totalCost.toLocaleString()} cost</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── 8 & 9. Actual cost + sub-rental unlock ── */}
                  {!costHidden && (
                    <div>
                      <label
                        htmlFor="editor-actual-cost"
                        className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5"
                      >
                        Cost per unit{' '}
                        <span className="normal-case tracking-normal font-normal text-[var(--stage-text-tertiary)]">
                          (what you pay)
                        </span>
                      </label>
                      <CurrencyInput
                        id="editor-actual-cost"
                        value={item.actualCost != null ? String(item.actualCost) : ''}
                        onChange={(v) => {
                          if (!costEditable) return;
                          const n = v.trim() === '' ? null : Number(v);
                          onUpdateActualCost(selectedIndex!, Number.isFinite(n) ? n : null);
                        }}
                        placeholder="0.00"
                        disabled={!costEditable || readOnly}
                        className={cn(!costEditable && 'opacity-70')}
                      />
                      {costRentalRetail && !readOnly && (
                        <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs text-[var(--stage-text-secondary)] select-none">
                          <input
                            type="checkbox"
                            checked={subRentalCostUnlocked}
                            onChange={(e) => setSubRentalCostUnlocked(e.target.checked)}
                            className="rounded border-[oklch(1_0_0_/_0.12)] bg-[var(--stage-surface)] text-[var(--color-unusonic-warning)] focus:ring-[var(--stage-accent)]"
                          />
                          Sub-rental or custom order (unlocks cost edit)
                        </label>
                      )}
                      {!costEditable && !costRentalRetail && (
                        <p className="mt-1.5 text-[11px] text-[var(--stage-text-secondary)]">
                          Set in catalog — edit there to apply to all proposals.
                        </p>
                      )}
                    </div>
                  )}
                  {costHidden && (
                    <div className="rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-4 py-3 text-xs text-[var(--stage-text-secondary)]">
                      {category === 'package'
                        ? 'Cost is the sum of ingredients. Adjust costs inside the package definition.'
                        : 'Cost is set by third party (e.g. processor fee, permit). Not editable here.'}
                    </div>
                  )}

                  {/* ── 10. Cost breakdown card + margin row ── */}
                  {!costHidden && hasCostData && totalCost != null && lineTotal > 0 && (
                    <div className="rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-4 py-3 space-y-2">
                      {/* Labor cost for service/talent (using unitMultiplier-aware helper) */}
                      {(category === 'service' || category === 'talent') && roles.length > 0 && (
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--stage-text-secondary)]">
                          <span>Crew cost (est.)</span>
                          <span className="tabular-nums">
                            ${roles
                              .reduce((sum, r) => sum + estimatedRoleCostForItem(r, item), 0)
                              .toLocaleString()}
                          </span>
                        </div>
                      )}
                      {/* Gear cost for rental/retail */}
                      {(category === 'rental' || category === 'retail_sale') && (
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--stage-text-secondary)]">
                          <span>Gear cost (est.)</span>
                          <span className="tabular-nums">${totalCost.toLocaleString()}</span>
                        </div>
                      )}
                      {/* Margin row */}
                      <div className="border-t border-[oklch(1_0_0_/_0.08)] pt-2 flex items-center justify-between gap-2 text-xs font-medium text-[var(--stage-text-primary)]">
                        <span>Your margin</span>
                        <span className="tabular-nums">
                          ${(lineTotal - totalCost).toLocaleString()}
                          {marginPercent != null && lineTotal > 0
                            ? ` (${Math.round(marginPercent)}%)`
                            : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* No cost set hint */}
                  {!costHidden && !hasCostData && (
                    <p className="text-xs text-[var(--stage-text-secondary)] rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-4 py-3">
                      No cost set — enter target cost in catalog to calculate margin.
                    </p>
                  )}

                  {/* ── 11. Margin progress bar ── */}
                  {marginPercent != null && (
                    <MarginProgressBar marginPercent={marginPercent} />
                  )}

                  {/* ── 12. Crew / required roles ── */}
                  {showCrew && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                          Crew requirements
                        </p>
                      </div>
                      <div className="space-y-2">
                        {roles.map((role, i) => {
                          const roleCost = estimatedRoleCostForItem(role, item);
                          return (
                            <div
                              key={i}
                              className="flex items-start justify-between gap-3 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[var(--stage-text-primary)] truncate">
                                  {role.quantity > 1 ? `${role.quantity}× ` : ''}{role.role}
                                </p>
                                <p className="text-[11px] text-[var(--stage-text-secondary)] mt-0.5">
                                  {role.booking_type === 'talent'
                                    ? 'Talent — flat fee'
                                    : role.default_hours
                                    ? `Labor — ${role.default_hours}h`
                                    : 'Labor'}
                                  {role.default_rate != null && (
                                    <>
                                      {' · '}
                                      {role.booking_type === 'talent'
                                        ? `$${role.default_rate.toLocaleString()} flat`
                                        : `$${role.default_rate.toLocaleString()}/hr`}
                                    </>
                                  )}
                                </p>
                                {role.assignee_name && (
                                  <p className="text-[11px] text-[var(--color-unusonic-warning)] mt-0.5 truncate">
                                    → {role.assignee_name}
                                  </p>
                                )}
                              </div>
                              {role.default_rate != null && (
                                <span className="text-xs font-semibold text-[var(--stage-text-primary)] shrink-0 tabular-nums">
                                  ${roleCost.toLocaleString()}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── 13. Swap item ── */}
                  {canSwap && !readOnly && (
                    <div className="pt-1 border-t border-[oklch(1_0_0_/_0.08)]">
                      <SwapItemPicker
                        workspaceId={workspaceId}
                        open={swapOpen}
                        onOpenChange={(v) => {
                          setSwapOpen(v);
                          if (!v) setSwapError(null);
                        }}
                        filterCategory={item.category ?? undefined}
                        onSelect={handleSwap}
                        error={swapError}
                      />
                    </div>
                  )}
                  {isPackageHeaderOrChild && !readOnly && (
                    <p className="text-[11px] text-[var(--stage-text-tertiary)] pt-1 border-t border-[oklch(1_0_0_/_0.08)]">
                      Swap is not available for bundled items. Unpack the bundle first to swap individual lines.
                    </p>
                  )}

                </motion.div>
              </AnimatePresence>
            </div>

            {/* Nav footer — prev/next item */}
            {(prevIndex != null || nextIndex != null) && (
              <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-[oklch(1_0_0_/_0.08)]">
                <button
                  type="button"
                  disabled={prevIndex == null}
                  onClick={() => prevIndex != null && onSelectIndex(prevIndex)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] rounded-lg px-2 py-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                  Prev
                </button>
                <span className="text-[11px] text-[var(--stage-text-tertiary)] tabular-nums">
                  {(selectedIndex ?? 0) + 1} / {lineItems.length}
                </span>
                <button
                  type="button"
                  disabled={nextIndex == null}
                  onClick={() => nextIndex != null && onSelectIndex(nextIndex)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] rounded-lg px-2 py-1"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
