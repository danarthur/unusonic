/**
 * Create / Edit catalog item modal.
 * All form state is owned by the parent — this component renders the Dialog UI.
 */

'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { SmartTagInput } from '@/shared/ui/smart-tag-input';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { CeramicSwitch } from '@/shared/ui/switch';
import {
  getWorkspaceTags,
  createWorkspaceTag,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import type { PackageCategory } from '@/features/sales/api/package-actions';
import { cn } from '@/shared/lib/utils';

const CATEGORIES: { value: PackageCategory; label: string }[] = [
  { value: 'package', label: 'Package (The Bundle)' },
  { value: 'service', label: 'Service (Labor/Time)' },
  { value: 'rental', label: 'Rental (Inventory)' },
  { value: 'talent', label: 'Talent (Performance)' },
  { value: 'retail_sale', label: 'Retail (Consumables)' },
  { value: 'fee', label: 'Fee (Digital/Admin)' },
];

export interface CreateItemModalState {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: PackageCategory;
  setCategory: (v: PackageCategory) => void;
  price: string;
  setPrice: (v: string) => void;
  floorPrice: string;
  setFloorPrice: (v: string) => void;
  targetCost: string;
  setTargetCost: (v: string) => void;
  selectedTags: WorkspaceTag[];
  setSelectedTags: (tags: WorkspaceTag[]) => void;
  stockQuantity: string;
  setStockQuantity: (v: string) => void;
  isSubRental: boolean;
  setIsSubRental: (v: boolean) => void;
  replacementCost: string;
  setReplacementCost: (v: string) => void;
  bufferDays: string;
  setBufferDays: (v: string) => void;
  isTaxable: boolean;
  setIsTaxable: (v: boolean) => void;
  unitType: 'flat' | 'hour' | 'day';
  setUnitType: (v: 'flat' | 'hour' | 'day') => void;
  unitMultiplier: string;
  setUnitMultiplier: (v: string) => void;
}

interface CreateItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  formError: string | null;
  saving: boolean;
  workspaceId: string;
  state: CreateItemModalState;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

function HelpTooltip({
  triggerLabel,
  content,
}: {
  triggerLabel: string;
  content: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const calcPos = () => {
    const el = triggerRef.current;
    if (!el || typeof document === 'undefined') return;
    const r = el.getBoundingClientRect();
    const w = 260;
    const h = 72;
    const left = Math.max(8, Math.min(r.left - w, r.right - w));
    const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
    setPos({ top, left });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => {
          calcPos();
          setShow(true);
        }}
        onMouseLeave={() => {
          closeTimeoutRef.current = setTimeout(() => setShow(false), 120);
        }}
        onClick={(e) => {
          e.preventDefault();
          if (show) {
            setShow(false);
          } else {
            calcPos();
            setShow(true);
          }
        }}
        className="inline-flex text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] p-0.5"
        aria-label={triggerLabel}
        aria-expanded={show}
      >
        <HelpCircle size={14} strokeWidth={1.5} />
      </button>
      {typeof document !== 'undefined' &&
        show &&
        pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-64 max-w-[calc(100vw-16px)] px-3 py-2.5 text-xs font-normal text-[var(--stage-text-secondary)] leading-relaxed rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)] bg-[var(--stage-surface-raised)]"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
            onMouseEnter={() => {
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
              setShow(true);
            }}
            onMouseLeave={() => setShow(false)}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

export function CreateItemModal({
  open,
  onOpenChange,
  editingId,
  formError,
  saving,
  workspaceId,
  state,
  onSubmit,
  onClose,
}: CreateItemModalProps) {
  const {
    name, setName,
    description, setDescription,
    category, setCategory,
    price, setPrice,
    floorPrice, setFloorPrice,
    targetCost, setTargetCost,
    selectedTags, setSelectedTags,
    stockQuantity, setStockQuantity,
    isSubRental, setIsSubRental,
    replacementCost, setReplacementCost,
    bufferDays, setBufferDays,
    isTaxable, setIsTaxable,
    unitType, setUnitType,
    unitMultiplier, setUnitMultiplier,
  } = state;

  const priceHelpContent =
    category === 'package'
      ? 'The starting price shown for this bundle. Proposal line items can override.'
      : category === 'service'
        ? 'What you charge the client per hour or flat rate. Default price used on proposals. Margin = Rate minus Target cost.'
        : category === 'rental'
          ? 'What you charge for this rental. Default price used on proposals.'
          : 'Default selling price for this item. Used on proposals.';

  const costHelpContent =
    category === 'service'
      ? 'Your internal cost per hour (or flat rate) to provide this service. Used for profit margin.'
      : category === 'rental'
        ? 'Replacement cost or sub-rental cost. Used for profit margin.'
        : category === 'talent'
          ? 'Payout to talent. Used for profit margin.'
          : 'Your internal cost to provide this item. Used for profit margin.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md flex flex-col max-h-[90vh] min-h-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editingId ? 'Edit catalog item' : 'New catalog item'}</DialogTitle>
          <DialogClose className="p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]" />
        </DialogHeader>
        <div
          className="overflow-y-auto overflow-x-hidden overscroll-contain py-2"
          style={{ maxHeight: 'calc(90vh - 5.5rem)' }}
        >
          <form onSubmit={onSubmit} className="flex flex-col gap-4 px-6 pt-4 pb-10">
            {formError && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{formError}</p>
            )}

            {/* Name */}
            <div>
              <label
                htmlFor="cat-name"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
              >
                Name
              </label>
              <input
                id="cat-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
                placeholder="e.g. Gold Wedding Package"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="cat-desc"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="cat-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] resize-none"
                placeholder="Included items or notes"
              />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="cat-category"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
              >
                Category
              </label>
              <select
                id="cat-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PackageCategory)}
                className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label
                htmlFor="cat-tags"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
              >
                Tags (optional)
              </label>
              <SmartTagInput
                id="cat-tags"
                workspaceId={workspaceId}
                value={selectedTags}
                onChange={(tags) =>
                  setSelectedTags(
                    tags.map((t) => ({
                      ...t,
                      workspace_id: t.workspace_id ?? workspaceId ?? '',
                    })),
                  )
                }
                getWorkspaceTags={getWorkspaceTags}
                createWorkspaceTag={createWorkspaceTag}
                placeholder="Type to search or create..."
              />
            </div>

            {/* Price + Floor + Cost grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(category === 'package' && 'col-span-2')}>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    htmlFor="cat-price"
                    className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]"
                  >
                    {unitType === 'hour'
                      ? 'Rate per hour'
                      : unitType === 'day'
                        ? 'Rate per day'
                        : category === 'package'
                          ? 'Starting price'
                          : category === 'service'
                            ? 'Rate'
                            : category === 'rental'
                              ? 'Rental price'
                              : 'Price'}
                  </label>
                  <HelpTooltip triggerLabel="Price help" content={priceHelpContent} />
                </div>
                <CurrencyInput
                  id="cat-price"
                  value={price}
                  onChange={setPrice}
                  placeholder="0.00"
                  required
                />
              </div>
              {category !== 'package' && (
                <>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor="cat-floor-price"
                        className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]"
                      >
                        Floor price (optional)
                      </label>
                      <HelpTooltip
                        triggerLabel="Floor price help"
                        content="The lowest price you're willing to accept. The system can warn or block quotes below this so you don't sell at a loss. Should be at or above your Target cost."
                      />
                    </div>
                    <CurrencyInput
                      id="cat-floor-price"
                      value={floorPrice}
                      onChange={setFloorPrice}
                      placeholder="Lowest acceptable"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor="cat-target-cost"
                        className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]"
                      >
                        {category === 'rental' && isSubRental ? 'Vendor Rental Cost' : 'Target cost'}
                      </label>
                      <HelpTooltip triggerLabel="Target cost help" content={costHelpContent} />
                    </div>
                    <CurrencyInput
                      id="cat-target-cost"
                      value={targetCost}
                      onChange={setTargetCost}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Billing type */}
            {category !== 'package' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1.5">
                  Billing type
                </label>
                <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)]">
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
                    <label
                      htmlFor="cat-default-units"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
                    >
                      Default {unitType === 'hour' ? 'hours' : 'days'} (optional)
                    </label>
                    <input
                      id="cat-default-units"
                      type="number"
                      min={0.25}
                      step={0.25}
                      value={unitMultiplier}
                      onChange={(e) => setUnitMultiplier(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={unitType === 'hour' ? 'e.g. 4 (minimum hours)' : 'e.g. 2'}
                    />
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                      Pre-fills when added to proposals. Can be adjusted per event.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Rental fields */}
            {category === 'rental' && (
              <div className="space-y-4 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] p-4 bg-[var(--stage-surface-nested)]">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                  Inventory &amp; Fulfillment
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="cat-stock"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
                    >
                      Total stock quantity{' '}
                      <span className="text-[var(--color-unusonic-error)]">*</span>
                    </label>
                    <input
                      id="cat-stock"
                      type="number"
                      min={0}
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
                      placeholder="e.g. 100"
                      required
                    />
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                      How many units you own or can fulfill. Use 0 if you sub-rent only.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSubRental}
                        onChange={(e) => setIsSubRental(e.target.checked)}
                        className="rounded border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] accent-[var(--stage-accent)] focus:ring-[var(--stage-accent)]"
                      />
                      <span className="text-sm text-[var(--stage-text-primary)]">
                        We sub-rent this item from another vendor
                      </span>
                    </label>
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                      When checked, Target Cost is the vendor rental cost.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="cat-replacement-cost"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
                    >
                      Replacement cost
                    </label>
                    <CurrencyInput
                      id="cat-replacement-cost"
                      value={replacementCost}
                      onChange={setReplacementCost}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                      What you charge the client if this item is destroyed or lost.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="cat-buffer-days"
                      className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1"
                    >
                      Prep / buffer days
                    </label>
                    <select
                      id="cat-buffer-days"
                      value={bufferDays}
                      onChange={(e) => setBufferDays(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
                    >
                      <option value="">—</option>
                      <option value="0">0 days</option>
                      <option value="1">1 day</option>
                      <option value="2">2 days</option>
                      <option value="3">3 days</option>
                    </select>
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                      Days needed for cleaning/prep before it can be rented again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Taxable */}
            {category !== 'package' && (
              <div className="flex items-center justify-between gap-3 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.10)] px-4 py-3 bg-[var(--stage-surface-nested)]">
                <div>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">Taxable</p>
                  <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                    Include sales tax on this item when added to a proposal.
                  </p>
                </div>
                <CeramicSwitch
                  checked={isTaxable}
                  onCheckedChange={(checked) => setIsTaxable(checked)}
                  aria-label="Taxable"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] font-medium text-sm hover:bg-[var(--stage-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.22)] bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] font-medium text-sm hover:brightness-[1.06] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                {saving ? 'Saving...' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
