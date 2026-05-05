'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  findMatchingArchetype,
  normalizeEventArchetypeLabel,
  humanizeSlug,
  type EventArchetypeRow,
} from '@/shared/lib/event-archetype';
import {
  listWorkspaceEventArchetypes,
  upsertWorkspaceEventArchetype,
} from '../../actions/event-archetype-actions';

/**
 * Replaces the hardcoded ArchetypeSelect dropdown. Typeahead combobox that
 * (a) shows system + workspace-custom archetypes, (b) filters live on input,
 * (c) exposes a "Create '{typed}'" footer when no normalization match exists,
 * (d) suppresses the footer when an existing archetype would collide with the
 * typed label, (e) commits new types via the server-authoritative upsert RPC
 * so two members typing the same label simultaneously converge on one row.
 *
 * The canonical slug (the analytics spine) is hidden from UI entirely per
 * User Advocate research — owners see "Cigar Tasting", analytics group by
 * `cigar_tasting`.
 */

export type EventTypeComboboxProps = {
  /** Current slug (or null when unselected). */
  value: string | null;
  /** Fires with the new slug after commit (system or custom). */
  onChange: (slug: string | null) => void;
  /** Optional label text above the control. */
  label?: string;
  /** Optional initial preload to avoid a network round-trip on open. */
  initialArchetypes?: EventArchetypeRow[];
};

export function EventTypeCombobox({
  value,
  onChange,
  label = 'Show type',
  initialArchetypes,
}: EventTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [archetypes, setArchetypes] = useState<EventArchetypeRow[]>(initialArchetypes ?? []);
  const [loaded, setLoaded] = useState(Boolean(initialArchetypes && initialArchetypes.length > 0));
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Lazy-load on first open. Refetches when the dropdown reopens after a
  // fresh create, via the revalidation below.
  const load = useCallback(async () => {
    const rows = await listWorkspaceEventArchetypes();
    setArchetypes(rows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  // Focus the input when the dropdown opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const selectedRow = useMemo(
    () => archetypes.find((a) => a.slug === value) ?? null,
    [archetypes, value],
  );
  const selectedLabel = selectedRow?.label ?? (value ? humanizeSlug(value) : null);

  // Filter archetypes by the typed query. Normalization catches case/plural
  // differences so 'wed' surfaces 'Wedding' the same way 'Wedding' does.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return archetypes;
    return archetypes.filter((a) => {
      const hay = (a.label + ' ' + a.slug).toLowerCase();
      return hay.includes(q);
    });
  }, [archetypes, query]);

  // If the typed query normalizes to an existing slug, we suppress the
  // "Create" footer and highlight the match. This is the core dedup lever.
  const dedupMatch = useMemo(() => {
    if (!query.trim()) return null;
    return findMatchingArchetype(query, archetypes);
  }, [query, archetypes]);
  const canOfferCreate = Boolean(query.trim()) && !dedupMatch;

  // Keep activeIndex in bounds as results change.
  useEffect(() => {
    const total = filtered.length + (canOfferCreate ? 1 : 0);
    if (total === 0) setActiveIndex(0);
    else if (activeIndex >= total) setActiveIndex(total - 1);
  }, [filtered.length, canOfferCreate, activeIndex]);

  const commitExisting = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const commitCreate = () => {
    const typed = query.trim();
    if (!typed) return;
    const normalized = normalizeEventArchetypeLabel(typed);
    if (!normalized) {
      toast.error('That label has no usable letters. Try something more descriptive.');
      return;
    }
    startTransition(async () => {
      const res = await upsertWorkspaceEventArchetype(typed);
      if (!res.success) {
        toast.error(res.error ?? 'Could not create type.');
        return;
      }
      // Refresh the list so the new row shows up in the dropdown if it reopens.
      await load();
      onChange(res.row.slug);
      if (res.row.was_created) {
        toast.success(`Added "${res.row.label}"`);
      }
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const total = filtered.length + (canOfferCreate ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, total));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + Math.max(1, total)) % Math.max(1, total));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex < filtered.length) {
        commitExisting(filtered[activeIndex].slug);
      } else if (canOfferCreate) {
        commitCreate();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div>
      {label && <label className="block stage-label mb-1.5">{label}</label>}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
            open
              ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
              : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          )}
        >
          <span className={cn('flex-1 min-w-0 truncate tracking-tight', selectedLabel ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
            {selectedLabel ?? 'Select type'}
          </span>
          <ChevronDown size={14} className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', open && 'rotate-180')} aria-hidden />
        </button>
        {open && createPortal(
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={STAGE_LIGHT}
              role="listbox"
              aria-label="Event type"
              data-surface="raised"
              onMouseDown={(e) => e.stopPropagation()}
              style={(() => {
                const rect = triggerRef.current?.getBoundingClientRect();
                if (!rect) return {};
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropUp = spaceBelow < 320;
                return {
                  position: 'fixed' as const,
                  left: rect.left,
                  width: rect.width,
                  ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
                };
              })()}
              className="flex flex-col max-h-[280px] rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)] overflow-hidden"
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search or create a type…"
                className="stage-input w-full min-w-0 border-0 border-b border-[oklch(1_0_0_/_0.08)] rounded-none focus:outline-none focus:ring-0 bg-transparent px-3 h-9"
              />
              <div className="flex-1 overflow-y-auto">
                {!loaded && (
                  <div className="flex items-center gap-2 px-3 py-3 text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
                    <Loader2 size={12} className="animate-spin" strokeWidth={1.5} />
                    Loading types…
                  </div>
                )}
                {loaded && filtered.length === 0 && !canOfferCreate && (
                  <div className="px-3 py-3 text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
                    No match. Keep typing to create a new type.
                  </div>
                )}
                {loaded && filtered.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    role="option"
                    aria-selected={value === a.slug}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      commitExisting(a.slug);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0',
                      activeIndex === i
                        ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]'
                        : value === a.slug
                          ? 'bg-[oklch(1_0_0/0.05)] text-[var(--stage-text-primary)] font-medium'
                          : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)]',
                    )}
                  >
                    <span className="truncate">{a.label}</span>
                    {a.is_system ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
                        Built-in
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
                        Custom
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {canOfferCreate && (
                <button
                  type="button"
                  role="option"
                  disabled={pending}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    commitCreate();
                  }}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0 border-t border-[oklch(1_0_0_/_0.08)] disabled:opacity-60',
                    activeIndex === filtered.length
                      ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]'
                      : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)]',
                  )}
                >
                  {pending ? (
                    <Loader2 size={12} className="animate-spin shrink-0" strokeWidth={1.5} />
                  ) : (
                    <Plus size={12} className="shrink-0" strokeWidth={1.5} />
                  )}
                  <span className="truncate">
                    Create &quot;{query.trim()}&quot;
                  </span>
                </button>
              )}
              {dedupMatch && query.trim() && (
                <div className="border-t border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-[10px] text-[var(--stage-text-tertiary)] tracking-tight">
                  Matches existing type <span className="text-[var(--stage-text-secondary)]">{dedupMatch.label}</span>.
                </div>
              )}
            </motion.div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
