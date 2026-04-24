/**
 * Catalog page — Master Menu (working on the business).
 * Create, Edit, Delete, and Archive master packages.
 * Route: /catalog
 */

'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { Plus, RefreshCw } from 'lucide-react';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { createPackageWithION } from '@/features/ai/tools/package-generator';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { StagePanel } from '@/shared/ui/stage-panel';
import { createPackage, updatePackage } from '@/features/sales/api/package-actions';
import { backfillWorkspaceEmbeddings } from '@/features/sales/api/catalog-embeddings';
import { catalogQueries } from '@/features/sales/api/queries';
import { queryKeys } from '@/shared/api/query-keys';
import type { PackageWithTags } from '@/features/sales/api/package-actions';
import type { PackageCategory } from '@/features/sales/api/package-actions';
import type { WorkspaceTag } from '@/features/sales/api/workspace-tag-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import {
  bulkArchivePackages,
  bulkRestorePackages,
  bulkAdjustPrice,
  bulkSetTaxStatus,
} from '@/features/sales/api/catalog-bulk-actions';

import { CatalogCard } from './components/catalog-card';
import { CatalogToolbar } from './components/catalog-toolbar';
import { CatalogTimeline } from './components/catalog-timeline';
import { CreateItemModal, type CreateItemModalState } from './components/create-item-modal';
import { CatalogTable } from './components/catalog-table';
import { BulkActionBar } from './components/bulk-action-bar';
import { CsvImportModal } from './components/csv-import-modal';
import { CsvExportButton } from './components/csv-export-button';
import { ArchivedItemsView } from './components/archived-items-view';
import { SmartViewBar } from './components/smart-view-bar';
import { useCatalogKeyboard } from './hooks/use-catalog-keyboard';
import { useSmartViews } from './hooks/use-smart-views';

/** Tab value for macro-organization; "all" shows every category. */
type CatalogTab = 'all' | PackageCategory;

export default function CatalogPageClient() {
  const router = useRouter();
  const { workspaceId, hasWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: packagesResult, isLoading: loading, error: queryError } = useQuery({
    ...catalogQueries.list(workspaceId ?? ''),
    enabled: !!workspaceId,
  });
  const packages = packagesResult?.packages ?? [];
  const error = packagesResult?.error ?? queryError?.message ?? null;
  const invalidateCatalog = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all(workspaceId ?? '') }),
    [queryClient, workspaceId],
  );
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
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'timeline'>('grid');
  const [showArchived, setShowArchived] = useState(false);
  const [ionModalOpen, setIonModalOpen] = useState(false);
  const [ionPrompt, setIonPrompt] = useState('');
  const [ionLoading, setIonLoading] = useState(false);
  const [ionError, setIonError] = useState<string | null>(null);
  const [stockQuantity, setStockQuantity] = useState('');
  const [isSubRental, setIsSubRental] = useState(false);
  const [replacementCost, setReplacementCost] = useState('');
  const [bufferDays, setBufferDays] = useState('');
  const [isTaxable, setIsTaxable] = useState(true);
  const [unitType, setUnitType] = useState<'flat' | 'hour' | 'day'>('flat');
  const [unitMultiplier, setUnitMultiplier] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const { views: smartViews, saveView: saveSmartView, deleteView: deleteSmartView } = useSmartViews(workspaceId);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const seen = new Map<string, WorkspaceTag>();
    packages.forEach((p) =>
      (p.tags ?? []).forEach((t) =>
        seen.set(t.id, { ...t, workspace_id: p.workspace_id })
      )
    );
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [packages]);

  const fuse = useMemo(
    () =>
      new Fuse(packages, {
        keys: ['name', 'description', { name: 'tags.label', weight: 0.5 }],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
      }),
    [packages]
  );

  const filteredPackages = useMemo(() => {
    // Start with fuzzy search or full list
    let list: PackageWithTags[];
    if (searchQuery.trim()) {
      list = fuse.search(searchQuery.trim()).map((r) => r.item);
    } else {
      list = packages;
    }
    // Apply category, tag, and archived filters on top
    if (!showArchived) {
      list = list.filter((p) => p.is_active !== false);
    }
    if (activeCategoryTab !== 'all') {
      list = list.filter((p) => (p.category as string) === activeCategoryTab);
    }
    if (tagFilterId) {
      list = list.filter((p) => (p.tags ?? []).some((t) => t.id === tagFilterId));
    }
    return list;
  }, [packages, fuse, showArchived, activeCategoryTab, tagFilterId, searchQuery]);

  // No loadPackages — useQuery handles fetching and caching automatically

  // Smart defaults: Brochure (grid) for All/Packages, Ledger (table) for ingredients.
  // Do not override if user is in timeline mode — that's an explicit choice.
  useEffect(() => {
    queueMicrotask(() => {
      setViewMode((prev) => {
        if (prev === 'timeline') return prev;
        if (activeCategoryTab === 'all' || activeCategoryTab === 'package') return 'grid';
        return 'table';
      });
    });
  }, [activeCategoryTab]);

  // Auto-set taxable default and billing type when category changes during create (not edit)
  useEffect(() => {
    if (!modalOpen || editingId) return;
    queueMicrotask(() => {
      setIsTaxable(category !== 'service' && category !== 'fee');
      setUnitType(category === 'service' ? 'hour' : 'flat');
      setUnitMultiplier('');
    });
  }, [category, modalOpen, editingId]);

  // Clear selection and active view on manual filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveViewId(null);
  }, [activeCategoryTab, searchQuery, tagFilterId]);

  // Debounce search query for semantic search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Semantic search via useQuery — runs async, never blocks fuzzy results
  const { data: semanticRawResults = [], isLoading: semanticLoading } = useQuery({
    ...catalogQueries.semanticSearch(workspaceId ?? '', debouncedSearch),
  });

  const semanticResults = useMemo(() => {
    if (!semanticRawResults.length) return [];
    const fuzzyIds = new Set(filteredPackages.map((p) => p.id));
    return semanticRawResults
      .filter((r) => !fuzzyIds.has(r.packageId))
      .map((r) => packages.find((p) => p.id === r.packageId))
      .filter(Boolean) as PackageWithTags[];
  }, [semanticRawResults, filteredPackages, packages]);

  const handleRebuildIndex = useCallback(async () => {
    if (!workspaceId || rebuildingIndex) return;
    setRebuildingIndex(true);
    setRebuildProgress('Starting...');
    try {
      const result = await backfillWorkspaceEmbeddings(workspaceId);
      setRebuildProgress(`Done. ${result.processed} indexed${result.errors > 0 ? `, ${result.errors} errors` : ''}.`);
      setTimeout(() => setRebuildProgress(null), 4000);
    } catch {
      setRebuildProgress('Failed to rebuild index.');
      setTimeout(() => setRebuildProgress(null), 4000);
    } finally {
      setRebuildingIndex(false);
    }
  }, [workspaceId, rebuildingIndex]);

  // Bulk action handlers
  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const { error } = await bulkArchivePackages(ids);
    if (!error) { setSelectedIds(new Set()); invalidateCatalog(); }
  }, [selectedIds, invalidateCatalog]);

  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const { error } = await bulkRestorePackages(ids);
    if (!error) { setSelectedIds(new Set()); invalidateCatalog(); }
  }, [selectedIds, invalidateCatalog]);

  const handleBulkAdjustPrice = useCallback(async (percent: number) => {
    const ids = Array.from(selectedIds);
    const { error } = await bulkAdjustPrice(ids, percent);
    if (!error) { setSelectedIds(new Set()); invalidateCatalog(); }
  }, [selectedIds, invalidateCatalog]);

  const handleBulkSetTaxable = useCallback(async (taxable: boolean) => {
    const ids = Array.from(selectedIds);
    const { error } = await bulkSetTaxStatus(ids, taxable);
    if (!error) { setSelectedIds(new Set()); invalidateCatalog(); }
  }, [selectedIds, invalidateCatalog]);

  // Smart view selection — apply saved filters and set activeViewId
  const handleSelectSmartView = useCallback((view: { id: string; filters: { categoryTab: 'all' | PackageCategory; tagFilterId: string | null; searchQuery: string } }) => {
    // Set filters without triggering the "clear activeViewId" effect by batching
    setActiveCategoryTab(view.filters.categoryTab);
    setTagFilterId(view.filters.tagFilterId);
    setSearchQuery(view.filters.searchQuery);
    // Set activeViewId in a microtask so it runs after the effect clears it
    queueMicrotask(() => setActiveViewId(view.id));
  }, []);

  // Archived view restore handler
  const handleArchivedRestore = useCallback(async (ids: string[]) => {
    const { error } = await bulkRestorePackages(ids);
    if (!error) invalidateCatalog();
  }, [invalidateCatalog]);

  // Check if current filters are empty (for smart view save button visibility)
  const currentFiltersEmpty = activeCategoryTab === 'all' && !tagFilterId && !searchQuery.trim();

  const openCreate = useCallback(() => {
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
    setIsTaxable(true);
    setUnitType('flat');
    setUnitMultiplier('');
    setFormError(null);
    setModalOpen(true);
  }, []);

  // Keyboard navigation
  const { focusedIndex } = useCatalogKeyboard({
    packages: filteredPackages,
    onOpenCreate: openCreate,
    searchInputRef,
    viewMode,
  });

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
        is_taxable: isTaxable,
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
        is_taxable: isTaxable,
        unit_type: category === 'package' ? 'flat' : unitType,
        unit_multiplier: unitMultiplier.trim() ? (Number(unitMultiplier) || null) : null,
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
        invalidateCatalog();
        router.push(isBundle ? `/catalog/${result.package.id}/builder` : `/catalog/${result.package.id}/edit`);
        return;
      }
      invalidateCatalog();
      return;
    }
    setSaving(false);
    closeModal();
    invalidateCatalog();
  };

  const handleArchive = async (pkg: PackageWithTags) => {
    const result = await updatePackage(pkg.id, { is_active: !pkg.is_active });
    if (!result.error) invalidateCatalog();
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
      invalidateCatalog();
      router.push(`/catalog/${result.packageId}/builder`);
    }
  };

  const modalState: CreateItemModalState = {
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
  };

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Select a workspace to manage your catalog.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[var(--stage-text-primary)] tracking-tight">
            Master menu
          </h1>
          <p className="text-sm text-[var(--stage-text-secondary)] mt-1">
            Define your standard offerings. Use in proposals via Add from Catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setIonError(null); setIonModalOpen(true); }}
            className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.15)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <LivingLogo size="sm" status="idle" />
            Ask Aion
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <Plus size={18} strokeWidth={1.5} aria-hidden />
            New Item
          </button>
        </div>
      </header>

      {/* Aion modal */}
      <Dialog open={ionModalOpen} onOpenChange={setIonModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask Aion</DialogTitle>
            <DialogClose className="p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]" />
          </DialogHeader>
          <div className="px-6 pb-6 flex flex-col gap-4">
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Describe the package you want. Aion will create it and open the builder so you can tweak it.
            </p>
            <textarea
              value={ionPrompt}
              onChange={(e) => setIonPrompt(e.target.value)}
              placeholder="e.g. Luxury wedding package for 150 guests. Full-day photography, 3-piece band, champagne toast. Around $12k."
              className="w-full min-h-[120px] px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] resize-y"
              disabled={ionLoading}
            />
            {ionError && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{ionError}</p>
            )}
            <button
              type="button"
              onClick={handleIonCreate}
              disabled={ionLoading || !ionPrompt.trim()}
              className="stage-hover overflow-hidden w-full py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.18)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] font-medium text-sm disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              {ionLoading ? 'Creating...' : 'Create with Aion'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-sm text-[var(--stage-text-secondary)] py-12 text-center">Loading...</div>
      ) : error ? (
        <p className="text-sm text-[var(--color-unusonic-error)]">{error}</p>
      ) : packages.length === 0 ? (
        /* Empty state */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StagePanel className="p-12 rounded-[var(--stage-radius-panel)] text-center flex flex-col items-center justify-center">
            <p className="text-[var(--stage-text-secondary)] mb-4">No catalog items yet.</p>
            <p className="text-sm text-[var(--stage-text-secondary)] mb-6">
              Add services, rentals, and talent (ingredients), then bundle them into packages.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <Plus size={18} strokeWidth={1.5} /> Create your first item
            </button>
          </StagePanel>
          <StagePanel className="p-8 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--stage-void)] flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <LivingLogo size="md" status="idle" className="shrink-0" />
              <h3 className="text-lg font-medium text-[var(--stage-text-primary)] tracking-tight">Ask Aion</h3>
            </div>
            <p className="text-sm text-[var(--stage-text-secondary)] mb-4 flex-1">
              Describe the package you want in plain language. Aion will create it from your catalog and open the builder.
            </p>
            <button
              type="button"
              onClick={() => { setIonError(null); setIonModalOpen(true); }}
              className="stage-hover overflow-hidden w-full inline-flex items-center justify-center gap-2 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.15)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <LivingLogo size="sm" status="idle" /> Describe &amp; create
            </button>
          </StagePanel>
        </div>
      ) : showArchived ? (
        /* Dedicated archived items view */
        <ArchivedItemsView
          packages={packages}
          onRestore={handleArchivedRestore}
          onDelete={() => { invalidateCatalog(); }}
          onBack={() => setShowArchived(false)}
        />
      ) : (
        <>
          <CatalogToolbar
            activeCategoryTab={activeCategoryTab}
            onCategoryChange={setActiveCategoryTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            allTags={allTags}
            tagFilterId={tagFilterId}
            onTagFilterChange={setTagFilterId}
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onImportClick={() => setCsvImportOpen(true)}
            exportSlot={<CsvExportButton packages={filteredPackages} />}
            searchInputRef={searchInputRef}
            rebuildSlot={
              <button
                type="button"
                onClick={handleRebuildIndex}
                disabled={rebuildingIndex}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                title="Rebuild search index"
              >
                <RefreshCw size={14} strokeWidth={1.5} className={rebuildingIndex ? 'animate-spin' : ''} aria-hidden />
                {rebuildProgress ?? 'Rebuild index'}
              </button>
            }
            smartViewSlot={
              <SmartViewBar
                views={smartViews}
                activeViewId={activeViewId}
                onSelectView={handleSelectSmartView}
                onSaveCurrentView={(name) => {
                  saveSmartView(name, {
                    categoryTab: activeCategoryTab,
                    tagFilterId,
                    searchQuery,
                  });
                }}
                onDeleteView={deleteSmartView}
                currentFiltersEmpty={currentFiltersEmpty}
              />
            }
          />

          <BulkActionBar
            selectedCount={selectedIds.size}
            onArchive={handleBulkArchive}
            onRestore={handleBulkRestore}
            onAdjustPrice={handleBulkAdjustPrice}
            onSetTaxable={handleBulkSetTaxable}
            onClearSelection={() => setSelectedIds(new Set())}
          />

          {/* Grid (cards) */}
          {viewMode === 'grid' ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]"
              role="list"
            >
              {filteredPackages.length === 0 ? (
                <p className="col-span-full text-sm text-[var(--stage-text-secondary)] py-12 text-center">
                  No items match this tab and filter.
                </p>
              ) : (
                filteredPackages.map((pkg, idx) => (
                  <CatalogCard
                    key={pkg.id}
                    pkg={pkg}
                    onArchive={handleArchive}
                    isFocused={focusedIndex === idx}
                  />
                ))
              )}
              {searchQuery.trim().length >= 3 && semanticResults.length > 0 && (
                <>
                  <div className="col-span-full flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" />
                    <span className="text-xs text-[var(--stage-text-secondary)] uppercase tracking-wider">
                      Related
                    </span>
                    <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" />
                  </div>
                  {semanticResults.map((pkg) => (
                    <CatalogCard key={`semantic-${pkg.id}`} pkg={pkg} onArchive={handleArchive} />
                  ))}
                </>
              )}
              {semanticLoading && searchQuery.trim().length >= 3 && (
                <p className="col-span-full text-xs text-[var(--stage-text-secondary)] text-center py-2">
                  Searching with Aion...
                </p>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
            <CatalogTimeline
              packages={filteredPackages}
              workspaceId={workspaceId}
            />
          ) : (
            <CatalogTable
              packages={filteredPackages}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onArchive={handleArchive}
              focusedPackageId={focusedIndex != null ? filteredPackages[focusedIndex]?.id ?? null : null}
              semanticResults={searchQuery.trim().length >= 3 ? semanticResults : []}
              semanticLoading={semanticLoading && searchQuery.trim().length >= 3}
            />
          )}
        </>
      )}

      {/* Create/Edit modal */}
      <CreateItemModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingId={editingId}
        formError={formError}
        saving={saving}
        workspaceId={workspaceId}
        state={modalState}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {/* CSV import modal */}
      <CsvImportModal
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        workspaceId={workspaceId}
        onImported={() => invalidateCatalog()}
      />
    </div>
  );
}
