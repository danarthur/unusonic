/**
 * Catalog page — Master Menu (working on the business).
 * Create, Edit, Delete, and Archive master packages.
 * Route: /catalog
 */

'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Pencil, Archive, ArchiveRestore, LayoutGrid, LayoutList, HelpCircle } from 'lucide-react';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { createPackageWithION } from '@/features/ai/tools/package-generator';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { getCatalogPackagesWithTags, createPackage, updatePackage } from '@/features/sales/api/package-actions';
import type { PackageWithTags } from '@/features/sales/api/package-actions';
import type { PackageCategory } from '@/features/sales/api/package-actions';
import {
  getWorkspaceTags,
  createWorkspaceTag,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import { SmartTagInput } from '@/shared/ui/smart-tag-input';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';

const CATEGORIES: { value: PackageCategory; label: string }[] = [
  { value: 'package', label: 'Package (The Bundle)' },
  { value: 'service', label: 'Service (Labor/Time)' },
  { value: 'rental', label: 'Rental (Inventory)' },
  { value: 'talent', label: 'Talent (Performance)' },
  { value: 'retail_sale', label: 'Retail (Consumables)' },
  { value: 'fee', label: 'Fee (Digital/Admin)' },
];

/** Tab value for macro-organization; "all" shows every category. */
type CatalogTab = 'all' | PackageCategory;

const CATALOG_TABS: { value: CatalogTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'package', label: 'Packages' },
  { value: 'service', label: 'Services' },
  { value: 'rental', label: 'Rentals' },
  { value: 'talent', label: 'Talent' },
  { value: 'retail_sale', label: 'Retail' },
  { value: 'fee', label: 'Fees' },
];

export default function CatalogPage() {
  const router = useRouter();
  const { workspaceId, hasWorkspace } = useWorkspace();
  const [packages, setPackages] = useState<PackageWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PackageCategory>('package');
  const [price, setPrice] = useState('');
  const [floorPrice, setFloorPrice] = useState('');
  const [targetCost, setTargetCost] = useState('');
  const [selectedTags, setSelectedTags] = useState<WorkspaceTag[]>([]);
  const [tagFilterId, setTagFilterId] = useState<string | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<CatalogTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [ionModalOpen, setIonModalOpen] = useState(false);
  const [ionPrompt, setIonPrompt] = useState('');
  const [ionLoading, setIonLoading] = useState(false);
  const [ionError, setIonError] = useState<string | null>(null);
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
  const [stockQuantity, setStockQuantity] = useState('');
  const [isSubRental, setIsSubRental] = useState(false);
  const [replacementCost, setReplacementCost] = useState('');
  const [bufferDays, setBufferDays] = useState('');

  const allTags = useMemo(() => {
    const seen = new Map<string, WorkspaceTag>();
    packages.forEach((p) =>
      (p.tags ?? []).forEach((t) =>
        seen.set(t.id, { ...t, workspace_id: p.workspace_id })
      )
    );
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [packages]);

  const filteredPackages = useMemo(() => {
    let list = packages;
    if (activeCategoryTab !== 'all') {
      list = list.filter((p) => (p.category as string) === activeCategoryTab);
    }
    if (tagFilterId) {
      list = list.filter((p) => (p.tags ?? []).some((t) => t.id === tagFilterId));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [packages, activeCategoryTab, tagFilterId, searchQuery]);

  const loadPackages = useCallback(async (opts?: { silent?: boolean }) => {
    if (!workspaceId) {
      setPackages([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    const result = await getCatalogPackagesWithTags(workspaceId);
    setPackages(result.packages ?? []);
    setError(result.error ?? null);
    if (!opts?.silent) setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Smart defaults: Brochure (grid) for All/Packages, Ledger (table) for ingredients
  useEffect(() => {
    if (activeCategoryTab === 'all' || activeCategoryTab === 'package') {
      setViewMode('grid');
    } else {
      setViewMode('table');
    }
  }, [activeCategoryTab]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCategory('package');
    setPrice('');
    setFloorPrice('');
    setTargetCost('');
    setSelectedTags([]);
    setStockQuantity('');
    setIsSubRental(false);
    setReplacementCost('');
    setBufferDays('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (pkg: PackageWithTags) => {
    setEditingId(pkg.id);
    setName(pkg.name);
    setDescription(pkg.description ?? '');
    setCategory((pkg.category as PackageCategory) ?? 'package');
    setPrice(String(Number(pkg.price)));
    setFloorPrice(pkg.floor_price != null ? String(Number(pkg.floor_price)) : '');
    setTargetCost(pkg.target_cost != null ? String(Number(pkg.target_cost)) : '');
    setSelectedTags(
      (pkg.tags ?? []).map((t) => ({ ...t, workspace_id: pkg.workspace_id }))
    );
    const row = pkg as PackageWithTags & { stock_quantity?: number; is_sub_rental?: boolean; replacement_cost?: number | null; buffer_days?: number };
    if ((pkg.category as string) === 'rental') {
      setStockQuantity(row.stock_quantity != null ? String(row.stock_quantity) : '');
      setIsSubRental(row.is_sub_rental === true);
      setReplacementCost(row.replacement_cost != null ? String(Number(row.replacement_cost)) : '');
      setBufferDays(row.buffer_days != null ? String(row.buffer_days) : '');
    } else {
      setStockQuantity('');
      setIsSubRental(false);
      setReplacementCost('');
      setBufferDays('');
    }
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;
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
    const isPackage = category === 'package';
    const floorPriceValue = isPackage ? null : (floorPrice.trim() ? (Number(floorPrice) || null) : null);
    const targetCostValue = isPackage ? null : (targetCost.trim() ? (Number(targetCost) || null) : null);
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
    if (editingId) {
      const result = await updatePackage(editingId, {
        name: nameTrim,
        description: description.trim() || null,
        category,
        price: priceNum,
        floor_price: floorPriceValue,
        target_cost: targetCostValue,
        tagIds: tagIds.length ? tagIds : null,
        ...(category === 'rental'
          ? {
              stock_quantity: Number(stockQuantity) || 0,
              is_sub_rental: isSubRental,
              replacement_cost: replacementCost.trim() ? (Number(replacementCost) || null) : null,
              buffer_days: bufferDays.trim() ? Math.max(0, Math.floor(Number(bufferDays) || 0)) : 0,
            }
          : {}),
      });
      if (result.error) {
        setFormError(result.error);
        setSaving(false);
        return;
      }
    } else {
      const result = await createPackage(workspaceId, {
        name: nameTrim,
        description: description.trim() || null,
        category,
        price: priceNum,
        floor_price: floorPriceValue,
        target_cost: targetCostValue,
        tagIds: tagIds.length ? tagIds : null,
        ...rentalPayload,
      });
      if (result.error) {
        setFormError(result.error);
        setSaving(false);
        return;
      }
      setSaving(false);
      closeModal();
      setTagFilterId(null);
      if (result.package?.id) {
        const isBundle = category === 'package';
        loadPackages({ silent: true });
        router.push(isBundle ? `/catalog/${result.package.id}/builder` : `/catalog/${result.package.id}/edit`);
        return;
      }
      await loadPackages();
      return;
    }
    setSaving(false);
    closeModal();
    await loadPackages();
  };

  const handleArchive = async (pkg: PackageWithTags) => {
    const result = await updatePackage(pkg.id, { is_active: !pkg.is_active });
    if (!result.error) await loadPackages();
  };

  const handleIonCreate = async () => {
    if (!workspaceId || !ionPrompt.trim()) return;
    setIonError(null);
    setIonLoading(true);
    const result = await createPackageWithION(workspaceId, ionPrompt);
    setIonLoading(false);
    if (result.error) {
      setIonError(result.error);
      return;
    }
    if (result.packageId) {
      setIonPrompt('');
      setIonModalOpen(false);
      await loadPackages();
      router.push(`/catalog/${result.packageId}/builder`);
    }
  };

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Select a workspace to manage your catalog.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ceramic tracking-tight">
            Master menu
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Define your standard offerings. Use in proposals via Add from Catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => { setIonError(null); setIonModalOpen(true); }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-neon/40 bg-neon/10 text-neon font-medium text-sm hover:bg-neon/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <LivingLogo size="sm" status="idle" />
            Ask ION
          </motion.button>
          <motion.button
            type="button"
            onClick={openCreate}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Plus size={18} aria-hidden />
            New Item
          </motion.button>
        </div>
      </header>

      <Dialog open={ionModalOpen} onOpenChange={setIonModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask ION</DialogTitle>
            <DialogClose className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5" />
          </DialogHeader>
          <div className="px-6 pb-6 flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              Describe the package you want. ION will create it and open the builder so you can tweak it.
            </p>
            <textarea
              value={ionPrompt}
              onChange={(e) => setIonPrompt(e.target.value)}
              placeholder="e.g. Luxury wedding package for 150 guests. Full-day photography, 3-piece band, champagne toast. Around $12k."
              className="w-full min-h-[120px] px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-y"
              disabled={ionLoading}
            />
            {ionError && (
              <p className="text-sm text-[var(--color-signal-error)]">{ionError}</p>
            )}
            <motion.button
              type="button"
              onClick={handleIonCreate}
              disabled={ionLoading || !ionPrompt.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="w-full py-2.5 rounded-xl border border-neon/50 bg-neon/10 text-neon font-medium text-sm hover:bg-neon/20 disabled:opacity-50"
            >
              {ionLoading ? 'Creating…' : 'Create with ION'}
            </motion.button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-sm text-ink-muted py-12 text-center">Loading…</div>
      ) : error ? (
        <p className="text-sm text-[var(--color-signal-error)]">{error}</p>
      ) : packages.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LiquidPanel className="p-12 rounded-[28px] text-center flex flex-col items-center justify-center">
            <p className="text-ink-muted mb-4">No catalog items yet.</p>
            <p className="text-sm text-ink-muted mb-6">
              Add services, rentals, and talent (ingredients), then bundle them into packages.
            </p>
            <motion.button
              type="button"
              onClick={openCreate}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)]"
            >
              <Plus size={18} /> New Item
            </motion.button>
          </LiquidPanel>
          <LiquidPanel className="p-8 rounded-[28px] border border-neon/30 bg-neon/5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <LivingLogo size="md" status="idle" className="shrink-0" />
              <h3 className="text-lg font-medium text-ceramic tracking-tight">Ask ION</h3>
            </div>
            <p className="text-sm text-ink-muted mb-4 flex-1">
              Describe the package you want in plain language. ION will create it from your catalog and open the builder.
            </p>
            <motion.button
              type="button"
              onClick={() => { setIonError(null); setIonModalOpen(true); }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-neon/50 bg-neon/10 text-neon font-medium text-sm hover:bg-neon/20"
            >
              <LivingLogo size="sm" status="idle" /> Describe & create
            </motion.button>
          </LiquidPanel>
        </div>
      ) : (
        <>
          {/* Macro: Category tabs */}
          <div
            role="tablist"
            aria-label="Catalog category"
            className="flex flex-wrap gap-1 border-b border-[var(--glass-border)] pb-2"
          >
            {CATALOG_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeCategoryTab === tab.value}
                onClick={() => setActiveCategoryTab(tab.value)}
                className={cn(
                  'px-4 py-2.5 rounded-t-xl text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                  activeCategoryTab === tab.value
                    ? 'bg-[var(--glass-bg)] border border-[var(--glass-border)] border-b-transparent -mb-0.5 text-ceramic'
                    : 'border border-transparent text-ink-muted hover:text-ceramic hover:bg-white/5'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Micro: Search + tag filter + view toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or description…"
              className="flex-1 min-w-[200px] max-w-sm px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              aria-label="Search catalog"
            />
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Tag
                </span>
                <button
                  type="button"
                  onClick={() => setTagFilterId(null)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                    tagFilterId === null
                      ? 'bg-neon/20 text-neon border border-neon/40'
                      : 'border border-[var(--glass-border)] text-ink-muted hover:text-ceramic hover:bg-white/5'
                  )}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setTagFilterId(tag.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                      tagFilterId === tag.id
                        ? 'bg-neon/20 text-neon border border-neon/40'
                        : 'border border-[var(--glass-border)] text-ink-muted hover:text-ceramic hover:bg-white/5'
                    )}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-0.5 ml-auto" role="group" aria-label="View mode">
              <motion.button
                type="button"
                onClick={() => setViewMode('grid')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={SIGNAL_PHYSICS}
                className={cn(
                  'p-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                  viewMode === 'grid'
                    ? 'bg-neon/20 text-neon border border-neon/40'
                    : 'border border-transparent text-ink-muted hover:text-ceramic hover:bg-white/5'
                )}
                aria-label="Card grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid size={18} aria-hidden />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setViewMode('table')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={SIGNAL_PHYSICS}
                className={cn(
                  'p-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                  viewMode === 'table'
                    ? 'bg-neon/20 text-neon border border-neon/40'
                    : 'border border-transparent text-ink-muted hover:text-ceramic hover:bg-white/5'
                )}
                aria-label="Table view"
                aria-pressed={viewMode === 'table'}
              >
                <LayoutList size={18} aria-hidden />
              </motion.button>
            </div>
          </div>

          {/* Grid (cards) or Table */}
          {viewMode === 'grid' ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]"
              role="list"
            >
              {filteredPackages.length === 0 ? (
                <p className="col-span-full text-sm text-ink-muted py-12 text-center">
                  No items match this tab and filter.
                </p>
              ) : (
                filteredPackages.map((pkg) => {
                  const def = pkg.definition as { blocks?: { type: string; content?: { image?: string; title?: string } }[] } | null;
                  const heroBlock = def?.blocks?.find((b) => b.type === 'header_hero');
                  const heroImage = heroBlock?.content?.image;
                  return (
                    <motion.article
                      key={pkg.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
                      whileTap={{ scale: 0.98 }}
                      transition={SIGNAL_PHYSICS}
                      className={cn(
                        'liquid-card p-6 rounded-[28px] flex flex-col gap-4',
                        !pkg.is_active && 'opacity-70 border-dashed'
                      )}
                    >
                      {heroImage && (
                        <div className="aspect-video rounded-xl overflow-hidden bg-white/5 -mx-2 mt-2">
                          <img
                            src={heroImage}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h2 className="text-ceramic font-medium tracking-tight truncate">
                            {pkg.name}
                          </h2>
                          {!pkg.is_active && (
                            <span className="shrink-0 text-xs uppercase tracking-wider text-ink-muted">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="text-xl font-semibold text-ceramic tracking-tight tabular-nums">
                          ${Number(pkg.price).toLocaleString()}
                        </p>
                        {pkg.description && (
                          <p className="text-sm text-ink-muted mt-2 line-clamp-3">
                            {pkg.description}
                          </p>
                        )}
                        <p className="text-xs text-ink-muted mt-2 capitalize">
                          {String(pkg.category).replace(/_/g, ' ')}
                        </p>
                        {(pkg.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(pkg.tags ?? []).slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-ink-muted"
                              >
                                {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-2 border-t border-[var(--glass-border)]">
                        {pkg.category === 'package' ? (
                          <Link
                            href={`/catalog/${pkg.id}/builder`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            aria-label={`Build ${pkg.name}`}
                          >
                            <LayoutGrid size={16} aria-hidden />
                            Build
                          </Link>
                        ) : (
                          <Link
                            href={`/catalog/${pkg.id}/edit`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            aria-label={`Edit ${pkg.name}`}
                          >
                            <Pencil size={16} aria-hidden />
                            Edit
                          </Link>
                        )}
                        <motion.button
                          type="button"
                          onClick={() => handleArchive(pkg)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          transition={SIGNAL_PHYSICS}
                          className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          aria-label={pkg.is_active ? 'Archive' : 'Restore'}
                        >
                          {pkg.is_active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                        </motion.button>
                      </div>
                    </motion.article>
                  );
                })
              )}
            </div>
          ) : (
          <div className="liquid-card rounded-[28px] border border-[var(--glass-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] bg-white/[0.02]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Name
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted tabular-nums">
                      Base price
                    </th>
                    {(activeCategoryTab === 'rental' || activeCategoryTab === 'retail_sale') && (
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted tabular-nums">
                        Stock
                      </th>
                    )}
                    {(activeCategoryTab === 'service' || activeCategoryTab === 'talent') && (
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted tabular-nums">
                        Est. cost
                      </th>
                    )}
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Tags
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted w-32">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          4 +
                          (activeCategoryTab === 'rental' || activeCategoryTab === 'retail_sale' ? 1 : 0) +
                          (activeCategoryTab === 'service' || activeCategoryTab === 'talent' ? 1 : 0)
                        }
                        className="px-4 py-12 text-center text-sm text-ink-muted"
                      >
                        No items match this tab and filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPackages.map((pkg) => (
                      <motion.tr
                        key={pkg.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={SIGNAL_PHYSICS}
                        className={cn(
                          'border-b border-[var(--glass-border)] last:border-b-0 hover:bg-white/[0.02]',
                          !pkg.is_active && 'opacity-70'
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-ceramic truncate block max-w-[240px]" title={pkg.name}>
                            {pkg.name}
                          </span>
                          {!pkg.is_active && (
                            <span className="text-xs uppercase tracking-wider text-ink-muted">Archived</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ceramic">
                          ${Number(pkg.price).toLocaleString()}
                        </td>
                        {(activeCategoryTab === 'rental' || activeCategoryTab === 'retail_sale') && (
                          <td className="px-4 py-3 tabular-nums text-ink-muted">
                            {String((pkg as PackageWithTags & { stock_quantity?: number }).stock_quantity ?? '—')}
                          </td>
                        )}
                        {(activeCategoryTab === 'service' || activeCategoryTab === 'talent') && (
                          <td className="px-4 py-3 tabular-nums text-ink-muted">
                            {pkg.target_cost != null ? `$${Number(pkg.target_cost).toLocaleString()}` : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(pkg.tags ?? []).slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-ink-muted"
                              >
                                {t.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {pkg.category === 'package' ? (
                              <Link
                                href={`/catalog/${pkg.id}/builder`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                                aria-label={`Build ${pkg.name}`}
                              >
                                <LayoutGrid size={16} aria-hidden />
                                Build
                              </Link>
                            ) : (
                              <Link
                                href={`/catalog/${pkg.id}/edit`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                                aria-label={`Edit ${pkg.name}`}
                              >
                                <Pencil size={16} aria-hidden />
                                Edit
                              </Link>
                            )}
                            <motion.button
                              type="button"
                              onClick={() => handleArchive(pkg)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              transition={SIGNAL_PHYSICS}
                              className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              aria-label={pkg.is_active ? 'Archive' : 'Restore'}
                            >
                              {pkg.is_active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh] min-h-0">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingId ? 'Edit catalog item' : 'New catalog item'}</DialogTitle>
            <DialogClose className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5" />
          </DialogHeader>
          <div className="overflow-y-auto overflow-x-hidden overscroll-contain py-2" style={{ maxHeight: 'calc(90vh - 5.5rem)' }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pt-4 pb-10">
            {formError && (
              <p className="text-sm text-[var(--color-signal-error)]">{formError}</p>
            )}
            <div>
              <label htmlFor="cat-name" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Name
              </label>
              <input
                id="cat-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="e.g. Gold Wedding Package"
                required
              />
            </div>
            <div>
              <label htmlFor="cat-desc" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Description (optional)
              </label>
              <textarea
                id="cat-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                placeholder="Included items or notes"
              />
            </div>
            <div>
              <label htmlFor="cat-category" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Category
              </label>
              <select
                id="cat-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PackageCategory)}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cat-tags" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
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
                  <label htmlFor="cat-price" className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
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
                      <label htmlFor="cat-floor-price" className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
                        Floor price (optional)
                      </label>
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
                      id="cat-floor-price"
                      value={floorPrice}
                      onChange={setFloorPrice}
                      placeholder="Lowest acceptable"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label htmlFor="cat-target-cost" className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
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
                      id="cat-target-cost"
                      value={targetCost}
                      onChange={setTargetCost}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>
            {category === 'rental' && (
              <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Inventory & Fulfillment
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="cat-stock" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                      Total stock quantity <span className="text-[var(--color-signal-error)]">*</span>
                    </label>
                    <input
                      id="cat-stock"
                      type="number"
                      min={0}
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      placeholder="e.g. 100"
                      required
                    />
                    <p className="text-xs text-ink-muted mt-1">How many units you own or can fulfill. Use 0 if you sub-rent only.</p>
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
                    <p className="text-xs text-ink-muted mt-1">When checked, Target Cost is the vendor rental cost.</p>
                  </div>
                  <div>
                    <label htmlFor="cat-replacement-cost" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">Replacement cost</label>
                    <CurrencyInput
                      id="cat-replacement-cost"
                      value={replacementCost}
                      onChange={setReplacementCost}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-ink-muted mt-1">What you charge the client if this item is destroyed or lost.</p>
                  </div>
                  <div>
                    <label htmlFor="cat-buffer-days" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">Prep / buffer days</label>
                    <select
                      id="cat-buffer-days"
                      value={bufferDays}
                      onChange={(e) => setBufferDays(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      <option value="">—</option>
                      <option value="0">0 days</option>
                      <option value="1">1 day</option>
                      <option value="2">2 days</option>
                      <option value="3">3 days</option>
                    </select>
                    <p className="text-xs text-ink-muted mt-1">Days needed for cleaning/prep before it can be rented again.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:bg-[var(--color-neon-amber)]/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
