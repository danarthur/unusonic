/**
 * Package Builder — Split-screen Studio: Toolbox | Canvas | Inspector.
 * Route: /catalog/[id]/builder
 * Local state for definition; "Save Changes" persists to Supabase.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronLeft, GripVertical, Image, List, Type, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { StagePanel } from '@/shared/ui/stage-panel';
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
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
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
        <h3 className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight mb-1">
          {catalogItem?.name ?? block.catalogId}
        </h3>
        <span
          className={cn(
            'inline-block text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-md',
            'bg-[var(--stage-surface)] text-[var(--stage-text-secondary)] border border-[var(--stage-edge-subtle)]'
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
            transition={STAGE_LIGHT}
            className="stage-hover overflow-hidden shrink-0 w-10 h-10 rounded-[var(--stage-radius-button)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
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
            transition={STAGE_LIGHT}
            className="stage-hover overflow-hidden shrink-0 w-10 h-10 rounded-[var(--stage-radius-button)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            +
          </motion.button>
        </div>
      </div>

      {/* 2. Pricing Strategy */}
      <div className="space-y-3 rounded-[var(--stage-radius-nested)] border border-[var(--stage-edge-subtle)] p-4 bg-[var(--stage-void)]">
        <p className="text-xs font-medium text-[var(--stage-text-primary)]">Pricing</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--stage-text-secondary)]">
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
        <p className="text-xs text-[var(--stage-text-secondary)]">
          {included
            ? 'Client sees this item with price "Included."'
            : 'This item adds its own price on top of the package.'}
        </p>
      </div>

      {/* 3. Financial Summary (read-only) */}
      <div className="rounded-[var(--stage-radius-nested)] border border-[var(--stage-edge-subtle)] p-4 bg-[var(--stage-void)] space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Financial impact</p>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--stage-text-secondary)]">Unit cost</span>
          <span className="tabular-nums text-[var(--stage-text-primary)]">{formatCurrency(targetCost)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--stage-text-secondary)]">Total cost impact</span>
          <span className="tabular-nums text-[var(--stage-text-primary)]">
            {totalCostImpact != null ? `${formatCurrency(totalCostImpact)} (${quantity} × ${formatCurrency(targetCost)})` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SortableBlockProps {
  block: PackageDefinitionBlock;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCanvasDragOver: (e: React.DragEvent) => void;
  onCanvasDrop: (e: React.DragEvent, dropIndex?: number) => Promise<void> | void;
  catalogPackages: PackageWithTags[];
}

function SortableBlock({
  block,
  index,
  isSelected,
  onSelect,
  onRemove,
  onCanvasDragOver,
  onCanvasDrop,
  catalogPackages,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      onDragOver={onCanvasDragOver}
      onDrop={(e) => onCanvasDrop(e, index)}
    >
      <div
        className={cn(
          'rounded-[var(--stage-radius-nested)] border p-4 cursor-pointer transition-colors relative group',
          isSelected
            ? 'border-[oklch(1_0_0_/_0.25)] bg-[oklch(1_0_0_/_0.06)] ring-1 ring-[var(--stage-accent)]'
            : 'border-[var(--stage-edge-subtle)] hover:border-[oklch(1_0_0_/_0.15)] stage-hover overflow-hidden',
          isDragging && 'shadow-lg'
        )}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <button
          type="button"
          {...listeners}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1 cursor-grab active:cursor-grabbing text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} strokeWidth={1.5} />
        </button>

        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute right-2 top-2 p-1 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove block"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        {/* Block content */}
        <div className="pl-6 pr-4">
          <span className="text-xs uppercase tracking-wider text-[var(--stage-text-secondary)]">
            {block.type.replace(/_/g, ' ')}
          </span>
          {block.type === 'header_hero' && 'content' in block && (
            <p className="text-[var(--stage-text-primary)] font-medium mt-1">
              {(block.content as { title?: string }).title || 'Untitled'}
            </p>
          )}
          {block.type === 'line_item' && 'catalogId' in block && (
            <p className="text-[var(--stage-text-primary)] font-medium mt-1">
              {catalogPackages.find((p) => p.id === (block as { catalogId: string }).catalogId)?.name ??
                (block as { catalogId: string }).catalogId}{' '}
              × {(block as { quantity: number }).quantity ?? 1}
            </p>
          )}
          {block.type === 'line_item_group' && 'label' in block && (
            <p className="text-[var(--stage-text-primary)] font-medium mt-1">{block.label}</p>
          )}
          {block.type === 'text_block' && 'content' in block && (
            <p className="text-sm text-[var(--stage-text-secondary)] mt-1 line-clamp-2">
              {(block.content as string) || 'Empty'}
            </p>
          )}
        </div>
      </div>
    </li>
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
    queueMicrotask(() => {
      loadPackage();
    });
  }, [loadPackage]);

  const loadCatalog = useCallback(async () => {
    if (!workspaceId) return;
    const result = await getCatalogPackagesWithTags(workspaceId);
    const list = result.packages ?? [];
    setCatalogPackages(list.filter((p) => p.id !== id));
  }, [workspaceId, id]);

  useEffect(() => {
    if (!workspaceId || !id) return;
    queueMicrotask(() => {
      loadCatalog();
    });
  }, [workspaceId, id, loadCatalog]);

  // Compute bundle target cost from ingredient target_costs in catalogPackages
  const estimatedCost = useMemo(() => {
    const lineItems = flattenBlocksToLineItems(definition.blocks);
    const byId = new Map(catalogPackages.map((p) => [p.id, p]));
    let total = 0;
    let hasAny = false;
    for (const item of lineItems) {
      if ('catalogId' in item) {
        const ref = byId.get((item as { catalogId: string }).catalogId);
        if (ref?.target_cost != null && Number.isFinite(Number(ref.target_cost))) {
          total += Number(ref.target_cost) * (('quantity' in item ? Number((item as { quantity: number }).quantity) : 1) || 1);
          hasAny = true;
        }
      }
    }
    return hasAny ? total : 0;
  }, [definition.blocks, catalogPackages]);

  const saveDefinition = useCallback(async () => {
    if (!id || !workspaceId) return;
    setSaving(true);
    const result = await updatePackage(id, {
      definition,
      target_cost: estimatedCost > 0 ? estimatedCost : null,
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else if (result.package) setPkg(result.package);
  }, [id, workspaceId, definition, estimatedCost]);

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

  const removeBlock = useCallback((blockId: string) => {
    setDefinition((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  }, [selectedBlockId]);

  const reorderBlocks = useCallback((activeId: string, overId: string) => {
    setDefinition((prev) => {
      const oldIndex = prev.blocks.findIndex((b) => b.id === activeId);
      const newIndex = prev.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const blocks = [...prev.blocks];
      const [moved] = blocks.splice(oldIndex, 1);
      blocks.splice(newIndex, 0, moved);
      return { ...prev, blocks };
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderBlocks(String(active.id), String(over.id));
    }
  }, [reorderBlocks]);

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
  const isService = pkg?.category === 'service' || pkg?.category === 'talent';

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
    'w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]';
  const labelClass = 'block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1';

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Select a workspace to edit packages.</p>
        <Link href="/catalog" className="mt-4 text-sm text-[var(--stage-accent)] hover:underline">
          Back to Master menu
        </Link>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Loading package…</p>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm text-[var(--color-unusonic-error)]">{error ?? 'Package not found.'}</p>
        <Link href="/catalog" className="mt-4 text-sm text-[var(--stage-accent)] hover:underline">
          Back to Master menu
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--sidebar-header-height,4rem))] max-h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-4 shrink-0 px-6 py-4 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-void)]">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
          Master menu
        </Link>
        <h1 className="text-lg font-medium text-[var(--stage-text-primary)] tracking-tight truncate flex-1">
          {pkg.name}
        </h1>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => { setIonError(null); setIonModalOpen(true); }}
            transition={STAGE_LIGHT}
            className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            title="Ask Aion to build this package"
          >
            <LivingLogo size="sm" status="idle" />
            Ask Aion
          </motion.button>
          <motion.button
            type="button"
            onClick={saveDefinition}
            disabled={saving}
            transition={STAGE_LIGHT}
            className="stage-hover overflow-hidden px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.2)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm disabled:opacity-45"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </motion.button>
        </div>
      </header>

      <Dialog open={ionModalOpen} onOpenChange={setIonModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask Aion</DialogTitle>
            <DialogClose className="stage-hover overflow-hidden p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]" />
          </DialogHeader>
          <div className="px-6 pb-6 flex flex-col gap-4">
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Describe the package you want. Aion will use your catalog and build the blocks for you.
            </p>
            <textarea
              value={ionPrompt}
              onChange={(e) => setIonPrompt(e.target.value)}
              placeholder="e.g. Luxury wedding package for 150 guests. Include full-day photography, 3-piece band, champagne toast. Price around $12k."
              className={cn(inputClass, 'min-h-[120px] resize-y')}
              disabled={ionLoading}
            />
            {ionError && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{ionError}</p>
            )}
            <motion.button
              type="button"
              onClick={handleIonSubmit}
              disabled={ionLoading || !ionPrompt.trim()}
              transition={STAGE_LIGHT}
              className="stage-hover overflow-hidden w-full py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.2)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm disabled:opacity-45"
            >
              {ionLoading ? 'Building…' : 'Generate package'}
            </motion.button>
            <p className="text-xs text-[var(--stage-text-secondary)] border-t border-[var(--stage-edge-subtle)] pt-4 mt-2">
              Aion can make mistakes, please double check its work.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 min-h-0">
        {/* Pane 1: Toolbox (left ~20%) */}
        <aside className="w-[20%] min-w-[200px] max-w-[260px] shrink-0 border-r border-[var(--stage-edge-subtle)] flex flex-col bg-[var(--stage-void)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--stage-edge-subtle)] shrink-0">
            <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Presentation & Structure
            </h2>
          </div>
          <ul className="p-3 space-y-2 overflow-auto">
            {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
              <motion.li key={type} transition={STAGE_LIGHT}>
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
                    'w-full flex items-center gap-3 px-4 py-3 rounded-[var(--stage-radius-nested)] text-left text-sm stage-panel border border-[var(--stage-edge-subtle)] cursor-grab active:cursor-grabbing',
                    'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.15)] transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                  )}
                >
                  <div className="shrink-0 w-9 h-9 rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface)] flex items-center justify-center">
                    <Icon size={18} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" aria-hidden />
                  </div>
                  <span className="font-medium">{label}</span>
                </div>
              </motion.li>
            ))}
          </ul>
          {catalogPackages.length > 0 && (
            <>
              <div className="px-4 py-2 border-t border-[var(--stage-edge-subtle)] shrink-0">
                <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  From catalog
                </h2>
              </div>
              <ul className="p-3 space-y-2 overflow-auto flex-1 min-h-0">
                {catalogPackages.map((pkg) => (
                  <motion.li key={pkg.id} transition={STAGE_LIGHT}>
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
                        'w-full flex items-center gap-3 px-4 py-3 rounded-[var(--stage-radius-nested)] text-left text-sm stage-panel border border-[var(--stage-edge-subtle)] cursor-grab active:cursor-grabbing',
                        'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.15)] transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                      )}
                    >
                      <div className="shrink-0 w-9 h-9 rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface)] flex items-center justify-center">
                        <List size={18} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium block truncate text-[var(--stage-text-primary)]">{pkg.name}</span>
                        <span className="text-xs text-[var(--stage-text-secondary)] capitalize">
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
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--stage-void)]">
          <div className="flex-1 min-h-0 overflow-auto p-6">
            <StagePanel
              className="min-h-[360px] p-6 rounded-[var(--stage-radius-panel)]"
              onDragOver={handleCanvasDragOver}
              onDrop={(e) => handleCanvasDrop(e)}
            >
              {definition.blocks.length === 0 ? (
                <p className="text-sm text-[var(--stage-text-secondary)] py-12 text-center">
                  Drag blocks here to build your package.
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={definition.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-4">
                      {definition.blocks.map((block, index) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          index={index}
                          isSelected={block.id === selectedBlockId}
                          onSelect={() => setSelectedBlockId(block.id)}
                          onRemove={() => removeBlock(block.id)}
                          onCanvasDragOver={handleCanvasDragOver}
                          onCanvasDrop={handleCanvasDrop}
                          catalogPackages={catalogPackages}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </StagePanel>
          </div>
        </main>

        {/* Pane 3: Inspector (right ~30%) */}
        <aside className="w-[30%] min-w-[240px] max-w-[360px] shrink-0 border-l border-[var(--stage-edge-subtle)] flex flex-col bg-[var(--stage-void)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--stage-edge-subtle)] shrink-0">
            <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Inspector
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {!selectedBlock ? (
              <>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-3">
                    Package
                  </h3>
                  <p className="text-sm text-[var(--stage-text-secondary)] mb-4">
                    Select a block in the canvas to edit its settings.
                  </p>
                  {isService && (
                    <div className="space-y-4 rounded-[var(--stage-radius-nested)] border border-[var(--stage-edge-subtle)] p-4 bg-[var(--stage-void)]">
                      <p className="text-xs font-medium text-[var(--stage-text-primary)]">
                        Staffing requirement
                      </p>
                      <p className="text-xs text-[var(--stage-text-secondary)]">
                        When booked, the system will check for a staff member with the selected role (and optional default person).
                      </p>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staffing.required}
                          onChange={(e) => updateStaffing({ required: e.target.checked })}
                          className="rounded border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-accent)] focus-visible:ring-[var(--stage-accent)]"
                        />
                        <span className="text-sm text-[var(--stage-text-primary)]">Requires staff with role</span>
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
                            <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
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
              <p className="text-sm text-[var(--stage-text-secondary)]">{selectedBlock.type} — no editor yet.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
