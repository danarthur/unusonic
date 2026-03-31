'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calculator } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { MarginProgressBar } from './MarginProgressBar';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { ProposalBuilderLineItem, ProposalLineItemCategory } from '../model/types';

export interface ProposalLineInspectorProps {
  item: ProposalBuilderLineItem;
  lineIndex: number;
  onUpdateName: (index: number, name: string) => void;
  onUpdateOverridePrice: (index: number, value: number | null) => void;
  onUpdateActualCost: (index: number, value: number | null) => void;
  onUpdateUnitPrice: (index: number, value: number) => void;
  costEditable: boolean;
  costHidden: boolean;
  costRentalRetail: boolean;
  subRentalCostUnlocked: boolean;
  onToggleSubRental: (value: boolean) => void;
}

export function ProposalLineInspector({
  item,
  lineIndex,
  onUpdateName,
  onUpdateOverridePrice,
  onUpdateActualCost,
  onUpdateUnitPrice,
  costEditable,
  costHidden,
  costRentalRetail,
  subRentalCostUnlocked,
  onToggleSubRental,
}: ProposalLineInspectorProps) {
  const inspectorCategory: ProposalLineItemCategory | null = item.category ?? null;

  const inspectorOverridePrice =
    item.overridePrice != null && Number.isFinite(item.overridePrice)
      ? item.overridePrice
      : item.unitPrice;

  const inspectorActualCost =
    item.actualCost != null && Number.isFinite(item.actualCost)
      ? item.actualCost
      : 0;

  const inspectorMarginPercent =
    inspectorOverridePrice > 0
      ? ((inspectorOverridePrice - inspectorActualCost) / inspectorOverridePrice) * 100
      : 0;

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
                className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
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

            {/* Margin bar */}
            <MarginProgressBar marginPercent={inspectorMarginPercent} />

          </div>
        </StagePanel>
    </motion.div>
  );
}
