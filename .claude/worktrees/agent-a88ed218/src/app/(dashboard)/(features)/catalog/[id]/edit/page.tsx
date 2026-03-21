/**
 * Catalog item edit — Simple form for ingredients (Service, Rental, Talent, Retail, Fee).
 * Route: /catalog/[id]/edit
 * Package (bundle) items can open the Builder from here.
 */

'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronLeft, LayoutGrid, HelpCircle } from 'lucide-react';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { getPackage, updatePackage } from '@/features/sales/api/package-actions';
import type { PackageWithTags, PackageCategory, IngredientMeta, PackageDefinition } from '@/features/sales/api/package-actions';
import {
  getWorkspaceTags,
  createWorkspaceTag,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import { SmartTagInput } from '@/shared/ui/smart-tag-input';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

const CATEGORIES: { value: PackageCategory; label: string }[] = [
  { value: 'package', label: 'Package (The Bundle)' },
  { value: 'service', label: 'Service (Labor/Time)' },
  { value: 'rental', label: 'Rental (Inventory)' },
  { value: 'talent', label: 'Talent (Performance)' },
  { value: 'retail_sale', label: 'Retail (Consumables)' },
  { value: 'fee', label: 'Fee (Digital/Admin)' },
];

const STAFF_ROLES = ['DJ', 'Photographer', 'Security', 'Bartender', 'Caterer', 'Coordinator', 'Videographer', 'Other'] as const;

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]';
const labelClass = 'block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1';

export default function CatalogEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { workspaceId, hasWorkspace } = useWorkspace();
  const [pkg, setPkg] = useState<PackageWithTags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PackageCategory>('package');
  const [price, setPrice] = useState('');
  const [floorPrice, setFloorPrice] = useState('');
  const [targetCost, setTargetCost] = useState('');
  const [selectedTags, setSelectedTags] = useState<WorkspaceTag[]>([]);
  const [durationHours, setDurationHours] = useState('');
  const [staffRole, setStaffRole] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [bufferPercent, setBufferPercent] = useState('');
  const [isSubRental, setIsSubRental] = useState(false);
  const [replacementCost, setReplacementCost] = useState('');
  const [bufferDays, setBufferDays] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [showCostHelp, setShowCostHelp] = useState(false);
  const [costHelpPosition, setCostHelpPosition] = useState<{ top: number; left: number } | null>(null);
  const costHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const costHelpCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPriceHelp, setShowPriceHelp] = useState(false);
  const [priceHelpPosition, setPriceHelpPosition] = useState<{ top: number; left: number } | null>(null);
  const priceHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const priceHelpCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFloorHelp, setShowFloorHelp] = useState(false);
  const [floorHelpPosition, setFloorHelpPosition] = useState<{ top: number; left: number } | null>(null);
  const floorHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const floorHelpCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPackage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPackage(id);
      setPkg(result.package ?? null);
      setError(result.error ?? null);
      if (result.package) {
        const p = result.package;
        setName(p.name);
        setDescription(p.description ?? '');
        setCategory((p.category as PackageCategory) ?? 'package');
        setPrice(String(Number(p.price)));
        setFloorPrice(p.floor_price != null ? String(Number(p.floor_price)) : '');
        setTargetCost(p.target_cost != null ? String(Number(p.target_cost)) : '');
        setSelectedTags(
          (p.tags ?? []).map((t) => ({ ...t, workspace_id: p.workspace_id }))
        );
        const meta = (p.definition as { ingredient_meta?: IngredientMeta } | null)?.ingredient_meta;
        if (meta) {
          setDurationHours(meta.duration_hours != null ? String(meta.duration_hours) : '');
          setStaffRole(meta.staff_role ?? '');
          setBufferPercent(meta.buffer_percent != null ? String(meta.buffer_percent) : '');
          setContactInfo(meta.contact_info ?? '');
        } else {
          setDurationHours('');
          setStaffRole('');
          setBufferPercent('');
          setContactInfo('');
        }
        const pkgRow = p as PackageWithTags & { stock_quantity?: number; is_sub_rental?: boolean; replacement_cost?: number | null; buffer_days?: number };
        if ((p.category as string) === 'rental') {
          setStockQuantity(pkgRow.stock_quantity != null ? String(pkgRow.stock_quantity) : (meta?.stock_quantity != null ? String(meta.stock_quantity) : ''));
          setIsSubRental(pkgRow.is_sub_rental === true);
          setReplacementCost(pkgRow.replacement_cost != null ? String(Number(pkgRow.replacement_cost)) : '');
          setBufferDays(pkgRow.buffer_days != null ? String(pkgRow.buffer_days) : '');
        } else if ((p.category as string) === 'retail_sale' && meta) {
          setStockQuantity(meta.stock_quantity != null ? String(meta.stock_quantity) : '');
        } else {
          setStockQuantity('');
          setIsSubRental(false);
          setReplacementCost('');
          setBufferDays('');
        }
      }
    } catch (e) {
      setPkg(null);
      setError(e instanceof Error ? e.message : 'Failed to load item.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPackage();
  }, [loadPackage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !workspaceId) return;
    setFormError(null);
    const nameTrim = name.trim();
    if (!nameTrim) {
      setFormError('Name is required.');
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFormError('Price must be a non-negative number.');
      return;
    }
    if (category === 'rental') {
      const qty = Number(stockQuantity);
      if (!Number.isFinite(qty) || qty < 0) {
        setFormError('Total stock quantity is required for rentals (use 0 if you sub-rent only).');
        return;
      }
    }
    const tagIds = selectedTags.map((t) => t.id);
    const isBundle = category === 'package';
    const existingDef = (pkg?.definition ?? null) as Record<string, unknown> | null;
    const ingredient_meta: IngredientMeta | undefined = isBundle
      ? undefined
      : {
          duration_hours: category === 'service' && durationHours.trim() ? Number(durationHours) || null : null,
          staff_role: category === 'service' && staffRole.trim() ? staffRole : null,
          stock_quantity: category === 'retail_sale' && stockQuantity.trim() ? Number(stockQuantity) || null : null,
          buffer_percent: category === 'retail_sale' && bufferPercent.trim() ? Number(bufferPercent) || null : null,
          contact_info: category === 'talent' && contactInfo.trim() ? contactInfo : null,
        };
    const definition = isBundle
      ? (existingDef as unknown as PackageDefinition) ?? undefined
      : ({
          layout: (existingDef as { layout?: string })?.layout,
          blocks: Array.isArray((existingDef as { blocks?: unknown })?.blocks) ? (existingDef as { blocks: unknown[] }).blocks : [],
          staffing: (existingDef as { staffing?: unknown })?.staffing ?? null,
          ingredient_meta,
        } as PackageDefinition);

    const floorPriceValue = isBundle ? null : (floorPrice.trim() ? (Number(floorPrice) || null) : null);
    const targetCostValue = isBundle ? null : (targetCost.trim() ? (Number(targetCost) || null) : null);
    const rentalPayload =
      category === 'rental'
        ? {
            stock_quantity: Number(stockQuantity) || 0,
            is_sub_rental: isSubRental,
            replacement_cost: replacementCost.trim() ? (Number(replacementCost) || null) : null,
            buffer_days: bufferDays.trim() ? Math.max(0, Math.floor(Number(bufferDays) || 0)) : 0,
          }
        : {};
    setSaving(true);
    const result = await updatePackage(id, {
      name: nameTrim,
      description: description.trim() || null,
      category,
      price: priceNum,
      floor_price: floorPriceValue,
      target_cost: targetCostValue,
      tagIds: tagIds.length ? tagIds : null,
      definition: definition ?? null,
      ...rentalPayload,
    });
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.package) setPkg(result.package);
    router.push('/catalog');
  };

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Select a workspace to edit catalog items.</p>
        <Link href="/catalog" className="mt-4 text-sm text-neon hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Missing item.</p>
        <Link href="/catalog" className="mt-4 text-sm text-neon hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Loading item…</p>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm text-[var(--color-signal-error)]">{error ?? 'Item not found.'}</p>
        <Link href="/catalog" className="mt-4 text-sm text-neon hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  const isBundle = category === 'package';

  return (
    <div className="flex flex-col min-h-0 flex-1 p-6 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-4 shrink-0 mb-6">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ceramic transition-colors"
        >
          <ChevronLeft size={18} aria-hidden />
          Catalog
        </Link>
        <h1 className="text-xl font-medium text-ceramic tracking-tight truncate flex-1">
          Edit item
        </h1>
      </header>

      <LiquidPanel className="rounded-[28px] overflow-hidden flex flex-col flex-1 min-h-0 max-h-[calc(100vh-10rem)]">
        <div className="overflow-y-auto overflow-x-hidden overscroll-contain flex-1 min-h-0 py-2" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-6 px-6 pb-12">
          {formError && (
            <p className="text-sm text-[var(--color-signal-error)]">{formError}</p>
          )}
          <div>
            <label htmlFor="edit-name" className={labelClass}>Name</label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder={isBundle ? 'e.g. Gold Wedding Bundle' : 'e.g. One Hour of Photography'}
              required
            />
          </div>
          <div>
            <label htmlFor="edit-desc" className={labelClass}>Description (optional)</label>
            <textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={cn(inputClass, 'resize-none')}
              placeholder="Included items or notes"
            />
          </div>
          <div>
            <label htmlFor="edit-category" className={labelClass}>Category</label>
            <select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as PackageCategory)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-tags" className={labelClass}>Tags (optional)</label>
            <SmartTagInput
              id="edit-tags"
              workspaceId={workspaceId ?? null}
              value={selectedTags}
              onChange={(tags) =>
                setSelectedTags(
                  tags.map((t) => ({
                    ...t,
                    workspace_id: t.workspace_id ?? workspaceId ?? '',
                  }))
                )
              }
              getWorkspaceTags={getWorkspaceTags}
              createWorkspaceTag={createWorkspaceTag}
              placeholder="Type to search or create…"
            />
          </div>
            <div className="grid grid-cols-2 gap-4">
            <div className={cn(category === 'package' && 'col-span-2')}>
              <div className="flex items-center gap-1.5 mb-1">
                <label htmlFor="edit-price" className={cn(labelClass, '!mb-0')}>
                  {category === 'package' ? 'Starting price' : category === 'service' ? 'Rate' : category === 'rental' ? 'Rental price' : 'Price'}
                </label>
                <button
                  ref={priceHelpTriggerRef}
                  type="button"
                  onMouseEnter={() => {
                    const el = priceHelpTriggerRef.current;
                    if (el && typeof document !== 'undefined') {
                      const r = el.getBoundingClientRect();
                      const w = 260;
                      const h = 72;
                      const left = Math.max(8, Math.min(r.left - w, r.right - w));
                      const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                      setPriceHelpPosition({ top, left });
                      setShowPriceHelp(true);
                    }
                  }}
                  onMouseLeave={() => {
                    priceHelpCloseTimeoutRef.current = setTimeout(() => setShowPriceHelp(false), 120);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (showPriceHelp) setShowPriceHelp(false);
                    else {
                      const el = priceHelpTriggerRef.current;
                      if (el && typeof document !== 'undefined') {
                        const r = el.getBoundingClientRect();
                        const w = 260;
                        const h = 72;
                        const left = Math.max(8, Math.min(r.left - w, r.right - w));
                        const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                        setPriceHelpPosition({ top, left });
                        setShowPriceHelp(true);
                      }
                    }
                  }}
                  className="inline-flex text-ink-muted hover:text-ceramic cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] p-0.5"
                  aria-label="Price help"
                  aria-expanded={showPriceHelp}
                >
                  <HelpCircle size={14} strokeWidth={1.5} />
                </button>
              </div>
              {typeof document !== 'undefined' &&
                showPriceHelp &&
                priceHelpPosition &&
                createPortal(
                  <div
                    className="fixed z-[9999] w-64 max-w-[calc(100vw-16px)] px-3 py-2.5 text-xs font-normal text-ink-muted leading-relaxed rounded-xl border border-[var(--glass-border)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)] backdrop-blur-xl bg-[var(--color-glass-surface)]"
                    style={{ top: priceHelpPosition.top, left: priceHelpPosition.left }}
                    role="tooltip"
                    onMouseEnter={() => {
                      if (priceHelpCloseTimeoutRef.current) {
                        clearTimeout(priceHelpCloseTimeoutRef.current);
                        priceHelpCloseTimeoutRef.current = null;
                      }
                      setShowPriceHelp(true);
                    }}
                    onMouseLeave={() => setShowPriceHelp(false)}
                  >
                    {category === 'package'
                      ? 'The starting price shown for this bundle. Proposal line items can override.'
                      : category === 'service'
                        ? 'What you charge the client per hour or flat rate. Default price used on proposals. Margin = Rate minus Target cost.'
                        : category === 'rental'
                          ? 'What you charge for this rental. Default price used on proposals.'
                          : 'Default selling price for this item. Used on proposals.'}
                  </div>,
                  document.body
                )}
              <CurrencyInput
                id="edit-price"
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
                    <label htmlFor="edit-floor-price" className={cn(labelClass, '!mb-0')}>Floor price (optional)</label>
                    <button
                      ref={floorHelpTriggerRef}
                      type="button"
                      onMouseEnter={() => {
                        const el = floorHelpTriggerRef.current;
                        if (el && typeof document !== 'undefined') {
                          const r = el.getBoundingClientRect();
                          const w = 260;
                          const h = 72;
                          const left = Math.max(8, Math.min(r.left - w, r.right - w));
                          const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                          setFloorHelpPosition({ top, left });
                          setShowFloorHelp(true);
                        }
                      }}
                      onMouseLeave={() => {
                        floorHelpCloseTimeoutRef.current = setTimeout(() => setShowFloorHelp(false), 120);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        if (showFloorHelp) setShowFloorHelp(false);
                        else {
                          const el = floorHelpTriggerRef.current;
                          if (el && typeof document !== 'undefined') {
                            const r = el.getBoundingClientRect();
                            const w = 260;
                            const h = 72;
                            const left = Math.max(8, Math.min(r.left - w, r.right - w));
                            const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                            setFloorHelpPosition({ top, left });
                            setShowFloorHelp(true);
                          }
                        }
                      }}
                      className="inline-flex text-ink-muted hover:text-ceramic cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] p-0.5"
                      aria-label="Floor price help"
                      aria-expanded={showFloorHelp}
                    >
                      <HelpCircle size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  {typeof document !== 'undefined' &&
                    showFloorHelp &&
                    floorHelpPosition &&
                    createPortal(
                      <div
                        className="fixed z-[9999] w-64 max-w-[calc(100vw-16px)] px-3 py-2.5 text-xs font-normal text-ink-muted leading-relaxed rounded-xl border border-[var(--glass-border)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)] backdrop-blur-xl bg-[var(--color-glass-surface)]"
                        style={{ top: floorHelpPosition.top, left: floorHelpPosition.left }}
                        role="tooltip"
                        onMouseEnter={() => {
                          if (floorHelpCloseTimeoutRef.current) {
                            clearTimeout(floorHelpCloseTimeoutRef.current);
                            floorHelpCloseTimeoutRef.current = null;
                          }
                          setShowFloorHelp(true);
                        }}
                        onMouseLeave={() => setShowFloorHelp(false)}
                      >
                        The lowest price you're willing to accept. The system can warn or block quotes below this so you don't sell at a loss. Should be at or above your Target cost.
                      </div>,
                      document.body
                    )}
                  <CurrencyInput
                    id="edit-floor-price"
                    value={floorPrice}
                    onChange={setFloorPrice}
                    placeholder="Lowest acceptable"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label htmlFor="edit-target-cost" className={cn(labelClass, '!mb-0')}>
                      {category === 'rental' && isSubRental ? 'Vendor Rental Cost' : 'Target cost'}
                    </label>
                    <button
                      ref={costHelpTriggerRef}
                      type="button"
                      onMouseEnter={() => {
                        const el = costHelpTriggerRef.current;
                        if (el && typeof document !== 'undefined') {
                          const r = el.getBoundingClientRect();
                          const w = 224;
                          const h = 72;
                          const left = Math.max(8, Math.min(r.left - w, r.right - w));
                          const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                          setCostHelpPosition({ top, left });
                          setShowCostHelp(true);
                        }
                      }}
                      onMouseLeave={() => {
                        costHelpCloseTimeoutRef.current = setTimeout(() => setShowCostHelp(false), 120);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        if (showCostHelp) {
                          setShowCostHelp(false);
                        } else {
                          const el = costHelpTriggerRef.current;
                          if (el && typeof document !== 'undefined') {
                            const r = el.getBoundingClientRect();
                            const w = 224;
                            const h = 72;
                            const left = Math.max(8, Math.min(r.left - w, r.right - w));
                            const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
                            setCostHelpPosition({ top, left });
                            setShowCostHelp(true);
                          }
                        }
                      }}
                      className="inline-flex text-ink-muted hover:text-ceramic cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] p-0.5"
                      aria-label="Target cost help"
                      aria-expanded={showCostHelp}
                    >
                      <HelpCircle size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  {typeof document !== 'undefined' &&
                    showCostHelp &&
                    costHelpPosition &&
                    createPortal(
                      <div
                        className="fixed z-[9999] w-56 px-3 py-2.5 text-xs font-normal text-ink-muted leading-relaxed rounded-xl border border-[var(--glass-border)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)] backdrop-blur-xl bg-[var(--color-glass-surface)]"
                        style={{ top: costHelpPosition.top, left: costHelpPosition.left }}
                        role="tooltip"
                        onMouseEnter={() => {
                          if (costHelpCloseTimeoutRef.current) {
                            clearTimeout(costHelpCloseTimeoutRef.current);
                            costHelpCloseTimeoutRef.current = null;
                          }
                          setShowCostHelp(true);
                        }}
                        onMouseLeave={() => setShowCostHelp(false)}
                      >
                        {category === 'service'
                          ? 'Your internal cost per hour (or flat rate) to provide this service. Used for profit margin.'
                          : category === 'rental'
                            ? 'Replacement cost or sub-rental cost. Used for profit margin.'
                            : category === 'talent'
                              ? 'Payout to talent. Used for profit margin.'
                              : 'Your internal cost to provide this item. Used for profit margin.'}
                      </div>,
                      document.body
                    )}
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

          {category === 'service' && (
            <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Service</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-duration" className={labelClass}>Duration (hours)</label>
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
                  <label htmlFor="edit-staff-role" className={labelClass}>Staff role</label>
                  <select
                    id="edit-staff-role"
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select role…</option>
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {category === 'rental' && (
            <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Inventory & Fulfillment
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-stock" className={labelClass}>
                    Total stock quantity <span className="text-[var(--color-signal-error)]">*</span>
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
                  <p className="text-xs text-ink-muted mt-1">
                    How many units you own or can fulfill. Used to prevent overbooking.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSubRental}
                      onChange={(e) => setIsSubRental(e.target.checked)}
                      className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-neon focus:ring-[var(--ring)]"
                    />
                    <span className="text-sm text-ceramic">We sub-rent this item from another vendor</span>
                  </label>
                  <p className="text-xs text-ink-muted mt-1">
                    When checked, Target Cost becomes Vendor Rental Cost (what the vendor charges you).
                  </p>
                </div>
                <div>
                  <label htmlFor="edit-replacement-cost" className={labelClass}>Replacement cost</label>
                  <CurrencyInput
                    id="edit-replacement-cost"
                    value={replacementCost}
                    onChange={setReplacementCost}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-ink-muted mt-1">
                    What you will charge the client if this item is destroyed or lost.
                  </p>
                </div>
                <div>
                  <label htmlFor="edit-buffer-days" className={labelClass}>Prep / buffer days</label>
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
                  <p className="text-xs text-ink-muted mt-1">
                    How many days this item needs for cleaning/prep before it can be rented again.
                  </p>
                </div>
              </div>
            </div>
          )}

          {category === 'retail_sale' && (
            <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Retail</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-stock-retail" className={labelClass}>Total stock quantity</label>
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
                  <label htmlFor="edit-buffer" className={labelClass}>Buffer %</label>
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
          )}

          {category === 'talent' && (
            <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Talent</p>
              <div>
                <label htmlFor="edit-contact" className={labelClass}>Contact info</label>
                <input
                  id="edit-contact"
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. agent email or link to contact"
                />
              </div>
            </div>
          )}

          {isBundle && (
            <div className="rounded-xl border border-neon/30 bg-neon/5 p-4">
              <p className="text-sm text-ceramic mb-2">Bundle (Package)</p>
              <p className="text-xs text-ink-muted mb-3">
                Drag ingredients from your catalog into this package in the Builder.
              </p>
              <Link
                href={`/catalog/${id}/builder`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neon/50 bg-neon/10 text-neon font-medium text-sm hover:bg-neon/20 transition-colors"
              >
                <LayoutGrid size={18} aria-hidden />
                Open in Builder
              </Link>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/catalog')}
              className="flex-1 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Cancel
            </button>
            <motion.button
              type="submit"
              disabled={saving}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:bg-[var(--color-neon-amber)]/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {saving ? 'Saving…' : 'Save'}
            </motion.button>
          </div>
        </form>
        </div>
      </LiquidPanel>
    </div>
  );
}
