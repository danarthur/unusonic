'use client';

/**
 * Pricing trio for the catalog edit page-client cluster: price, floor price,
 * target cost / vendor rental cost. Each field has a (?) help tooltip whose
 * copy depends on category.
 *
 * Extracted from page-client.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Behavior preserved 1:1: same labels, same copy per category, same margin
 * readout, same conditional rendering for non-package categories.
 */

import { CurrencyInput } from '@/shared/ui/currency-input';
import { cn } from '@/shared/lib/utils';
import type { PackageCategory } from '@/features/sales/api/package-actions';
import { HelpTooltip, labelClass } from './shared';

type PricingFieldsProps = {
  category: PackageCategory;
  unitType: 'flat' | 'hour' | 'day';
  price: string;
  setPrice: (v: string) => void;
  floorPrice: string;
  setFloorPrice: (v: string) => void;
  targetCost: string;
  setTargetCost: (v: string) => void;
  isSubRental: boolean;
};

export function PricingFields({
  category,
  unitType,
  price,
  setPrice,
  floorPrice,
  setFloorPrice,
  targetCost,
  setTargetCost,
  isSubRental,
}: PricingFieldsProps) {
  const isBundle = category === 'package';

  const priceLabel =
    unitType === 'hour'
      ? 'Rate per hour'
      : unitType === 'day'
        ? 'Rate per day'
        : category === 'package'
          ? 'Starting price'
          : category === 'service'
            ? 'Rate'
            : category === 'rental'
              ? 'Rental price'
              : 'Price';

  const priceCopy =
    category === 'package'
      ? 'The starting price shown for this bundle. Proposal line items can override.'
      : category === 'service'
        ? 'What you charge the client per hour or flat rate. Default price used on proposals. Margin = Rate minus Target cost.'
        : category === 'rental'
          ? 'What you charge for this rental. Default price used on proposals.'
          : 'Default selling price for this item. Used on proposals.';

  const targetCostCopy =
    category === 'service'
      ? 'Your internal cost per hour (or flat rate) to provide this service. Used for profit margin.'
      : category === 'rental'
        ? 'Replacement cost or sub-rental cost. Used for profit margin.'
        : category === 'talent'
          ? 'Payout to talent. Used for profit margin.'
          : 'Your internal cost to provide this item. Used for profit margin.';

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className={cn(isBundle && 'col-span-2')}>
        <div className="flex items-center gap-1.5 mb-1">
          <label htmlFor="edit-price" className={cn(labelClass, '!mb-0')}>
            {priceLabel}
          </label>
          <HelpTooltip ariaLabel="Price help">{priceCopy}</HelpTooltip>
        </div>
        <CurrencyInput
          id="edit-price"
          value={price}
          onChange={setPrice}
          placeholder="0.00"
          required
        />
      </div>
      {!isBundle && (
        <>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label htmlFor="edit-floor-price" className={cn(labelClass, '!mb-0')}>
                Floor price (optional)
              </label>
              <HelpTooltip ariaLabel="Floor price help">
                The lowest price you&apos;re willing to accept. The system can warn or block quotes below this so you don&apos;t sell at a loss. Should be at or above your Target cost.
              </HelpTooltip>
            </div>
            <CurrencyInput
              id="edit-floor-price"
              value={floorPrice}
              onChange={setFloorPrice}
              placeholder="Lowest acceptable"
            />
            {/* Margin readout: current margin vs floor margin */}
            {price && targetCost && Number(price) > 0 && Number(targetCost) >= 0 && (
              <div className="mt-1.5 flex items-center gap-3 text-xs tabular-nums text-[var(--stage-text-secondary)]">
                <span>
                  Current margin:{' '}
                  <span className="text-[var(--stage-text-primary)] font-medium">
                    {(((Number(price) - Number(targetCost)) / Number(price)) * 100).toFixed(0)}%
                  </span>
                </span>
                {floorPrice && Number(floorPrice) > 0 && (
                  <span>
                    Floor margin:{' '}
                    <span className="text-[var(--stage-text-primary)] font-medium">
                      {(((Number(floorPrice) - Number(targetCost)) / Number(floorPrice)) * 100).toFixed(0)}%
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label htmlFor="edit-target-cost" className={cn(labelClass, '!mb-0')}>
                {category === 'rental' && isSubRental ? 'Vendor Rental Cost' : 'Target cost'}
              </label>
              <HelpTooltip ariaLabel="Target cost help" widthPx={224} bubbleClassName="w-56">
                {targetCostCopy}
              </HelpTooltip>
            </div>
            <CurrencyInput
              id="edit-target-cost"
              value={targetCost}
              onChange={setTargetCost}
              placeholder="0.00"
            />
          </div>
        </>
      )}
    </div>
  );
}
