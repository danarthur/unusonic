'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, ChevronDown } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { CurrencyInput } from '@/shared/ui/currency-input';
// MarginProgressBar removed — per-item margin now lives only in the Proposal Summary Card
import { AlternativePicker } from './alternative-picker';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { ProposalBuilderLineItem, ProposalLineItemCategory, UnitType } from '../model/types';
import type { AlternativeWithAvailability } from '../api/catalog-alternatives';
import type { ItemAvailability } from '../api/catalog-availability';
import type { ItemClientHistory } from '../api/catalog-customer-history';

export interface ProposalLineInspectorProps {
  item: ProposalBuilderLineItem;
  lineIndex: number;
  onUpdateName: (index: number, name: string) => void;
  onUpdateOverridePrice: (index: number, value: number | null) => void;
  onUpdateActualCost: (index: number, value: number | null) => void;
  onUpdateUnitPrice: (index: number, value: number) => void;
  onUpdateDisplayGroupName?: (index: number, value: string | null) => void;
  existingSections?: string[];
  costEditable: boolean;
  costHidden: boolean;
  costRentalRetail: boolean;
  subRentalCostUnlocked: boolean;
  onToggleSubRental: (value: boolean) => void;
  /* ── New props for relocated controls ──────────────────────────── */
  onUpdateBillingMode?: (index: number, mode: UnitType) => void;
  onUpdateUnitMultiplier?: (index: number, value: number) => void;
  onToggleOptional?: (index: number) => void;
  /** Customer booking history for this line item's catalog origin. */
  customerHistory?: ItemClientHistory | null;
  /** Rental availability data for this line item's catalog origin. */
  availability?: ItemAvailability | null;
  /** Alternatives data when the user clicks "Show alternatives". */
  alternativesData?: AlternativeWithAvailability[];
  alternativesLoading?: boolean;
  onShowAlternatives?: () => void;
  onSwapAlternative?: (alternativeId: string) => void;
  onCloseAlternatives?: () => void;
  alternativesOpen?: boolean;
  /** Deal proposed date — needed for alternatives availability check. */
  proposedDate?: string | null;
  /* ── Time controls ─────────────────────────────────────────────── */
  onUpdateTimeStart?: (index: number, value: string | null) => void;
  onUpdateTimeEnd?: (index: number, value: string | null) => void;
  onUpdateShowTimes?: (index: number, value: boolean) => void;
}

export function ProposalLineInspector({
  item,
  lineIndex,
  onUpdateName,
  onUpdateOverridePrice,
  onUpdateActualCost,
  onUpdateUnitPrice,
  onUpdateDisplayGroupName,
  existingSections = [],
  costEditable,
  costHidden,
  costRentalRetail,
  subRentalCostUnlocked,
  onToggleSubRental,
  onUpdateBillingMode,
  onUpdateUnitMultiplier,
  onToggleOptional,
  customerHistory,
  availability,
  alternativesData,
  alternativesLoading,
  onShowAlternatives,
  onSwapAlternative,
  onCloseAlternatives,
  alternativesOpen,
  proposedDate,
  onUpdateTimeStart,
  onUpdateTimeEnd,
  onUpdateShowTimes,
}: ProposalLineInspectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  /** Format HH:MM to 12-hour (e.g. "15:00" → "3:00 PM") */
  const fmt12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const p = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
  };

  const inspectorCategory: ProposalLineItemCategory | null = item.category ?? null;

  const inspectorUnitPrice =
    item.overridePrice != null && Number.isFinite(item.overridePrice)
      ? item.overridePrice
      : item.unitPrice;

  const inspectorActualCost =
    item.actualCost != null && Number.isFinite(item.actualCost)
      ? item.actualCost
      : 0;

  // Multiplier for line total readout (hourly/daily items)
  const multiplier = (item.unitType === 'hour' || item.unitType === 'day')
    ? Math.max(1, Number(item.unitMultiplier) || 1)
    : 1;
  const lineRevenue = inspectorUnitPrice * (item.quantity ?? 1) * multiplier;

  return (
    <motion.div
      key="financial-inspector"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={STAGE_MEDIUM}
      className="min-w-0 flex flex-col overflow-visible"
    >
        <StagePanel elevated data-surface="elevated" className="flex flex-col p-6 min-h-[280px] flex-1 min-w-0 overflow-visible rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)]">
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4 shrink-0 flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Financial Inspector
          </h2>
          <div className="space-y-4">
            {/* Line item name */}
            <div>
              <label htmlFor="inspector-line-name" className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                Line item name
              </label>
              <input
                id="inspector-line-name"
                type="text"
                value={item.name ?? ''}
                onChange={(e) => onUpdateName(lineIndex, e.target.value)}
                placeholder="e.g. Special confetti cannon"
                className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
              />
            </div>

            {/* Price (override price) */}
            <div>
              <label htmlFor="inspector-override-price" className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                Price (what client pays)
              </label>
              <CurrencyInput
                id="inspector-override-price"
                value={item.overridePrice != null ? String(item.overridePrice) : item.unitPrice != null ? String(item.unitPrice) : ''}
                onChange={(v) => {
                  const n = v.trim() === '' ? null : Number(v);
                  onUpdateOverridePrice(lineIndex, Number.isFinite(n) ? n : null);
                }}
                placeholder="0.00"
              />
            </div>

            {/* Cost section */}
            {costHidden ? (
              <div className="rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] px-4 py-3 text-xs text-[var(--stage-text-tertiary)]">
                {inspectorCategory === 'package'
                  ? 'Cost is the sum of ingredients. Adjust costs inside the package.'
                  : 'Cost is set by third party (e.g. processor, permit).'}
              </div>
            ) : (
              <div>
                <label htmlFor="inspector-actual-cost" className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                  Actual cost (what you pay)
                </label>
                <CurrencyInput
                  id="inspector-actual-cost"
                  value={inspectorActualCost != null ? String(inspectorActualCost) : ''}
                  onChange={(v) => {
                    if (!costEditable) return;
                    const n = v.trim() === '' ? null : Number(v);
                    onUpdateActualCost(lineIndex, Number.isFinite(n) ? n : null);
                  }}
                  placeholder="0.00"
                  disabled={!costEditable}
                  className={cn(!costEditable && 'opacity-80')}
                />
                {costRentalRetail && (
                  <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs text-[var(--stage-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={subRentalCostUnlocked}
                      onChange={(e) => onToggleSubRental(e.target.checked)}
                      className="rounded border-[var(--stage-border-focus)] bg-[var(--ctx-well)] text-[var(--stage-accent)] focus-visible:ring-[var(--stage-accent)]"
                    />
                    Is this a Sub-Rental / Custom Order?
                  </label>
                )}
              </div>
            )}

            {/* Line total readout (when hourly/daily, shows the math) */}
            {multiplier > 1 && (
              <div className="flex items-center justify-between text-xs text-[var(--stage-text-secondary)] px-1">
                <span>Line total</span>
                <span className="tabular-nums font-medium text-[var(--stage-text-primary)]">
                  ${lineRevenue.toLocaleString()}
                  <span className="text-[var(--stage-text-tertiary)] font-normal ml-1">
                    ({item.quantity} × ${inspectorUnitPrice.toLocaleString()}{item.unitType === 'hour' ? '/hr' : item.unitType === 'day' ? '/day' : ''} × {multiplier}{item.unitType === 'hour' ? 'hrs' : item.unitType === 'day' ? 'days' : ''})
                  </span>
                </span>
              </div>
            )}

            {/* ── Primary controls ──────────────────────────────────── */}

            {/* Billing mode */}
            {onUpdateBillingMode && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--stage-edge-subtle)]">
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                  Billing mode
                </label>
                <div className="flex items-center gap-0.5 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-0.5 w-fit">
                  {(['flat', 'hour', 'day'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateBillingMode(lineIndex, mode)}
                      className={cn(
                        'px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
                        (item.unitType ?? 'flat') === mode
                          ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]'
                          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                      )}
                    >
                      {mode === 'flat' ? 'Flat' : mode === 'hour' ? 'Hourly' : 'Daily'}
                    </button>
                  ))}
                </div>
                {item.unitType === 'flat' && item.category === 'service' && item.requiredRoles && item.requiredRoles.length > 0 && (
                  <p className="text-xs text-[var(--stage-text-secondary)]">
                    Flat fee — performer name visible to client
                  </p>
                )}
                {(item.unitType === 'hour' || item.unitType === 'day') && item.requiredRoles && item.requiredRoles.length > 0 && (
                  <p className="text-xs text-[var(--stage-text-secondary)]">
                    {item.unitType === 'hour' ? 'Hourly' : 'Daily'} — billed by duration
                  </p>
                )}
              </div>
            )}

            {/* Hours / Days input (when unitType is hour or day) */}
            {onUpdateUnitMultiplier && (item.unitType === 'hour' || item.unitType === 'day') && (
              <div className="flex flex-col gap-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                  {item.unitType === 'hour' ? 'Hours' : 'Days'}
                </label>
                {item.unitType === 'hour' && item.timeStart && item.timeEnd ? (
                  <p className="text-sm tabular-nums text-[var(--stage-text-primary)]" title={`${fmt12(item.timeStart)} – ${fmt12(item.timeEnd)}`}>
                    {item.unitMultiplier ?? 1} hours <span className="text-[var(--stage-text-secondary)]">({fmt12(item.timeStart)} – {fmt12(item.timeEnd)})</span>
                  </p>
                ) : (
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={item.unitMultiplier ?? 1}
                    onChange={(e) => onUpdateUnitMultiplier(lineIndex, e.target.valueAsNumber)}
                    className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] tabular-nums hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                )}
              </div>
            )}

            {/* Event times — only show when item has times but is NOT hourly/daily
                (hourly items already show times in the Hours section above) */}
            {item.timeStart && item.timeEnd && item.unitType === 'flat' && (
              <div className="flex items-center justify-between text-xs text-[var(--stage-text-secondary)] px-1">
                <span>Times</span>
                <span className="tabular-nums text-[var(--stage-text-primary)]">
                  {fmt12(item.timeStart)} – {fmt12(item.timeEnd)}
                </span>
              </div>
            )}

            {/* Customer history */}
            {customerHistory && customerHistory.bookingCount > 0 && (
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-[var(--stage-radius-nested)] bg-[oklch(1_0_0_/_0.03)]">
                <span className="text-xs font-medium text-[var(--stage-text-secondary)]">Client history</span>
                <span className="text-sm text-[var(--stage-text-primary)] tabular-nums">
                  Booked {customerHistory.bookingCount}x, avg ${customerHistory.avgPrice.toLocaleString()}
                </span>
              </div>
            )}

            {/* Alternatives (when shortage) */}
            {availability && (availability.status === 'tight' || availability.status === 'shortage') && proposedDate && item.originPackageId && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onShowAlternatives}
                  className="text-xs font-medium px-3 py-1.5 rounded-[var(--stage-radius-input)] border border-[var(--color-unusonic-warning)]/30 text-[var(--color-unusonic-warning)] hover:bg-[var(--color-unusonic-warning)]/10 transition-colors focus:outline-none w-fit"
                >
                  {alternativesOpen ? 'Hide alternatives' : 'Show alternatives'}
                </button>
                <AnimatePresence>
                  {alternativesOpen && (
                    <motion.div key="alt-picker-inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={STAGE_LIGHT}>
                      <AlternativePicker
                        alternatives={alternativesData ?? []}
                        loading={alternativesLoading ?? false}
                        onSwap={async (alternativeId) => {
                          onSwapAlternative?.(alternativeId);
                        }}
                        onClose={() => onCloseAlternatives?.()}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Advanced section (collapsible) ───────────────────── */}
            <div className="pt-2 border-t border-[var(--stage-edge-subtle)]">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors w-full"
              >
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={cn('transition-transform duration-150', advancedOpen && 'rotate-180')}
                />
                Advanced
              </button>
              <AnimatePresence>
                {advancedOpen && (
                  <motion.div
                    key="advanced-section"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-3">

                      {/* Section (display group name) */}
                      {onUpdateDisplayGroupName && (
                        <div>
                          <label htmlFor="inspector-section" className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                            Section
                          </label>
                          <input
                            id="inspector-section"
                            type="text"
                            list="inspector-section-list"
                            value={item.displayGroupName ?? ''}
                            onChange={(e) => onUpdateDisplayGroupName(lineIndex, e.target.value || null)}
                            placeholder="e.g. Entertainment, Production"
                            className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
                          />
                          {existingSections.length > 0 && (
                            <datalist id="inspector-section-list">
                              {existingSections.map((s) => (
                                <option key={s} value={s} />
                              ))}
                            </datalist>
                          )}
                        </div>
                      )}

                      {/* Optional / Required toggle */}
                      {onToggleOptional && (
                        <div className="flex items-center justify-between gap-3">
                          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                            Client can opt out
                          </label>
                          <button
                            type="button"
                            onClick={() => onToggleOptional(lineIndex)}
                            className={cn(
                              'text-xs px-3 py-1.5 rounded-[var(--stage-radius-input)] border transition-colors',
                              item.isOptional
                                ? 'border-[var(--color-unusonic-info)]/50 text-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/10'
                                : 'border-[var(--stage-border)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                            )}
                          >
                            {item.isOptional ? 'Optional' : 'Required'}
                          </button>
                        </div>
                      )}

                      {/* Visibility to client */}
                      <div className="flex items-center justify-between gap-3">
                        <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                          Visible to client
                        </label>
                        <span className="text-xs text-[var(--stage-text-secondary)]">
                          {item.isClientVisible !== false ? 'Yes' : 'Hidden'}
                        </span>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </StagePanel>
    </motion.div>
  );
}
