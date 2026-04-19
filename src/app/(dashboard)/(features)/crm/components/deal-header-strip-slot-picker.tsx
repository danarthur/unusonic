'use client';

/**
 * Inline search popover used by the deal header strip for the
 * client / venue / planner slots. Portaled to document.body with a
 * data-header-picker marker so outside-click dismissal can detect it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Building2, Loader2, MapPin, Plus, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { searchNetworkOrgs, type NetworkSearchOrg } from '@/features/network-data';
import { searchReferrerEntities } from '../actions/search-referrer';

export type SlotType = 'venue' | 'planner' | 'client' | 'poc';

const SLOT_META: Record<SlotType, { entityTypeFilter?: string; ghostLabel: string }> = {
  venue: { entityTypeFilter: 'venue', ghostLabel: 'Add as venue' },
  planner: { ghostLabel: 'Add as planner' },
  client: { ghostLabel: 'Add as client' },
  poc: { ghostLabel: 'Add as point of contact' },
};

export function EntityIcon({
  entityType,
  className,
}: {
  entityType: string | null | undefined;
  className?: string;
}) {
  const cls = cn('shrink-0', className ?? 'size-3');
  if (entityType === 'person' || entityType === 'couple') return <User className={cls} />;
  if (entityType === 'venue') return <MapPin className={cls} />;
  return <Building2 className={cls} />;
}

export function SlotPicker({
  sourceOrgId,
  slot,
  onSelect,
  onGhostCreate,
  onClear,
  onClose,
  triggerRect,
}: {
  sourceOrgId: string;
  slot: SlotType;
  onSelect: (org: NetworkSearchOrg) => void;
  onGhostCreate: (name: string) => Promise<void>;
  onClear?: () => void;
  onClose: () => void;
  triggerRect: { top: number; left: number } | null;
}) {
  const { entityTypeFilter, ghostLabel } = SLOT_META[slot];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NetworkSearchOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 1) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        if (slot === 'planner' || slot === 'poc') {
          // Planner + POC both search the workspace's referrer/team roster.
          // POC is typically a person already known to the workspace (a host,
          // the planner, or a day-of coordinator they've worked with before).
          const refs = await searchReferrerEntities(q);
          setResults(
            refs.map(
              (r) =>
                ({
                  id: r.id,
                  entity_uuid: r.id,
                  name: r.subtitle ? `${r.name}` : r.name,
                  entity_type: r.subtitle ? 'person' : 'company',
                  _source: r.section === 'team' ? ('connection' as const) : ('global' as const),
                  _subtitle: r.subtitle,
                }) as NetworkSearchOrg & { _subtitle?: string | null },
            ),
          );
        } else {
          const r = await searchNetworkOrgs(
            sourceOrgId,
            q,
            entityTypeFilter ? { entityType: entityTypeFilter } : undefined,
          );
          setResults(r);
        }
        setLoading(false);
      }, 250);
    },
    [sourceOrgId, entityTypeFilter, slot],
  );

  const handleGhostCreate = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    await onGhostCreate(name);
    setCreating(false);
  };

  if (!triggerRect) return null;

  return createPortal(
    <motion.div
      data-header-picker
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={STAGE_LIGHT}
      className="fixed z-50 w-64 overflow-hidden"
      style={{
        top: triggerRect.top,
        left: triggerRect.left,
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
      }}
    >
      {onClear && (
        <button
          type="button"
          onClick={() => {
            onClear();
            onClose();
          }}
          className="w-full text-left px-4 py-2 stage-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]"
        >
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search network…"
        className="w-full bg-transparent px-4 py-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] border-b border-[oklch(1_0_0_/_0.06)]"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {loading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      )}
      {!loading &&
        results.map((r) => {
          const sub = (r as NetworkSearchOrg & { _subtitle?: string | null })._subtitle;
          return (
            <button
              key={r.entity_uuid ?? r.id}
              type="button"
              onClick={() => onSelect(r)}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)] transition-colors flex items-center gap-2.5 min-w-0"
            >
              <EntityIcon entityType={r.entity_type} />
              <span className="truncate flex items-baseline gap-1.5 min-w-0">
                <span className="truncate">{r.name}</span>
                {sub && (
                  <span className="text-xs text-[var(--stage-text-tertiary)] shrink-0">{sub}</span>
                )}
              </span>
            </button>
          );
        })}
      {!loading && query.trim().length >= 2 && (
        <button
          type="button"
          disabled={creating}
          onClick={handleGhostCreate}
          className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors flex items-center gap-2 border-t border-[oklch(1_0_0_/_0.06)] disabled:opacity-45"
        >
          {creating ? (
            <Loader2 className="size-3.5 animate-spin shrink-0" />
          ) : (
            <Plus size={14} className="shrink-0" />
          )}
          {ghostLabel} &ldquo;{query.trim()}&rdquo;
        </button>
      )}
    </motion.div>,
    document.body,
  );
}
