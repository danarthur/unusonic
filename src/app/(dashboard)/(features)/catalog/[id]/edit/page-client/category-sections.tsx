'use client';

/**
 * Category-conditional sections of the catalog edit form: service/talent
 * (duration + role + sets), billing type (flat/hour/day toggle + default
 * units), rental inventory + alternatives, retail (stock + buffer %), and
 * the "Open in Builder" CTA for bundles.
 *
 * Extracted from page-client.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Each block is its own export so the main file's render reads as a flat
 * sequence of `<XSection ... />` calls. State stays owned by the main
 * component and is plumbed in via props.
 */

import Link from 'next/link';
import { LayoutGrid, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CurrencyInput } from '@/shared/ui/currency-input';
import type { PackageCategory, PackageWithTags } from '@/features/sales/api/package-actions';
import { inputClass, labelClass } from './shared';

// ---------------------------------------------------------------------------
// Service / Talent
// ---------------------------------------------------------------------------

type ServiceTalentSectionProps = {
  category: PackageCategory;
  durationHours: string;
  setDurationHours: (v: string) => void;
  staffRole: string;
  setStaffRole: (v: string) => void;
  jobTitles: string[];
  requiredRole: boolean;
  setRequiredRole: (v: boolean) => void;
  performanceSetCount: string;
  setPerformanceSetCount: (v: string) => void;
};

export function ServiceTalentSection({
  category,
  durationHours,
  setDurationHours,
  staffRole,
  setStaffRole,
  jobTitles,
  requiredRole,
  setRequiredRole,
  performanceSetCount,
  setPerformanceSetCount,
}: ServiceTalentSectionProps) {
  return (
    <div className="space-y-4 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-4 bg-[var(--ctx-well)]">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        {category === 'talent' ? 'Talent' : 'Service'}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="edit-duration" className={labelClass}>
            Duration (hours)
          </label>
          <input
            id="edit-duration"
            type="number"
            min={0}
            step={0.25}
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            className={inputClass}
            placeholder="e.g. 8"
          />
        </div>
        <div>
          <label htmlFor="edit-staff-role" className={labelClass}>
            Staff role
          </label>
          <select
            id="edit-staff-role"
            value={staffRole}
            onChange={(e) => setStaffRole(e.target.value)}
            className={inputClass}
          >
            <option value="">Select role…</option>
            {jobTitles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {staffRole.trim() !== '' && (
            <label
              htmlFor="edit-required-role"
              className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-pointer select-none"
            >
              <input
                id="edit-required-role"
                type="checkbox"
                checked={requiredRole}
                onChange={(e) => setRequiredRole(e.target.checked)}
                className="size-3.5 rounded-[3px] border border-[oklch(1_0_0_/_0.18)] bg-[var(--ctx-well)] accent-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              <span>Required role</span>
              <span className="text-[var(--stage-text-tertiary)] font-normal">
                — flags Send when unfilled
              </span>
            </label>
          )}
        </div>
      </div>
      {(category === 'talent' || durationHours.trim()) && (
        <div>
          <label htmlFor="edit-set-count" className={labelClass}>
            Sets
          </label>
          <input
            id="edit-set-count"
            type="number"
            min={1}
            step={1}
            value={performanceSetCount}
            onChange={(e) => setPerformanceSetCount(e.target.value)}
            className={inputClass}
            placeholder="e.g. 2"
          />
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            Number of sets (e.g. 2 × 45 min)
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing type (flat / hour / day) — non-package categories only
// ---------------------------------------------------------------------------

type BillingTypeSectionProps = {
  unitType: 'flat' | 'hour' | 'day';
  setUnitType: (v: 'flat' | 'hour' | 'day') => void;
  unitMultiplier: string;
  setUnitMultiplier: (v: string) => void;
};

export function BillingTypeSection({
  unitType,
  setUnitType,
  unitMultiplier,
  setUnitMultiplier,
}: BillingTypeSectionProps) {
  return (
    <div>
      <label className={cn(labelClass, 'mb-1.5')}>Billing type</label>
      <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)]">
        {(
          [
            ['flat', 'Flat rate'],
            ['hour', 'Hourly'],
            ['day', 'Daily'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => {
              setUnitType(val);
              if (val === 'flat') setUnitMultiplier('');
            }}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-[calc(var(--stage-radius-input)-2px)] text-xs font-medium tracking-tight transition-colors',
              unitType === val
                ? 'bg-[var(--stage-accent)] text-[var(--stage-void)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {unitType !== 'flat' && (
        <div className="mt-3">
          <label htmlFor="edit-default-units" className={labelClass}>
            Default {unitType === 'hour' ? 'hours' : 'days'} (optional)
          </label>
          <input
            id="edit-default-units"
            type="number"
            min={0.25}
            step={0.25}
            value={unitMultiplier}
            onChange={(e) => setUnitMultiplier(e.target.value)}
            className={cn(
              inputClass,
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            )}
            placeholder={unitType === 'hour' ? 'e.g. 4 (minimum hours)' : 'e.g. 2'}
          />
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            Pre-fills when added to proposals. Can be adjusted per event.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rental — Inventory & Fulfillment
// ---------------------------------------------------------------------------

type RentalInventorySectionProps = {
  stockQuantity: string;
  setStockQuantity: (v: string) => void;
  isSubRental: boolean;
  setIsSubRental: (v: boolean) => void;
  replacementCost: string;
  setReplacementCost: (v: string) => void;
  bufferDays: string;
  setBufferDays: (v: string) => void;
};

export function RentalInventorySection({
  stockQuantity,
  setStockQuantity,
  isSubRental,
  setIsSubRental,
  replacementCost,
  setReplacementCost,
  bufferDays,
  setBufferDays,
}: RentalInventorySectionProps) {
  return (
    <div className="space-y-4 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-4 bg-[var(--ctx-well)]">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        Inventory & Fulfillment
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="edit-stock" className={labelClass}>
            Total stock quantity <span className="text-[var(--color-unusonic-error)]">*</span>
          </label>
          <input
            id="edit-stock"
            type="number"
            min={0}
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
            className={inputClass}
            placeholder="e.g. 100"
            required
          />
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            How many units you own or can fulfill. Used to prevent overbooking.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSubRental}
              onChange={(e) => setIsSubRental(e.target.checked)}
              className="rounded border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-accent)] focus-visible:ring-[var(--stage-accent)]"
            />
            <span className="text-sm text-[var(--stage-text-primary)]">
              We sub-rent this item from another vendor
            </span>
          </label>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            When checked, Target Cost becomes Vendor Rental Cost (what the vendor charges you).
          </p>
        </div>
        <div>
          <label htmlFor="edit-replacement-cost" className={labelClass}>
            Replacement cost
          </label>
          <CurrencyInput
            id="edit-replacement-cost"
            value={replacementCost}
            onChange={setReplacementCost}
            placeholder="0.00"
          />
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            What you will charge the client if this item is destroyed or lost.
          </p>
        </div>
        <div>
          <label htmlFor="edit-buffer-days" className={labelClass}>
            Prep / buffer days
          </label>
          <select
            id="edit-buffer-days"
            value={bufferDays}
            onChange={(e) => setBufferDays(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="0">0 days</option>
            <option value="1">1 day</option>
            <option value="2">2 days</option>
            <option value="3">3 days</option>
          </select>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
            How many days this item needs for cleaning/prep before it can be rented again.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rental — Alternative items picker
// ---------------------------------------------------------------------------

type RentalAlternativesSectionProps = {
  alternatives: string[];
  setAlternatives: React.Dispatch<React.SetStateAction<string[]>>;
  allRentalPackages: PackageWithTags[];
  altSearchOpen: boolean;
  setAltSearchOpen: (v: boolean) => void;
  altSearchQuery: string;
  setAltSearchQuery: (v: string) => void;
};

export function RentalAlternativesSection({
  alternatives,
  setAlternatives,
  allRentalPackages,
  altSearchOpen,
  setAltSearchOpen,
  altSearchQuery,
  setAltSearchQuery,
}: RentalAlternativesSectionProps) {
  const filteredCandidates = allRentalPackages.filter(
    (p) =>
      !alternatives.includes(p.id) &&
      p.name.toLowerCase().includes(altSearchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-3 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-4 bg-[var(--ctx-well)]">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
          Alternative items
        </p>
        <p className="text-xs text-[var(--stage-text-secondary)]/60 mt-0.5 leading-relaxed">
          When this item is unavailable, these will be suggested as replacements
        </p>
      </div>

      {/* Current alternatives list */}
      {alternatives.length > 0 && (
        <ul className="space-y-1.5">
          {alternatives.map((altId) => {
            const altPkg = allRentalPackages.find((p) => p.id === altId);
            return (
              <li
                key={altId}
                className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.06)] bg-[var(--ctx-well)]"
              >
                <span className="flex-1 text-sm text-[var(--stage-text-primary)] truncate">
                  {altPkg?.name ?? altId}
                </span>
                {altPkg && (
                  <span className="text-xs tabular-nums text-[var(--stage-text-secondary)] shrink-0">
                    ${Number(altPkg.price).toLocaleString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAlternatives((prev) => prev.filter((a) => a !== altId))}
                  className="text-[var(--stage-text-secondary)]/30 hover:text-[var(--color-unusonic-error)]/70 transition-colors focus:outline-none"
                  aria-label="Remove alternative"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add alternative search */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAltSearchOpen(!altSearchOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none"
        >
          <Search size={12} strokeWidth={1.5} />
          Add alternative
        </button>
        {altSearchOpen && (
          <div className="absolute left-0 top-full mt-1 z-20 w-full max-w-xs rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)] overflow-hidden shadow-lg">
            <div className="p-2 border-b border-[oklch(1_0_0_/_0.06)]">
              <input
                type="text"
                value={altSearchQuery}
                onChange={(e) => setAltSearchQuery(e.target.value)}
                placeholder="Search rental items..."
                className={cn(inputClass, 'text-xs py-1.5')}
                autoFocus
              />
            </div>
            <ul className="max-h-48 overflow-y-auto">
              {filteredCandidates.slice(0, 20).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAlternatives((prev) => [...prev, p.id]);
                      setAltSearchQuery('');
                      setAltSearchOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)] transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs tabular-nums text-[var(--stage-text-secondary)]/50 shrink-0">
                      ${Number(p.price).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
              {filteredCandidates.length === 0 && (
                <li className="px-3 py-2 text-xs text-[var(--stage-text-secondary)]/50">
                  No matching rental items
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retail — stock + buffer %
// ---------------------------------------------------------------------------

type RetailSectionProps = {
  stockQuantity: string;
  setStockQuantity: (v: string) => void;
  bufferPercent: string;
  setBufferPercent: (v: string) => void;
};

export function RetailSection({
  stockQuantity,
  setStockQuantity,
  bufferPercent,
  setBufferPercent,
}: RetailSectionProps) {
  return (
    <div className="space-y-4 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-4 bg-[var(--ctx-well)]">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        Retail
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="edit-stock-retail" className={labelClass}>
            Total stock quantity
          </label>
          <input
            id="edit-stock-retail"
            type="number"
            min={0}
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
            className={inputClass}
            placeholder="e.g. 50"
          />
        </div>
        <div>
          <label htmlFor="edit-buffer" className={labelClass}>
            Buffer %
          </label>
          <input
            id="edit-buffer"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={bufferPercent}
            onChange={(e) => setBufferPercent(e.target.value)}
            className={inputClass}
            placeholder="e.g. 10"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bundle CTA — link to Builder
// ---------------------------------------------------------------------------

export function BundleCTA({ id }: { id: string }) {
  return (
    <div className="rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--ctx-well)] p-4">
      <p className="text-sm text-[var(--stage-text-primary)] mb-2">Bundle (Package)</p>
      <p className="text-xs text-[var(--stage-text-secondary)] mb-3">
        Drag ingredients from your catalog into this package in the Builder.
      </p>
      <Link
        href={`/catalog/${id}/builder`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.14)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-primary)] font-medium text-sm hover:bg-[oklch(1_0_0_/_0.08)] transition-colors"
      >
        <LayoutGrid size={18} strokeWidth={1.5} aria-hidden />
        Open in Builder
      </Link>
    </div>
  );
}
