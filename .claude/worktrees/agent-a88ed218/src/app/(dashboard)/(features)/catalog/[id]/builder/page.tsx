/**
 * Package Builder — Split-screen Studio: Toolbox | Canvas | Inspector.
 * Route: /catalog/[id]/builder
 * Local state for definition; "Save Changes" persists to Supabase.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronLeft, Image, Type, List, PenLine } from 'lucide-react';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { getPackage, updatePackage, getCatalogPackagesWithTags } from '@/features/sales/api/package-actions';
import type { PackageWithTags } from '@/features/sales/api/package-actions';
import { generatePackageDefinition } from '@/features/ai/tools/package-generator';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import type { Package } from '@/types/supabase';
import type {
  PackageDefinition,
  PackageDefinitionBlock,
  PackageDefinitionStaffing,
  LineItemPricingType,
} from '@/features/sales/api/package-actions';
import { CeramicSwitch } from '@/shared/ui/switch';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

const BLOCK_TYPES: { type: string; label: string; icon: typeof Image }[] = [
  { type: 'header_hero', label: 'Package Image', icon: Image },
  { type: 'text_block', label: 'Description / Terms', icon: Type },
  { type: 'line_item_group', label: 'Line Item Group', icon: List },
];

const emptyDefinition: PackageDefinition = { layout: 'standard_v1', blocks: [] };

const emptyStaffing: PackageDefinitionStaffing = { required: false, role: null, defaultStaffId: null, defaultStaffName: null };

/** Create a new block by type (used for both click-to-add and drag-drop insert). */
function createBlockByType(type: string): PackageDefinitionBlock {
  const blockId = `b${Date.now()}`;
  return type === 'header_hero'
    ? { id: blockId, type: 'header_hero', content: { title: '', image: '' } }
    : type === 'line_item_group'
      ? { id: blockId, type: 'line_item_group', label: 'New group', items: [] }
      : type === 'text_block'
        ? { id: blockId, type: 'text_block', content: '' }
        : { id: blockId, type, content: {} };
}

/** Flatten blocks to one line_item per catalog item with quantity (burst method). */
function flattenBlocksToLineItems(blocks: PackageDefinitionBlock[]): PackageDefinitionBlock[] {
  const byId = new Map<string, number>();
  for (const b of blocks) {
    if (b.type === 'line_item' && 'catalogId' in b && 'quantity' in b) {
      const q = Number((b as { quantity: number }).quantity) || 1;
      byId.set((b as { catalogId: string }).catalogId, (byId.get((b as { catalogId: string }).catalogId) ?? 0) + q);
    } else if (b.type === 'line_item_group' && 'items' in b) {
      const items = (b as { items: string[] }).items ?? [];
      for (const id of items) {
        if (id) byId.set(id, (byId.get(id) ?? 0) + 1);
      }
    }
  }
  const ts = Date.now();
  return Array.from(byId.entries()).map(([catalogId, quantity], i) => ({
    id: `b${ts}-${i}`,
    type: 'line_item' as const,
    catalogId,
    quantity,
    pricing_type: 'included' as LineItemPricingType,
  }));
}

function parseDefinition(raw: unknown): PackageDefinition {
  if (raw && typeof raw === 'object' && Array.isArray((raw as { blocks?: unknown }).blocks)) {
    const o = raw as { layout?: string; blocks: unknown[]; staffing?: unknown };
    const layout = typeof o.layout === 'string' ? o.layout : 'standard_v1';
    const blocks = o.blocks as PackageDefinitionBlock[];
    let staffing: PackageDefinition['staffing'] = null;
    if (o.staffing && typeof o.staffing === 'object' && 'required' in o.staffing) {
      const s = o.staffing as PackageDefinitionStaffing;
      staffing = {
        required: !!s.required,
        role: s.role ?? null,
        defaultStaffId: s.defaultStaffId ?? null,
        defaultStaffName: s.defaultStaffName ?? null,
      };
    }
    return { layout, blocks, staffing };
  }
  return { ...emptyDefinition };
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

interface LineItemInspectorProps {
  block: { id: string; type: 'line_item'; catalogId: string; quantity: number; pricing_type?: LineItemPricingType };
  updateBlock: (blockId: string, patch: Partial<PackageDefinitionBlock>) => void;
  labelClass: string;
  inputClass: string;
}

function LineItemInspector({ block, updateBlock, labelClass, inputClass }: LineItemInspectorProps) {
  const [catalogItem, setCatalogItem] = useState<Package | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPackage(block.catalogId).then((result) => {
      if (!cancelled && result.package) setCatalogItem(result.package);
    });
    return () => { cancelled = true; };
  }, [block.catalogId]);

  const quantity = Math.max(1, Number(block.quantity) || 1);
  const included = block.pricing_type !== 'itemized';
  const targetCost = catalogItem?.target_cost != null && Number.isFinite(Number(catalogItem.target_cost))
    ? Number(catalogItem.target_cost)
    : null;
  const totalCostImpact = targetCost != null ? targetCost * quantity : null;

  return (
    <div className="space-y-6">
      {/* 1. Header & Quantity */}
      <div>
        <h3 className="text-sm font-medium text-ceramic tracking-tight mb-1">
          {catalogItem?.name ?? block.catalogId}
        </h3>
        <span
          className={cn(
            'inline-block text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-md',
            'bg-white/10 text-ink-muted border border-[var(--glass-border)]'
          )}
        >
          {(catalogItem?.category as string)?.replace(/_/g, ' ') ?? 'Item'}
        </span>
      </div>

      <div>
        <label className={labelClass}>Quantity</label>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => updateBlock(block.id, { quantity: Math.max(1, quantity - 1) })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={SIGNAL_PHYSICS}
            className="shrink-0 w-10 h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic font-medium text-lg flex items-center justify-center hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            −
          </motion.button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
              updateBlock(block.id, { quantity: v });
            }}
            className={cn(inputClass, 'text-center tabular-nums')}
          />
          <motion.button
            type="button"
            aria-label="Increase quantity"
            onClick={() => updateBlock(block.id, { quantity: quantity + 1 })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={SIGNAL_PHYSICS}
            className="shrink-0 w-10 h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic font-medium text-lg flex items-center justify-center hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            +
          </motion.button>
        </div>
      </div>

      {/* 2. Pricing Strategy */}
      <div className="space-y-3 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
        <p className="text-xs font-medium text-ceramic">Pricing</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">
            Include in base package price
          </span>
          <CeramicSwitch
            checked={included}
            onCheckedChange={(checked) =>
              updateBlock(block.id, { pricing_type: checked ? 'included' : 'itemized' })
            }
            aria-label="Include in base package price"
          />
        </div>
        <p className="text-xs text-ink-muted">
          {included
            ? 'Client sees this item with price "Included."'
            : 'This item adds its own price on top of the package.'}
        </p>
      </div>

      {/* 3. Financial Summary (read-only) */}
      <div className="rounded-xl border border-[var(--glass-border)] p-4 bg-[var(--glass-bg)]/30 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Financial impact</p>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted">Unit cost</span>
          <span className="tabular-nums text-ceramic">{formatCurrency(targetCost)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted">Total cost impact</span>
          <span className="tabular-nums text-ceramic">
            {totalCostImpact != null ? `${formatCurrency(totalCostImpact)} (${quantity} × ${formatCurrency(targetCost)})` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CatalogBuilderPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { workspaceId, hasWorkspace } = useWorkspace();
  const [pkg, setPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<PackageDefinition>(emptyDefinition);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ionModalOpen, setIonModalOpen] = useState(false);
  const [ionPrompt, setIonPrompt] = useState('');
  const [ionLoading, setIonLoading] = useState(false);
  const [ionError, setIonError] = useState<string | null>(null);
  const [catalogPackages, setCatalogPackages] = useState<PackageWithTags[]>([]);

  const loadPackage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const result = await getPackage(id);
    setPkg(result.package ?? null);
    setError(result.error ?? null);
    if (result.package?.definition) {
      setDefinition(parseDefinition(result.package.definition));
    } else {
      setDefinition({ ...emptyDefinition });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadPackage();
  }, [loadPackage]);

  const loadCatalog = useCallback(async () => {
    if (!workspaceId) return;
    const result = await getCatalogPackagesWithTags(workspaceId);
    const list = result.packages ?? [];
    setCatalogPackages(list.filter((p) => p.id !== id));
  }, [workspaceId, id]);

  useEffect(() => {
    if (workspaceId && id) loadCatalog();
  }, [workspaceId, id, loadCatalog]);

  const saveDefinition = useCallback(async () => {
    if (!id || !workspaceId) return;
    setSaving(true);
    const result = await updatePackage(id, { definition });
    setSaving(false);
    if (result.error) setError(result.error);
    else if (result.package) setPkg(result.package);
  }, [id, workspaceId, definition]);

  const addBlock = useCallback((type: string, insertIndex?: number) => {
    const newBlock = createBlockByType(type);
    setDefinition((prev) => {
      const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= prev.blocks.length
        ? insertIndex
        : prev.blocks.length;
      return {
        ...prev,
        blocks: [...prev.blocks.slice(0, idx), newBlock, ...prev.blocks.slice(idx)],
      };
    });
    setSelectedBlockId(newBlock.id);
  }, []);

  const updateBlock = useCallback((blockId: string, patch: Partial<PackageDefinitionBlock>) => {
    setDefinition((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  }, []);

  const updateStaffing = useCallback((patch: Partial<PackageDefinitionStaffing>) => {
    setDefinition((prev) => ({
      ...prev,
      staffing: { ...emptyStaffing, ...prev.staffing, ...patch },
    }));
  }, []);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent, dropIndex?: number) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      let payload: { type?: string; blockType?: string; packageId?: string; name?: string; category?: string };
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      const insertAt = (currentLength: number) =>
        dropIndex != null && dropIndex >= 0 ? Math.min(dropIndex, currentLength) : currentLength;

      // Layout block from toolbox: insert at drop index (or append).
      if (payload.type === 'layout_block' && payload.blockType) {
        addBlock(payload.blockType, dropIndex);
        return;
      }

      const droppedId = payload.packageId;
      const droppedName = payload.name;
      const droppedCategory = payload.category;
      if (!droppedId) return;

      // Burst only: never add a Package as a single block (no structural nesting).
      const isPackage = droppedCategory?.toLowerCase() === 'package';
      if (isPackage) {
        const result = await getPackage(droppedId);
        if (result.error || !result.package?.definition) return;
        const sourceDef = parseDefinition(result.package.definition);
        const sourceBlocks = sourceDef.blocks ?? [];
        const flattened = flattenBlocksToLineItems(sourceBlocks);
        setDefinition((prev) => {
          const idx = insertAt(prev.blocks.length);
          return {
            ...prev,
            blocks: [...prev.blocks.slice(0, idx), ...flattened, ...prev.blocks.slice(idx)],
          };
        });
        toast.success(`Unpacked ${result.package?.name ?? droppedName} into the builder.`);
      } else {
        const blockId = `b${Date.now()}`;
        const newBlock: PackageDefinitionBlock = {
          id: blockId,
          type: 'line_item',
          catalogId: droppedId,
          quantity: 1,
          pricing_type: 'included',
        };
        setDefinition((prev) => {
          const idx = insertAt(prev.blocks.length);
          return {
            ...prev,
            blocks: [...prev.blocks.slice(0, idx), newBlock, ...prev.blocks.slice(idx)],
          };
        });
        setSelectedBlockId(blockId);
      }
    },
    [addBlock]
  );

  const selectedBlock = definition.blocks.find((b) => b.id === selectedBlockId);
  const staffing = definition.staffing ?? emptyStaffing;
  const isService = pkg?.category === 'service';

  const handleIonSubmit = useCallback(async () => {
    if (!workspaceId || !ionPrompt.trim()) return;
    setIonError(null);
    setIonLoading(true);
    const result = await generatePackageDefinition(workspaceId, ionPrompt);
    setIonLoading(false);
    if (result.error) {
      setIonError(result.error);
      return;
    }
    if (result.definition) {
      // Overwrite current definition entirely (user confirmed via Generate).
      setDefinition(parseDefinition(result.definition));
      setIonPrompt('');
      setIonModalOpen(false);
    }
  }, [workspaceId, ionPrompt]);

  const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]';
  const labelClass = 'block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1';

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Select a workspace to edit packages.</p>
        <Link href="/catalog" className="mt-4 text-sm text-neon hover:underline">
          Back to Master menu
        </Link>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm">Loading package…</p>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-ink-muted">
        <p className="text-sm text-[var(--color-signal-error)]">{error ?? 'Package not found.'}</p>
        <Link href="/catalog" className="mt-4 text-sm text-neon hover:underline">
          Back to Master menu
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--sidebar-header-height,4rem))] max-h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-4 shrink-0 px-6 py-4 border-b border-[var(--glass-border)] bg-obsidian/80">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ceramic transition-colors"
        >
          <ChevronLeft size={18} aria-hidden />
          Master menu
        </Link>
        <h1 className="text-lg font-medium text-ceramic tracking-tight truncate flex-1">
          {pkg.name}
        </h1>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => { setIonError(null); setIonModalOpen(true); }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--glass-border)] text-ink-muted hover:text-ceramic hover:bg-[var(--glass-bg-hover)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            title="Ask ION to build this package"
          >
            <LivingLogo size="sm" status="idle" />
            Ask ION
          </motion.button>
          <motion.button
            type="button"
            onClick={saveDefinition}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="px-4 py-2.5 rounded-xl border border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:bg-[var(--color-neon-amber)]/20 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
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
              Describe the package you want. ION will use your catalog and build the blocks for you.
            </p>
            <textarea
              value={ionPrompt}
              onChange={(e) => setIonPrompt(e.target.value)}
              placeholder="e.g. Luxury wedding package for 150 guests. Include full-day photography, 3-piece band, champagne toast. Price around $12k."
              className={cn(inputClass, 'min-h-[120px] resize-y')}
              disabled={ionLoading}
            />
            {ionError && (
              <p className="text-sm text-[var(--color-signal-error)]">{ionError}</p>
            )}
            <motion.button
              type="button"
              onClick={handleIonSubmit}
              disabled={ionLoading || !ionPrompt.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={SIGNAL_PHYSICS}
              className="w-full py-2.5 rounded-xl border border-neon/50 bg-neon/10 text-neon font-medium text-sm hover:bg-neon/20 disabled:opacity-50"
            >
              {ionLoading ? 'Building…' : 'Generate package'}
            </motion.button>
            <p className="text-xs text-ink-muted border-t border-[var(--glass-border)] pt-4 mt-2">
              ION can make mistakes, please double check its work.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 min-h-0">
        {/* Pane 1: Toolbox (left ~20%) */}
        <aside className="w-[20%] min-w-[200px] max-w-[260px] shrink-0 border-r border-[var(--glass-border)] flex flex-col bg-obsidian/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--glass-border)] shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Presentation & Structure
            </h2>
          </div>
          <ul className="p-3 space-y-2 overflow-auto">
            {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
              <motion.li key={type} transition={SIGNAL_PHYSICS}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ type: 'layout_block', blockType: type })
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => addBlock(type)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      addBlock(type);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm liquid-card border border-[var(--glass-border)] cursor-grab active:cursor-grabbing',
                    'text-ink-muted hover:text-ceramic hover:border-white/20 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]'
                  )}
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                    <Icon size={18} className="text-ink-muted" aria-hidden />
                  </div>
                  <span className="font-medium">{label}</span>
                </div>
              </motion.li>
            ))}
          </ul>
          {catalogPackages.length > 0 && (
            <>
              <div className="px-4 py-2 border-t border-[var(--glass-border)] shrink-0">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  From catalog
                </h2>
              </div>
              <ul className="p-3 space-y-2 overflow-auto flex-1 min-h-0">
                {catalogPackages.map((pkg) => (
                  <motion.li key={pkg.id} transition={SIGNAL_PHYSICS}>
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/json',
                          JSON.stringify({ packageId: pkg.id, name: pkg.name, category: pkg.category })
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm liquid-card border border-[var(--glass-border)] cursor-grab active:cursor-grabbing',
                        'text-ink-muted hover:text-ceramic hover:border-white/20 transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]'
                      )}
                    >
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                        <List size={18} className="text-ink-muted" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium block truncate text-ceramic">{pkg.name}</span>
                        <span className="text-xs text-ink-muted capitalize">
                          {(pkg.category as string)?.replace(/_/g, ' ') ?? 'Item'}
                        </span>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </>
          )}
        </aside>

        {/* Pane 2: Canvas (center ~50%, scrollable) */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-signal-void">
          <div className="flex-1 min-h-0 overflow-auto p-6">
            <LiquidPanel
              className="min-h-[360px] p-6 rounded-[28px]"
              onDragOver={handleCanvasDragOver}
              onDrop={(e) => handleCanvasDrop(e)}
            >
              {definition.blocks.length === 0 ? (
                <p className="text-sm text-ink-muted py-12 text-center">
                  Drag blocks here to build your package.
                </p>
              ) : (
                <ul className="space-y-4">
                  {definition.blocks.map((block, index) => (
                    <motion.li
                      key={block.id}
                      layout
                      transition={SIGNAL_PHYSICS}
                      onDragOver={handleCanvasDragOver}
                      onDrop={(e) => handleCanvasDrop(e, index)}
                      className={cn(
                        'rounded-xl border p-4 cursor-pointer transition-colors',
                        selectedBlockId === block.id
                          ? 'border-neon/50 bg-neon/10'
                          : 'border-[var(--glass-border)] hover:border-white/20 hover:bg-white/5'
                      )}
                      onClick={() => setSelectedBlockId(block.id)}
                    >
                      <span className="text-xs uppercase tracking-wider text-ink-muted">
                        {block.type.replace(/_/g, ' ')}
                      </span>
                      {block.type === 'header_hero' && 'content' in block && (
                        <p className="text-ceramic font-medium mt-1">
                          {(block.content as { title?: string }).title || 'Untitled'}
                        </p>
                      )}
                      {block.type === 'line_item' && 'catalogId' in block && (
                        <p className="text-ceramic font-medium mt-1">
                          {catalogPackages.find((p) => p.id === (block as { catalogId: string }).catalogId)?.name ??
                            (block as { catalogId: string }).catalogId}{' '}
                          × {(block as { quantity: number }).quantity ?? 1}
                        </p>
                      )}
                      {block.type === 'line_item_group' && 'label' in block && (
                        <p className="text-ceramic font-medium mt-1">{block.label}</p>
                      )}
                      {block.type === 'text_block' && 'content' in block && (
                        <p className="text-sm text-ink-muted mt-1 line-clamp-2">
                          {(block.content as string) || 'Empty'}
                        </p>
                      )}
                    </motion.li>
                  ))}
                </ul>
              )}
            </LiquidPanel>
          </div>
        </main>

        {/* Pane 3: Inspector (right ~30%) */}
        <aside className="w-[30%] min-w-[240px] max-w-[360px] shrink-0 border-l border-[var(--glass-border)] flex flex-col bg-obsidian/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--glass-border)] shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Inspector
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {!selectedBlock ? (
              <>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-3">
                    Package
                  </h3>
                  <p className="text-sm text-ink-muted mb-4">
                    Select a block in the canvas to edit its settings.
                  </p>
                  {isService && (
                    <div className="space-y-4 rounded-xl border border-[var(--glass-border)] p-4 bg-white/[0.02]">
                      <p className="text-xs font-medium text-ceramic">
                        Staffing requirement
                      </p>
                      <p className="text-xs text-ink-muted">
                        When booked, the system will check for a staff member with the selected role (and optional default person).
                      </p>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staffing.required}
                          onChange={(e) => updateStaffing({ required: e.target.checked })}
                          className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-neon focus:ring-[var(--ring)]"
                        />
                        <span className="text-sm text-ceramic">Requires staff with role</span>
                      </label>
                      {staffing.required && (
                        <>
                          <div>
                            <label className={labelClass}>Role</label>
                            <select
                              value={staffing.role ?? ''}
                              onChange={(e) => updateStaffing({ role: e.target.value || null })}
                              className={inputClass}
                            >
                              <option value="">Select role…</option>
                              <option value="DJ">DJ</option>
                              <option value="Photographer">Photographer</option>
                              <option value="Security">Security</option>
                              <option value="Bartender">Bartender</option>
                              <option value="Caterer">Caterer</option>
                              <option value="Coordinator">Coordinator</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Default staff (named talent)</label>
                            <input
                              type="text"
                              value={staffing.defaultStaffName ?? ''}
                              onChange={(e) => updateStaffing({ defaultStaffName: e.target.value || null })}
                              className={inputClass}
                              placeholder="e.g. DJ Allegra"
                            />
                            <p className="text-xs text-ink-muted mt-1">
                              Optional. Assign a specific person as default for this package.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : selectedBlock.type === 'header_hero' && 'content' in selectedBlock ? (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Image URL</label>
                  <input
                    type="url"
                    value={(selectedBlock.content as { image?: string }).image ?? ''}
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, {
                        content: { ...(selectedBlock.content as object), image: e.target.value },
                      })
                    }
                    className={inputClass}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    type="text"
                    value={(selectedBlock.content as { title?: string }).title ?? ''}
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, {
                        content: { ...(selectedBlock.content as object), title: e.target.value },
                      })
                    }
                    className={inputClass}
                    placeholder="Hero title"
                  />
                </div>
              </div>
            ) : selectedBlock.type === 'text_block' && 'content' in selectedBlock ? (
              <div>
                <label className={labelClass}>Content</label>
                <textarea
                  value={(selectedBlock.content as string) ?? ''}
                  onChange={(e) => updateBlock(selectedBlock.id, { content: e.target.value })}
                  className={cn(inputClass, 'min-h-[120px] resize-y')}
                  placeholder="Enter text…"
                />
              </div>
            ) : selectedBlock.type === 'line_item' && 'catalogId' in selectedBlock ? (
              <LineItemInspector
                block={selectedBlock as { id: string; type: 'line_item'; catalogId: string; quantity: number; pricing_type?: LineItemPricingType }}
                updateBlock={updateBlock}
                labelClass={labelClass}
                inputClass={inputClass}
              />
            ) : selectedBlock.type === 'line_item_group' && 'label' in selectedBlock ? (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Label</label>
                  <input
                    type="text"
                    value={selectedBlock.label ?? ''}
                    onChange={(e) => updateBlock(selectedBlock.id, { label: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Ceremony services"
                  />
                </div>
                <div>
                  <label className={labelClass}>Items (one per line)</label>
                  <textarea
                    value={(selectedBlock.items ?? []).join('\n')}
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, {
                        items: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    className={cn(inputClass, 'min-h-[100px] resize-y')}
                    placeholder="Item 1&#10;Item 2"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{selectedBlock.type} — no editor yet.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
