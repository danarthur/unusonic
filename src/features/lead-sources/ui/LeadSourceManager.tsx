'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, Archive, RotateCcw, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import {
  getAllWorkspaceLeadSources,
  addWorkspaceLeadSource,
  renameWorkspaceLeadSource,
  archiveWorkspaceLeadSource,
  restoreWorkspaceLeadSource,
  removeWorkspaceLeadSource,
  type WorkspaceLeadSource,
} from '../api/lead-source-actions';

const CATEGORIES = [
  { value: 'referral', label: 'Referral' },
  { value: 'digital', label: 'Digital' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'offline', label: 'Offline' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'custom', label: 'Custom' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    referral: 'border-[oklch(1_0_0_/_0.22)] text-[oklch(0.88_0_0)]',
    digital: 'border-[oklch(1_0_0_/_0.18)] text-[oklch(0.84_0_0)]',
    marketplace: 'border-[oklch(1_0_0_/_0.15)] text-[oklch(0.80_0_0)]',
    offline: 'border-[oklch(1_0_0_/_0.12)] text-[oklch(0.76_0_0)]',
    relationship: 'border-[oklch(1_0_0_/_0.10)] text-[oklch(0.72_0_0)]',
    custom: 'border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)]',
  };
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 stage-badge-text uppercase tracking-widest',
      colors[category] ?? colors.custom
    )}>
      {category}
    </span>
  );
}

// =============================================================================
// LeadSourceManager
// =============================================================================

export function LeadSourceManager({ initialSources }: { initialSources: WorkspaceLeadSource[] }) {
  const [sources, setSources] = useState(initialSources);
  const [showArchived, setShowArchived] = useState(false);

  // Add form state
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('custom');
  const [newIsReferral, setNewIsReferral] = useState(false);
  const [adding, setAdding] = useState(false);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const refresh = useCallback(async () => {
    const fresh = await getAllWorkspaceLeadSources();
    setSources(fresh);
  }, []);

  const activeSources = sources.filter((s) => !s.archived_at);
  const archivedSources = sources.filter((s) => !!s.archived_at);

  // Group active sources by category
  const grouped = CATEGORIES.map(({ value, label }) => ({
    category: value,
    label,
    items: activeSources.filter((s) => s.category === value),
  })).filter((g) => g.items.length > 0);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    const result = await addWorkspaceLeadSource({
      label: newLabel.trim(),
      category: newCategory,
      isReferral: newIsReferral,
    });
    setAdding(false);
    if (result.ok) {
      setNewLabel('');
      setNewCategory('custom');
      setNewIsReferral(false);
      toast.success('Lead source added.');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const result = await renameWorkspaceLeadSource({ id, label: renameValue.trim() });
    setRenamingId(null);
    if (result.ok) {
      toast.success('Renamed.');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleArchive = async (id: string) => {
    const result = await archiveWorkspaceLeadSource(id);
    if (result.ok) {
      toast.success('Archived.');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRestore = async (id: string) => {
    const result = await restoreWorkspaceLeadSource(id);
    if (result.ok) {
      toast.success('Restored.');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (id: string) => {
    const result = await removeWorkspaceLeadSource(id);
    if (result.ok) {
      toast.success('Removed.');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const startRename = (source: WorkspaceLeadSource) => {
    setRenamingId(source.id);
    setRenameValue(source.label);
  };

  return (
    <div className="space-y-4">
      {/* Active sources grouped by category */}
      {grouped.map((group) => (
        <div key={group.category} className="stage-panel p-4 rounded-[var(--stage-radius-panel)]">
          <p className="stage-label text-[var(--stage-text-secondary)]/80 mb-3">
            {group.label}
          </p>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
            className="space-y-1.5"
          >
            {group.items.map((source) => (
              <motion.div
                key={source.id}
                variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
                transition={STAGE_LIGHT}
                className="flex items-center gap-3 py-2 px-3 rounded-xl stage-hover overflow-hidden transition-colors group"
              >
                {renamingId === source.id ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(source.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="flex-1 min-w-0 rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-2 py-1 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(source.id)}
                      className="shrink-0 p-1 rounded-[var(--stage-radius-input)] text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 transition-colors"
                    >
                      <Check className="size-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="shrink-0 p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--stage-text-secondary)] transition-colors"
                    >
                      <X className="size-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-[var(--stage-text-primary)] tracking-tight flex-1 min-w-0 truncate">
                      {source.label}
                    </span>
                    {source.is_referral && (
                      <span className="stage-micro shrink-0">
                        referral
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => startRename(source)}
                        className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--stage-text-secondary)] transition-colors"
                        title="Rename"
                      >
                        <Pencil className="size-3" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(source.id)}
                        className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--color-unusonic-warning)] transition-colors"
                        title="Archive"
                      >
                        <Archive className="size-3" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(source.id)}
                        className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--color-unusonic-error)]/80 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="size-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      ))}

      {/* Add form */}
      <div className="stage-panel p-4 rounded-[var(--stage-radius-panel)]">
        <p className="stage-label text-[var(--stage-text-secondary)]/80 mb-3">
          Add source
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Source name..."
              className="flex-1 min-w-0 rounded-xl border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Category)}
              className="rounded-xl border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] appearance-none cursor-pointer"
            >
              {CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsReferral}
                onChange={(e) => setNewIsReferral(e.target.checked)}
                className="rounded border-[var(--stage-border)] bg-[var(--ctx-well)] accent-[var(--stage-accent)] focus-visible:ring-[var(--stage-accent)]"
              />
              <span className="text-xs text-[var(--stage-text-secondary)]">This is a referral source</span>
            </label>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newLabel.trim()}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[var(--stage-text-primary)] transition-colors bg-[var(--stage-surface)] border border-[var(--stage-border-hover)] disabled:opacity-45 disabled:pointer-events-none stage-hover overflow-hidden"
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Archived section */}
      {archivedSources.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)]/70 hover:text-[var(--stage-text-secondary)] transition-colors mb-2"
          >
            {showArchived ? <ChevronDown className="size-3" strokeWidth={1.5} /> : <ChevronRight className="size-3" strokeWidth={1.5} />}
            {archivedSources.length} archived source{archivedSources.length !== 1 ? 's' : ''}
          </button>
          <AnimatePresence>
            {showArchived && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={STAGE_LIGHT}
                className="overflow-hidden"
              >
                <div className="stage-panel p-4 rounded-[var(--stage-radius-panel)] opacity-60">
                  <div className="space-y-1.5">
                    {archivedSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-xl stage-hover overflow-hidden transition-colors group"
                      >
                        <span className="text-sm text-[var(--stage-text-secondary)] tracking-tight flex-1 min-w-0 truncate line-through">
                          {source.label}
                        </span>
                        <CategoryBadge category={source.category} />
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestore(source.id)}
                            className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--color-unusonic-success)] transition-colors"
                            title="Restore"
                          >
                            <RotateCcw className="size-3" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(source.id)}
                            className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)]/50 hover:text-[var(--color-unusonic-error)]/80 transition-colors"
                            title="Delete permanently"
                          >
                            <Trash2 className="size-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
