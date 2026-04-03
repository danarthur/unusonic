'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Plus, X, Loader2, CheckCheck, RefreshCw, ChevronDown, Bell, Clock, StickyNote } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { formatTime12h } from '@/shared/lib/parse-time';
import { toast } from 'sonner';
import {
  getDealCrew,
  addManualDealCrew,
  addManualOpenRole,
  confirmDealCrew,
  removeDealCrew,
  assignDealCrewEntity,
  searchCrewMembers,
  remindAllUnconfirmed,
  updateCrewDispatch,
  type DealCrewRow,
  type CrewSearchResult,
} from '../actions/deal-crew';
import { getCrewDecisionData, type CrewDecisionData } from '../actions/get-crew-decision-data';
import { CrewIdentityRow } from './crew-identity-row';
import { DEPARTMENT_ORDER, inferDepartment } from '../lib/department-mapping';

// =============================================================================
// Helpers
// =============================================================================

type DepartmentGroup = {
  department: string;
  rows: DealCrewRow[];
};

// =============================================================================
// Inline crew search picker — shared between "Add crew" and "Assign" flows
// =============================================================================

function CrewPicker({
  sourceOrgId,
  onSelect,
  onClose,
  placeholder = 'Search crew…',
  roleHint,
  eventDate,
  workspaceId,
}: {
  sourceOrgId: string;
  onSelect: (result: CrewSearchResult) => Promise<void>;
  onClose: () => void;
  placeholder?: string;
  /** When set, pre-filters results by this role (job_title / skill match). User can toggle to "Show all". */
  roleHint?: string | null;
  /** Deal proposed_date — used for conflict checking in decision data. */
  eventDate?: string | null;
  /** Workspace ID — required for decision data fetch. */
  workspaceId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrewSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [roleFilterActive, setRoleFilterActive] = useState(!!roleHint);
  const [decisionData, setDecisionData] = useState<Map<string, CrewDecisionData>>(new Map());
  const [decisionLoading, setDecisionLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const decisionGenRef = useRef(0);
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

  // Fetch decision data whenever results change
  useEffect(() => {
    if (!workspaceId || results.length === 0) {
      setDecisionData(new Map());
      return;
    }
    const gen = ++decisionGenRef.current;
    const entityIds = results.map((r) => r.entity_id);
    setDecisionLoading(true);
    getCrewDecisionData(entityIds, eventDate ?? null, roleHint ?? null, workspaceId)
      .then((data) => {
        if (decisionGenRef.current !== gen) return;
        const map = new Map<string, CrewDecisionData>();
        for (const d of data) map.set(d.entityId, d);
        setDecisionData(map);
      })
      .catch(() => {
        // Silently degrade — decision data is enrichment, not critical
        if (decisionGenRef.current === gen) setDecisionData(new Map());
      })
      .finally(() => {
        if (decisionGenRef.current === gen) setDecisionLoading(false);
      });
  }, [results, eventDate, roleHint, workspaceId]);

  useEffect(() => {
    inputRef.current?.focus();
    // If role hint provided, immediately load role-matched results
    if (roleHint) doSearch('', true);
  }, []);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
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

            const dd = decisionData.get(r.entity_id);
            const showDecisionShimmer = decisionLoading && !dd && !!workspaceId;

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
                  {/* Decision data enrichment row */}
                  {showDecisionShimmer && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-[11px] w-12 rounded bg-[oklch(1_0_0_/_0.04)] animate-pulse" />
                      <div className="h-[11px] w-16 rounded bg-[oklch(1_0_0_/_0.04)] animate-pulse" />
                      <div className="h-[11px] w-10 rounded bg-[oklch(1_0_0_/_0.04)] animate-pulse" />
                    </div>
                  )}
                  {dd && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* Availability dot */}
                      {dd.availability !== 'unknown' && (
                        <span
                          className="flex items-center gap-1"
                          title={
                            dd.availability === 'conflict' && dd.conflictEventName
                              ? `Conflict: ${dd.conflictEventName}`
                              : dd.availability === 'available'
                                ? 'Available'
                                : undefined
                          }
                        >
                          <span
                            className="inline-block size-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                dd.availability === 'available'
                                  ? 'var(--color-unusonic-success)'
                                  : 'var(--color-unusonic-error)',
                            }}
                          />
                          {dd.availability === 'conflict' && dd.conflictEventName && (
                            <span className="text-[10px] text-[var(--color-unusonic-error)] truncate max-w-[100px]">
                              {dd.conflictEventName}
                            </span>
                          )}
                        </span>
                      )}
                      {/* Day rate chip */}
                      <span className="text-[10px] tabular-nums text-[var(--stage-text-tertiary)]">
                        {dd.dayRate != null ? `$${dd.dayRate}/day` : '\u2014'}
                      </span>
                      {/* Past show count */}
                      <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                        {dd.pastShowCount > 0 ? `${dd.pastShowCount} show${dd.pastShowCount !== 1 ? 's' : ''}` : 'New'}
                      </span>
                      {/* Last show date */}
                      {dd.lastShowDate && (
                        <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                          Last: {new Date(dd.lastShowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  )}
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
// ConfirmedCrewRow — thin wrapper around shared CrewIdentityRow with Deal-tab actions
// =============================================================================

const DISPATCH_ORDER = ['standby', 'en_route', 'on_site', 'wrapped'] as const;
type DispatchStatus = (typeof DISPATCH_ORDER)[number];
const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En route',
  on_site: 'On site',
  wrapped: 'Wrapped',
};
const DISPATCH_COLORS: Record<DispatchStatus, string> = {
  standby: 'oklch(1 0 0 / 0.06)',
  en_route: 'oklch(0.75 0.15 85 / 0.2)',
  on_site: 'oklch(0.7 0.15 230 / 0.2)',
  wrapped: 'oklch(0.7 0.17 145 / 0.2)',
};

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
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus | null>(
    (row.dispatch_status as DispatchStatus) ?? null
  );

  const cycleDispatch = async () => {
    if (!row.confirmed_at) return; // only dispatch confirmed crew
    const currentIdx = dispatchStatus ? DISPATCH_ORDER.indexOf(dispatchStatus) : -1;
    const nextIdx = currentIdx + 1 >= DISPATCH_ORDER.length ? 0 : currentIdx + 1;
    const next = DISPATCH_ORDER[nextIdx];
    setDispatchStatus(next);
    await updateCrewDispatch(row.id, { dispatch_status: next });
  };

  const hasOpsFields = !!(row.call_time || row.day_rate != null || row.crew_notes);

  return (
    <div>
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
            {/* Ops metadata pills — call time, day rate, notes toggle */}
            {row.call_time && (
              <span
                className="shrink-0 flex items-center gap-1 text-[10px] tabular-nums tracking-tight px-1.5 py-0.5 rounded-md"
                style={{
                  color: 'var(--stage-text-secondary)',
                  background: 'oklch(1 0 0 / 0.04)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                }}
                title="Call time"
              >
                <Clock className="size-2.5" />
                {formatTime12h(row.call_time)}
              </span>
            )}
            {row.confirmed_at && (
              <button
                type="button"
                onClick={cycleDispatch}
                className="shrink-0 text-[10px] tracking-tight px-1.5 py-0.5 rounded-md border transition-colors focus:outline-none"
                style={{
                  background: dispatchStatus ? DISPATCH_COLORS[dispatchStatus] : 'oklch(1 0 0 / 0.04)',
                  borderColor: 'oklch(1 0 0 / 0.08)',
                  color: 'var(--stage-text-secondary)',
                }}
                title={`Dispatch: ${dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Not dispatched'}. Click to advance.`}
              >
                {dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Dispatch'}
              </button>
            )}
            {row.day_rate != null && (
              <span
                className="shrink-0 text-[10px] tabular-nums tracking-tight text-[var(--stage-text-secondary)]"
                title="Day rate"
              >
                ${row.day_rate}
              </span>
            )}
            {row.crew_notes && (
              <button
                type="button"
                onClick={() => setNotesExpanded((v) => !v)}
                className={cn(
                  'shrink-0 p-1 transition-colors focus:outline-none',
                  notesExpanded
                    ? 'text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                )}
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                aria-label="Toggle crew notes"
                title="Crew notes"
              >
                <StickyNote className="size-3" />
              </button>
            )}
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
      {/* Expandable crew notes */}
      <AnimatePresence>
        {notesExpanded && row.crew_notes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <p
              className="text-xs leading-relaxed pl-[42px] pb-2"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              {row.crew_notes}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  eventDate,
  workspaceId,
}: {
  row: DealCrewRow;
  sourceOrgId: string | null;
  onAssign: (rowId: string, result: CrewSearchResult) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  eventDate?: string | null;
  workspaceId?: string | null;
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
              eventDate={eventDate}
              workspaceId={workspaceId}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// DepartmentSection — collapsible group of crew rows within a department
// =============================================================================

function DepartmentSection({
  group,
  collapsed,
  onToggle,
  sourceOrgId,
  onRemove,
  onConfirm,
  onAssign,
  eventDate,
  workspaceId,
}: {
  group: DepartmentGroup;
  collapsed: boolean;
  onToggle: () => void;
  sourceOrgId: string | null;
  onRemove: (id: string) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onAssign: (rowId: string, result: CrewSearchResult) => Promise<void>;
  eventDate?: string | null;
  workspaceId?: string | null;
}) {
  const { department, rows } = group;

  // Sort within section: confirmed first, then pending (assigned but unconfirmed), then declined, then open slots
  const sorted = useMemo(() => {
    const confirmed: DealCrewRow[] = [];
    const pending: DealCrewRow[] = [];
    const declined: DealCrewRow[] = [];
    const open: DealCrewRow[] = [];
    for (const r of rows) {
      if (r.entity_id === null) open.push(r);
      else if (r.confirmed_at !== null) confirmed.push(r);
      else if (r.declined_at !== null) declined.push(r);
      else pending.push(r);
    }
    return [...confirmed, ...pending, ...declined, ...open];
  }, [rows]);

  const confirmedCount = rows.filter((r) => r.confirmed_at !== null && r.entity_id !== null).length;
  const totalAssignable = rows.filter((r) => r.entity_id !== null || r.confirmed_at !== null).length || rows.length;

  return (
    <div className="border-b border-[oklch(1_0_0_/_0.06)] last:border-0">
      {/* Department header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2.5 px-1 group focus:outline-none"
      >
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={STAGE_LIGHT}
          className="shrink-0"
        >
          <ChevronDown className="size-3 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors" />
        </motion.div>
        <span className="stage-label text-[var(--stage-text-secondary)] tracking-tight">
          {department}
        </span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {rows.length}
        </span>
        <span className="flex-1" />
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tracking-tight tabular-nums">
          {confirmedCount}/{totalAssignable} confirmed
        </span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <div className="pb-2 pl-1">
              <AnimatePresence initial={false}>
                {sorted.map((row) =>
                  row.entity_id === null ? (
                    <OpenRoleSlotRow
                      key={row.id}
                      row={row}
                      sourceOrgId={sourceOrgId}
                      onAssign={onAssign}
                      onRemove={onRemove}
                      eventDate={eventDate}
                      workspaceId={workspaceId}
                    />
                  ) : (
                    <ConfirmedCrewRow
                      key={row.id}
                      row={row}
                      onRemove={onRemove}
                      onConfirm={row.confirmed_at === null ? onConfirm : undefined}
                    />
                  ),
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// ConfirmationFunnel — segmented bar + counts
// =============================================================================

function ConfirmationFunnel({
  confirmed,
  pending,
  declined,
  total,
}: {
  confirmed: number;
  pending: number;
  declined: number;
  total: number;
}) {
  if (total === 0) return null;

  const pctConfirmed = Math.round((confirmed / total) * 100);
  const pctPending = Math.round((pending / total) * 100);
  const pctDeclined = Math.round((declined / total) * 100);

  return (
    <div className="mb-4 pb-3 border-b border-[oklch(1_0_0_/_0.04)]">
      {/* Segmented bar */}
      <div
        className="flex h-1.5 overflow-hidden mb-2"
        style={{
          backgroundColor: 'oklch(1 0 0 / 0.06)',
          borderRadius: 'var(--stage-radius-input, 6px)',
        }}
      >
        {pctConfirmed > 0 && (
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pctConfirmed}%`,
              backgroundColor: 'var(--color-unusonic-success)',
            }}
          />
        )}
        {pctPending > 0 && (
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pctPending}%`,
              backgroundColor: 'var(--color-unusonic-warning)',
            }}
          />
        )}
        {pctDeclined > 0 && (
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pctDeclined}%`,
              backgroundColor: 'var(--color-unusonic-error)',
            }}
          />
        )}
      </div>

      {/* Counts text */}
      <p className="text-xs text-[var(--stage-text-secondary)] tracking-tight">
        <span style={{ color: 'var(--color-unusonic-success)' }}>{confirmed} confirmed</span>
        {pending > 0 && (
          <>
            <span className="text-[var(--stage-text-tertiary)]"> / </span>
            <span style={{ color: 'var(--color-unusonic-warning)' }}>{pending} pending</span>
          </>
        )}
        {declined > 0 && (
          <>
            <span className="text-[var(--stage-text-tertiary)]"> / </span>
            <span style={{ color: 'var(--color-unusonic-error)' }}>{declined} declined</span>
          </>
        )}
      </p>
    </div>
  );
}

// =============================================================================
// ProductionTeamCard
// =============================================================================

export type ProductionTeamCardProps = {
  dealId: string;
  sourceOrgId: string | null;
  /** Deal proposed_date — passed to CrewPicker for conflict checking. */
  eventDate?: string | null;
  /** Active workspace ID — passed to CrewPicker for decision data fetch. */
  workspaceId?: string | null;
};

export function ProductionTeamCard({ dealId, sourceOrgId, eventDate, workspaceId }: ProductionTeamCardProps) {
  const [crew, setCrew] = useState<DealCrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  // ── Computed aggregates ─────────────────────────────────────────────────────

  const confirmed = crew.filter((r) => r.confirmed_at !== null && r.entity_id !== null);
  const pending = crew.filter((r) => r.entity_id !== null && r.confirmed_at === null && r.declined_at === null);
  const declined = crew.filter((r) => r.declined_at !== null);
  const openSlots = crew.filter((r) => r.entity_id === null);

  const isEmpty = confirmed.length === 0 && pending.length === 0 && declined.length === 0 && openSlots.length === 0;

  // ── Department groups ───────────────────────────────────────────────────────

  const departmentGroups = useMemo((): DepartmentGroup[] => {
    const groups = new Map<string, DealCrewRow[]>();
    for (const row of crew) {
      const dept = row.department ?? inferDepartment(row.role_note, row.job_title);
      const list = groups.get(dept) ?? [];
      list.push(row);
      groups.set(dept, list);
    }
    // Sort by DEPARTMENT_ORDER, unknown departments after 'General'
    const ordered = (DEPARTMENT_ORDER as readonly string[])
      .filter((d) => groups.has(d))
      .map((d) => ({ department: d, rows: groups.get(d)! }));
    const extras = [...groups.entries()]
      .filter(([d]) => !(DEPARTMENT_ORDER as readonly string[]).includes(d))
      .map(([department, rows]) => ({ department, rows }));
    return [...ordered, ...extras];
  }, [crew]);

  // ── Data fetching ───────────────────────────────────────────────────────────

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

  const handleRemindAll = async () => {
    setReminding(true);
    const { sent, skipped } = await remindAllUnconfirmed(dealId);
    setReminding(false);
    if (sent === 0 && skipped === 0) {
      toast('No pending crew to remind');
    } else {
      const parts: string[] = [];
      if (sent > 0) parts.push(`${sent} crew ready to remind (email flow coming soon)`);
      if (skipped > 0) parts.push(`${skipped} skipped (no email)`);
      toast(parts.join(' — '));
    }
  };

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <StagePanel elevated className="p-5 shrink-0">
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <p className="stage-label text-[var(--stage-text-secondary)]">
          Production team
        </p>
        <div className="flex items-center gap-2">
          {/* Remind all — only when there are pending crew */}
          {!loading && pending.length > 0 && (
            <button
              type="button"
              onClick={handleRemindAll}
              disabled={reminding}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium tracking-tight text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none disabled:opacity-40"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              title="Send reminders to all unconfirmed crew"
            >
              {reminding ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Bell className="size-3" />
              )}
              <span>Remind all</span>
            </button>
          )}
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
      </div>

      {/* ── Confirmation funnel ────────────────────────────────────────── */}
      {!loading && crew.length > 0 && (
        <ConfirmationFunnel
          confirmed={confirmed.length}
          pending={pending.length}
          declined={declined.length}
          total={crew.length}
        />
      )}

      {/* Empty state — only when all tiers are empty */}
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

      {/* ── Department groups ──────────────────────────────────────────── */}
      {!loading && departmentGroups.length > 0 && (
        <div>
          {departmentGroups.map((group) => (
            <DepartmentSection
              key={group.department}
              group={group}
              collapsed={collapsedDepts.has(group.department)}
              onToggle={() => toggleDept(group.department)}
              sourceOrgId={sourceOrgId}
              onRemove={handleRemove}
              onConfirm={handleConfirm}
              onAssign={handleAssign}
              eventDate={eventDate}
              workspaceId={workspaceId}
            />
          ))}
        </div>
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
                eventDate={eventDate}
                workspaceId={workspaceId}
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
