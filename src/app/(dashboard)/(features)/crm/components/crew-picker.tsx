'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Loader2, CheckCheck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  searchCrewMembers,
  type CrewSearchResult,
} from '../actions/deal-crew';
import { getCrewDecisionData, type CrewDecisionData } from '../actions/get-crew-decision-data';

// =============================================================================
// Inline crew search picker — shared between "Add crew" and "Assign" flows
// =============================================================================

export function CrewPicker({
  sourceOrgId,
  onSelect,
  onClose,
  placeholder = 'Search crew\u2026',
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
        placeholder={roleFilterActive && roleHint ? `Search ${roleHint}\u2026` : placeholder}
        className="w-full bg-transparent px-4 py-3 text-sm tracking-tight text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] border-b border-[oklch(1_0_0_/_0.06)]"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {roleHint && (
        <button
          type="button"
          onClick={handleToggleRoleFilter}
          className={cn(
            'w-full text-left px-4 py-2.5 text-field-label font-medium tracking-tight transition-colors duration-75 border-b border-[oklch(1_0_0_/_0.06)] flex items-center gap-2.5',
            roleFilterActive
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
            'stage-hover overflow-hidden',
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
                className="w-full text-left px-4 py-2.5 text-sm tracking-tight text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)] transition-colors flex items-start gap-2.5 disabled:opacity-45"
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
                    <span className="text-label text-[var(--stage-text-tertiary)] block mt-0.5">{r.job_title}</span>
                  )}
                  {(() => {
                    const titleLower = (r.job_title ?? '').toLowerCase();
                    const filtered = r.skills.filter((s) => s.toLowerCase() !== titleLower);
                    return filtered.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {filtered.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="text-label bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.06)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]"
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
                      {/* Availability dot + conflict info */}
                      {dd.availability !== 'unknown' && (
                        <span
                          className="flex items-center gap-1"
                          title={
                            (dd.availability === 'conflict' || dd.availability === 'blackout') && dd.conflictEventName
                              ? dd.conflictEventName
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
                                  : dd.availability === 'blackout'
                                    ? 'var(--stage-text-tertiary)'
                                    : 'var(--color-unusonic-error)',
                            }}
                          />
                          {(dd.availability === 'conflict' || dd.availability === 'blackout') && dd.conflictEventName && (
                            <span className={`text-label truncate max-w-[120px] ${dd.availability === 'blackout' ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--color-unusonic-error)]'}`}>
                              {dd.conflictEventName}
                            </span>
                          )}
                        </span>
                      )}
                      {/* Day rate chip */}
                      <span className="text-label tabular-nums text-[var(--stage-text-tertiary)]">
                        {dd.dayRate != null ? `$${dd.dayRate}/day` : '\u2014'}
                      </span>
                      {/* Past show count */}
                      <span className="text-label text-[var(--stage-text-tertiary)]">
                        {dd.pastShowCount > 0 ? `${dd.pastShowCount} show${dd.pastShowCount !== 1 ? 's' : ''}` : 'New'}
                      </span>
                      {/* Last show date */}
                      {dd.lastShowDate && (
                        <span className="text-label text-[var(--stage-text-tertiary)]">
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
          Search crew...
        </p>
      )}
    </motion.div>
  );
}
