'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Plus, X, Loader2, CheckCheck, RefreshCw } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { toast } from 'sonner';
import {
  getDealCrew,
  addManualDealCrew,
  addManualOpenRole,
  confirmDealCrew,
  removeDealCrew,
  assignDealCrewEntity,
  searchCrewMembers,
  type DealCrewRow,
  type CrewSearchResult,
} from '../actions/deal-crew';
import { CrewIdentityRow } from './crew-identity-row';

// =============================================================================
// Helpers
// =============================================================================

// =============================================================================
// Inline crew search picker — shared between "Add crew" and "Assign" flows
// =============================================================================

function CrewPicker({
  sourceOrgId,
  onSelect,
  onClose,
  placeholder = 'Search crew…',
  roleHint,
}: {
  sourceOrgId: string;
  onSelect: (result: CrewSearchResult) => Promise<void>;
  onClose: () => void;
  placeholder?: string;
  /** When set, pre-filters results by this role (job_title / skill match). User can toggle to "Show all". */
  roleHint?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrewSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [roleFilterActive, setRoleFilterActive] = useState(!!roleHint);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef('');
  const searchGenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    (q: string, useRoleFilter: boolean) => {
      const gen = ++searchGenRef.current;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Allow empty query when role filter is active (shows all matching the role)
      if (!q.trim() && !useRoleFilter) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        const r = await searchCrewMembers(
          sourceOrgId,
          q,
          useRoleFilter ? roleHint : null,
        );
        if (searchGenRef.current !== gen) return;
        setResults(r);
        setLoading(false);
      }, q ? 250 : 0); // immediate for initial role load
    },
    [sourceOrgId, roleHint],
  );

  useEffect(() => {
    inputRef.current?.focus();
    // If role hint provided, immediately load role-matched results
    if (roleHint) doSearch('', true);
  }, []);  

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      currentQueryRef.current = q;
      doSearch(q, roleFilterActive && !!roleHint);
    },
    [doSearch, roleFilterActive, roleHint],
  );

  const handleToggleRoleFilter = () => {
    const next = !roleFilterActive;
    setRoleFilterActive(next);
    doSearch(query, next && !!roleHint);
  };

  const handleSelect = async (result: CrewSearchResult) => {
    setAdding(result.entity_id);
    await onSelect(result);
    setAdding(null);
  };

  // Track which section labels have been rendered
  let renderedTeamHeader = false;
  let renderedNetworkHeader = false;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={STAGE_LIGHT}
      className="w-full overflow-hidden mt-2 stage-panel-nested border border-[oklch(1_0_0_/_0.08)]"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={roleFilterActive && roleHint ? `Search ${roleHint}…` : placeholder}
        className="w-full bg-transparent px-4 py-3 text-sm tracking-tight text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] border-b border-[oklch(1_0_0_/_0.06)]"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {roleHint && (
        <button
          type="button"
          onClick={handleToggleRoleFilter}
          className={cn(
            'w-full text-left px-4 py-2.5 text-[11px] font-medium tracking-tight transition-colors duration-75 border-b border-[oklch(1_0_0_/_0.06)] flex items-center gap-2.5',
            roleFilterActive
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
            'hover:bg-[var(--stage-surface-hover)]',
          )}
        >
          <span className={cn(
            'inline-flex items-center justify-center size-4 border transition-colors duration-75 [border-radius:var(--stage-radius-input,6px)]',
            roleFilterActive
              ? 'bg-[var(--stage-surface-raised)] border-[var(--stage-edge-top)]'
              : 'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
          )}>
            {roleFilterActive && <CheckCheck className="size-2.5" />}
          </span>
          {roleFilterActive ? `Matching "${roleHint}"` : `Show only "${roleHint}"`}
        </button>
      )}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      )}
      <div className="max-h-[280px] overflow-y-auto">
        {!loading &&
          results.map((r) => {
            const elements: React.ReactNode[] = [];

            if (r._section === 'team' && !renderedTeamHeader) {
              renderedTeamHeader = true;
              elements.push(
                <p key="__team-header" className="px-4 pt-3 pb-1.5 stage-label text-[var(--stage-text-tertiary)]">
                  Staff &amp; Contractors
                </p>,
              );
            }
            if (r._section === 'network' && !renderedNetworkHeader) {
              renderedNetworkHeader = true;
              elements.push(
                <p key="__network-header" className="px-4 pt-3 pb-1.5 stage-label text-[var(--stage-text-tertiary)]">
                  Freelancers
                </p>,
              );
            }

            elements.push(
              <button
                key={r.entity_id}
                type="button"
                disabled={adding === r.entity_id}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 text-sm tracking-tight text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)] transition-colors flex items-start gap-2.5 disabled:opacity-40"
              >
                {adding === r.entity_id ? (
                  <Loader2 className="size-4 animate-spin shrink-0 mt-0.5" />
                ) : (
                  <div className="size-7 shrink-0 bg-[oklch(1_0_0_/_0.06)] flex items-center justify-center" style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}>
                    <User className="size-3.5 text-[var(--stage-text-tertiary)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <span className="truncate block font-medium text-[var(--stage-text-primary)]">{r.name}</span>
                  {r.job_title && (
                    <span className="text-[10px] text-[var(--stage-text-tertiary)] block mt-0.5">{r.job_title}</span>
                  )}
                  {(() => {
                    const titleLower = (r.job_title ?? '').toLowerCase();
                    const filtered = r.skills.filter((s) => s.toLowerCase() !== titleLower);
                    return filtered.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {filtered.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="text-[10px] bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.06)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              </button>,
            );

            return elements;
          })}
      </div>
      {!loading && query.trim().length > 0 && results.length === 0 && (
        <p className="px-4 py-4 text-xs text-[var(--stage-text-tertiary)] text-center">
          No crew found
        </p>
      )}
      {!loading && !query.trim() && !roleFilterActive && results.length === 0 && (
        <p className="px-4 py-4 text-xs text-[var(--stage-text-tertiary)] text-center">
          Type a name to search
        </p>
      )}
    </motion.div>
  );
}

// =============================================================================
// Section header
// =============================================================================

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="stage-label text-[var(--stage-text-tertiary)] mb-2">
      {label}
    </p>
  );
}

function SectionDivider() {
  return <div className="border-t border-[oklch(1_0_0_/_0.04)] my-3" />;
}

// =============================================================================
// ConfirmedCrewRow — thin wrapper around shared CrewIdentityRow with Deal-tab actions
// =============================================================================

function ConfirmedCrewRow({
  row,
  onRemove,
  onConfirm,
}: {
  row: DealCrewRow;
  onRemove: (id: string) => Promise<void>;
  onConfirm?: (id: string) => Promise<void>;
}) {
  const router = useRouter();

  return (
    <CrewIdentityRow
      row={row}
      onClickName={() => {
        if (!row.entity_id) return;
        if (row.employment_status === 'internal_employee' && row.roster_rel_id) {
          router.push(`/network/entity/${row.roster_rel_id}?kind=internal_employee`);
        }
      }}
      actions={
        <>
          {onConfirm && (
            <button
              type="button"
              onClick={() => onConfirm(row.id)}
              title="Override: manually confirm"
              className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-success)]/60 transition-colors focus:outline-none"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              aria-label="Confirm"
            >
              <CheckCheck className="size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-colors focus:outline-none"
            style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
            aria-label="Remove"
          >
            <X className="size-3" />
          </button>
        </>
      }
    />
  );
}

// =============================================================================
// OpenRoleSlotRow
// =============================================================================

function OpenRoleSlotRow({
  row,
  sourceOrgId,
  onAssign,
  onRemove,
}: {
  row: DealCrewRow;
  sourceOrgId: string | null;
  onAssign: (rowId: string, result: CrewSearchResult) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close — avoids stacking context issues with portal backdrops
  useEffect(() => {
    if (!assignPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setAssignPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assignPickerOpen]);

  const handlePickerSelect = async (result: CrewSearchResult) => {
    setAssignPickerOpen(false);
    await onAssign(row.id, result);
  };

  return (
    <motion.div
      key={row.id}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={STAGE_LIGHT}
      className="py-1.5 border-b border-[oklch(1_0_0_/_0.04)] last:border-0"
    >
      <div className="flex items-center gap-2">
        {/* Clickable field block — matches deal header field pattern */}
        <div
          className={cn(
            'flex-1 min-w-0 px-3 py-2.5',
            sourceOrgId && 'cursor-pointer [border-radius:var(--stage-radius-input,6px)] hover:bg-[var(--stage-accent-muted)] transition-colors',
          )}
          onClick={sourceOrgId ? () => setAssignPickerOpen((v) => !v) : undefined}
        >
          <p className="stage-label text-[var(--stage-text-tertiary)] mb-1 select-none leading-none">
            {row.role_note ?? 'Open role'}
          </p>
          <span className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-1.5">
            <Plus size={9} />assign
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          className="shrink-0 p-1.5 rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-colors focus:outline-none"
          aria-label="Remove role"
        >
          <X className="size-3" />
        </button>
      </div>
      {/* Picker renders inline below the row */}
      <AnimatePresence>
        {assignPickerOpen && sourceOrgId && (
          <div ref={pickerRef} className="relative z-10">
            <CrewPicker
              sourceOrgId={sourceOrgId}
              onSelect={handlePickerSelect}
              onClose={() => setAssignPickerOpen(false)}
              placeholder="Search people…"
              roleHint={row.role_note ?? null}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// ProductionTeamCard
// =============================================================================

export type ProductionTeamCardProps = {
  dealId: string;
  sourceOrgId: string | null;
};

export function ProductionTeamCard({ dealId, sourceOrgId }: ProductionTeamCardProps) {
  const [crew, setCrew] = useState<DealCrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Three-tier split:
  // Tier 1 — confirmed (confirmed_at set, entity_id set — crew member accepted)
  // Tier 2 — assigned (entity_id set, confirmed_at null — awaiting crew confirmation)
  // Tier 3 — open role slots (entity_id null — no one assigned yet)
  const confirmed = crew.filter((r) => r.confirmed_at !== null && r.entity_id !== null);
  const assigned = crew.filter((r) => r.entity_id !== null && r.confirmed_at === null);
  const openSlots = crew.filter((r) => r.entity_id === null);

  const isEmpty = confirmed.length === 0 && assigned.length === 0 && openSlots.length === 0;

  const fetchCrew = useCallback(async () => {
    const rows = await getDealCrew(dealId);
    setCrew(rows);
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchCrew();
  }, [fetchCrew]);


  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAdd = async (result: CrewSearchResult) => {
    setAddPickerOpen(false);
    const res = await addManualDealCrew(dealId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      await fetchCrew();
    } else {
      toast.error(res.error);
    }
  };

  const handleConfirm = async (rowId: string) => {
    const result = await confirmDealCrew(rowId);
    if (result.success) {
      await fetchCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (rowId: string) => {
    const result = await removeDealCrew(rowId);
    if (result.success) {
      setCrew((prev) => prev.filter((r) => r.id !== rowId));
    } else {
      toast.error(result.error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetchCrew();
    setSyncing(false);
  };

  const handleAddRole = async () => {
    const trimmed = roleInput.trim();
    if (!trimmed) return;
    setRoleAdding(true);
    const result = await addManualOpenRole(dealId, trimmed);
    setRoleAdding(false);
    if (result.success) {
      setRoleInput('');
      setAddRoleOpen(false);
      await fetchCrew();
    } else {
      toast.error(result.error);
    }
  };

  const handleAssign = async (rowId: string, result: CrewSearchResult) => {
    const res = await assignDealCrewEntity(rowId, result.entity_id);
    if (res.success) {
      if (res.conflict) toast.warning(res.conflict);
      await fetchCrew();
    } else {
      toast.error(res.error);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <StagePanel elevated className="p-5 shrink-0">
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <p className="stage-label text-[var(--stage-text-secondary)]">
          Production team
        </p>
        {loading || syncing ? (
          <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
        ) : (
          <button
            type="button"
            onClick={handleSync}
            className="p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
            style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
            aria-label="Resync from proposal"
            title="Resync from proposal"
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
      </div>

      {/* Empty state — only when all three tiers are empty */}
      {!loading && isEmpty && (
        <div className="mb-4">
          <p className="text-xs font-medium text-[var(--stage-text-tertiary)] mb-1">
            No crew yet
          </p>
          <p className="text-xs text-[var(--stage-text-tertiary)] leading-relaxed">
            Build a proposal with packages to get crew suggestions, or add crew directly.
          </p>
        </div>
      )}

      {/* ── Tier 1: Confirmed — crew member accepted the assignment ────── */}
      {confirmed.length > 0 && (
        <>
          <SectionHeader label="Confirmed" />
          <AnimatePresence initial={false}>
            {confirmed.map((row) => (
              <ConfirmedCrewRow key={row.id} row={row} onRemove={handleRemove} />
            ))}
          </AnimatePresence>
        </>
      )}

      {/* ── Tier 2: Assigned — awaiting crew confirmation ────────────────── */}
      {assigned.length > 0 && (
        <>
          {confirmed.length > 0 && <SectionDivider />}
          <SectionHeader label="Awaiting confirmation" />
          <AnimatePresence initial={false}>
            {assigned.map((row) => (
              <ConfirmedCrewRow
                key={row.id}
                row={row}
                onRemove={handleRemove}
                onConfirm={handleConfirm}
              />
            ))}
          </AnimatePresence>
        </>
      )}

      {/* ── Tier 3: Open role slots — no one assigned yet ────────────────── */}
      {openSlots.length > 0 && (
        <>
          {(confirmed.length > 0 || assigned.length > 0) && <SectionDivider />}
          <SectionHeader label="Open roles" />
          <AnimatePresence initial={false}>
            {openSlots.map((row) => (
              <OpenRoleSlotRow
                key={row.id}
                row={row}
                sourceOrgId={sourceOrgId}
                onAssign={handleAssign}
                onRemove={handleRemove}
              />
            ))}
          </AnimatePresence>
        </>
      )}

      {/* ── Add crew / Add role ─────────────────────────────────────────────── */}
      <div className={cn(!isEmpty && 'mt-4 pt-4 border-t border-[oklch(1_0_0_/_0.04)]')}>
        <div className="flex items-center gap-3">
          {sourceOrgId && (
            <button
              type="button"
              onClick={() => { setAddPickerOpen((v) => !v); setAddRoleOpen(false); }}
              className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
            >
              <Plus size={13} />
              <span>Add crew</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setAddRoleOpen((v) => !v); setAddPickerOpen(false); }}
            className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          >
            <Plus size={13} />
            <span>Add role</span>
          </button>
        </div>

        {/* Inline crew picker */}
        {addPickerOpen && sourceOrgId && (
          <>
            {createPortal(
              <div className="fixed inset-0 z-40" onClick={() => setAddPickerOpen(false)} />,
              document.body,
            )}
            <div className="relative z-50">
              <CrewPicker
                sourceOrgId={sourceOrgId}
                onSelect={handleAdd}
                onClose={() => setAddPickerOpen(false)}
              />
            </div>
          </>
        )}

        {/* Inline role name input */}
        {addRoleOpen && (
          <>
            {createPortal(
              <div className="fixed inset-0 z-40" onClick={() => { setAddRoleOpen(false); setRoleInput(''); }} />,
              document.body,
            )}
            <div className="relative z-50 flex items-center gap-2 mt-2.5">
              <input
                autoFocus
                type="text"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRole();
                  if (e.key === 'Escape') { setAddRoleOpen(false); setRoleInput(''); }
                }}
                placeholder="Role name (e.g. Stage Manager)"
                className="flex-1 bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)]"
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              />
              <button
                type="button"
                onClick={handleAddRole}
                disabled={!roleInput.trim() || roleAdding}
                className="stage-btn stage-btn-secondary px-3 py-1.5 text-sm disabled:opacity-40 disabled:pointer-events-none"
              >
                {roleAdding ? <Loader2 className="size-3.5 animate-spin" /> : 'Add'}
              </button>
            </div>
          </>
        )}
      </div>
    </StagePanel>
  );
}
