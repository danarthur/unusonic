'use client';

/**
 * Conflicts panel — Phase 2.1 Sprint 2 scaffold.
 *
 * Lives at the top of the deal-lens right rail (above the Proposal card),
 * peer of price/status/dates. Three-state coordinator's whiteboard for the
 * gaps in a deal's feasibility:
 *
 *   Open          — gaps the system has detected, not yet resolved
 *   Acknowledged  — owner said "I'll handle it" with optional note
 *   Resolved      — gap was closed (e.g., crew assigned, sub-rental confirmed)
 *
 * Sprint 2 ships this scaffold with hard-coded test data so the UX can be
 * validated in the browser before the real data layer lands. Sprint 4 wires
 * it to ops.deal_open_items via ops.feasibility_check_for_deal — at that
 * point the rows come from the RPC and Acknowledge/Resolve mutations write
 * back through the state machine.
 *
 * Design contract per docs/reference/date-availability-badge-phase-2-design.md:
 *   - §3.1: panel is the work surface (ongoing-conflict post-creation)
 *   - §3.3: closed reopening event set (date change, scope change on acked
 *           dimension, sub-rental not recorded by T-7d) — wired Sprint 4
 *   - Critic §C: panel is allowed to be triage-aware (deterministic impact
 *           ranking by days-to-event ASC, severity DESC) — implemented as a
 *           sort key on the row data, not a fitness score
 *   - User Advocate vocabulary: "Open items", "Mark handled", "Find substitute",
 *           "Pencil him in", "Pass on it" — never "action items", "issues",
 *           "delegate", "outsource"
 *   - "Honesty when not tracked": a placeholder row for dimensions we haven't
 *           wired yet (Gear, Travel) with a "Not tracked yet" subtitle
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, RefreshCcw, ExternalLink, Check } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import {
  getDealConflicts,
  setDealConflictItemState,
  type DealConflict,
  type DealConflictsSoftLoad,
} from '../actions/get-deal-conflicts';

// ─── Types ───────────────────────────────────────────────────────────────────

type ConflictDimension = 'crew' | 'gear' | 'travel' | 'scope';
type ConflictSeverity = 'high' | 'medium' | 'low';
type ConflictState = 'open' | 'acknowledged' | 'resolved';

type ConflictAction = {
  /** Imperative verb in production vocabulary — "Find substitute", "Sub it", "Pencil him in", "Mark handled". */
  label: string;
  /** Optional href to deep-link to the resolution surface. */
  href?: string;
  /** Internal click handler when the action lives entirely client-side (e.g., Mark handled). */
  onClick?: () => void;
  /** Visual emphasis. Primary actions are flat-on-elevated; secondary blend into the row. */
  emphasis?: 'primary' | 'secondary';
};

type ConflictRow = {
  id: string;
  dimension: ConflictDimension;
  severity: ConflictSeverity;
  state: ConflictState;
  /** One-line title in owner vocabulary. */
  title: string;
  /** Optional second line for context — names, distances, dates. Always quiet. */
  subtitle?: string;
  /** When the owner Acknowledged this gap — short note + audit metadata. */
  ackNote?: string;
  ackBy?: string;
  ackAt?: string;
  /** Days until the show — used for impact ranking. Lower = surfaced higher. */
  daysToEvent?: number;
  actions: ConflictAction[];
};

// ─── Hard-coded Sprint 2 test data ───────────────────────────────────────────
//
// Real data lands in Sprint 4 via ops.feasibility_check_for_deal. This data
// covers all three states and all four dimensions so layout / spacing / copy
// can be reviewed end-to-end without any backend wiring.

const TEST_ROWS: ConflictRow[] = [
  {
    id: 'test-crew-1',
    dimension: 'crew',
    severity: 'high',
    state: 'open',
    title: 'DJ pool exhausted',
    subtitle: '2 DJs committed elsewhere · last worked with Mike\u2019s Production Mar 14',
    daysToEvent: 12,
    actions: [
      { label: 'Find substitute', emphasis: 'primary' },
      { label: 'Pencil in', emphasis: 'secondary' },
    ],
  },
  {
    id: 'test-travel-1',
    dimension: 'travel',
    severity: 'medium',
    state: 'open',
    title: 'Adjacent commitment',
    subtitle: 'Henderson Wedding load-out Friday 11pm · 4h buffer to load-in',
    daysToEvent: 12,
    actions: [{ label: 'Mark handled', emphasis: 'secondary' }],
  },
  {
    id: 'test-travel-2',
    dimension: 'travel',
    severity: 'high',
    state: 'acknowledged',
    title: 'Tight routing \u2014 1,387 mi',
    subtitle: 'Denver\u00a0\u2192\u00a0Atlanta single leg',
    ackNote: 'charter flight booked',
    ackBy: 'Daniel',
    ackAt: 'Mar 14',
    daysToEvent: 12,
    actions: [{ label: 'Reopen', emphasis: 'secondary' }],
  },
  {
    id: 'test-gear-placeholder',
    dimension: 'gear',
    severity: 'low',
    state: 'open',
    title: 'Gear: not tracked yet',
    subtitle: 'Set up the catalog to surface conflicts',
    daysToEvent: 12,
    actions: [{ label: 'Set up catalog', emphasis: 'secondary', href: '/catalog' }],
  },
];

// ─── Visual primitives ───────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<ConflictSeverity, string> = {
  high: 'var(--color-unusonic-error, oklch(0.70 0.18 28))',
  medium: 'var(--color-unusonic-warning, oklch(0.80 0.14 73))',
  low: 'var(--stage-text-tertiary)',
};

const DIMENSION_LABEL: Record<ConflictDimension, string> = {
  crew: 'Crew',
  gear: 'Gear',
  travel: 'Travel',
  scope: 'Scope',
};

function SeverityGlyph({ severity }: { severity: ConflictSeverity }) {
  const color = SEVERITY_COLOR[severity];
  if (severity === 'high') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0 mt-1.5">
        <circle cx="4" cy="4" r="3.5" fill={color} />
      </svg>
    );
  }
  if (severity === 'medium') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0 mt-1.5">
        <circle cx="4" cy="4" r="3.25" fill={color} fillOpacity="0.55" stroke={color} strokeWidth="1.25" />
      </svg>
    );
  }
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0 mt-1.5">
      <circle cx="4" cy="4" r="3" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ row, onMarkHandled, onReopen }: { row: ConflictRow; onMarkHandled: (id: string) => void; onReopen: (id: string) => void }) {
  return (
    <li className="flex items-start gap-2 py-2 px-3 border-t border-[oklch(1_0_0_/_0.04)] first:border-t-0">
      <SeverityGlyph severity={row.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] truncate">
            {row.title}
          </span>
          <span className="text-[10px] uppercase tracking-[0.05em] text-[var(--stage-text-tertiary)] shrink-0">
            {DIMENSION_LABEL[row.dimension]}
          </span>
        </div>
        {row.subtitle && (
          <p className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight mt-0.5 leading-snug">
            {row.subtitle}
          </p>
        )}
        {row.state === 'acknowledged' && row.ackNote && (
          <p className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight mt-1 italic">
            &ldquo;{row.ackNote}&rdquo;
            {row.ackBy && row.ackAt && (
              <span className="not-italic"> &middot; {row.ackBy} &middot; {row.ackAt}</span>
            )}
          </p>
        )}
        {row.actions.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {row.actions.map((action) => {
              const handler = (() => {
                if (action.label === 'Mark handled') return () => onMarkHandled(row.id);
                if (action.label === 'Reopen') return () => onReopen(row.id);
                return action.onClick;
              })();
              const className = cn(
                'inline-flex items-center gap-1 h-[22px] px-2 rounded-[var(--stage-radius-input,6px)] text-[11px] tracking-tight transition-colors duration-75',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                action.emphasis === 'primary'
                  ? 'border border-[oklch(1_0_0_/_0.16)] bg-[var(--ctx-card)] text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.28)] hover:bg-[oklch(1_0_0_/_0.05)]'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
              );
              if (action.href) {
                return (
                  <a key={action.label} href={action.href} className={className}>
                    <span>{action.label}</span>
                    <ExternalLink size={10} strokeWidth={1.5} aria-hidden />
                  </a>
                );
              }
              return (
                <button key={action.label} type="button" onClick={handler} className={className}>
                  {action.label === 'Mark handled' && <Check size={10} strokeWidth={2} aria-hidden />}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function StateSection({
  title,
  count,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (count === 0 && defaultCollapsed) {
    return null;
  }
  return (
    <section className="border-t border-[oklch(1_0_0_/_0.06)] first:border-t-0">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors duration-75"
      >
        <ChevronRight
          size={10}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'shrink-0 transition-transform duration-75',
            !collapsed && 'rotate-90',
          )}
        />
        <span>{title}</span>
        <span className="text-[var(--stage-text-tertiary)]">&middot; {count}</span>
      </button>
      {!collapsed && <ul className="flex flex-col">{children}</ul>}
    </section>
  );
}

// ─── Server-payload transform ────────────────────────────────────────────────

/**
 * Transform a server-side `DealConflict` (from ops.feasibility_check_for_deal)
 * into a UI `ConflictRow`. The actions list is derived per state.
 */
function rowFromServerConflict(c: DealConflict): ConflictRow {
  const baseActions: ConflictAction[] = (() => {
    if (c.state === 'acknowledged' || c.state === 'resolved') {
      return [{ label: 'Reopen', emphasis: 'secondary' }];
    }
    return [{ label: 'Mark handled', emphasis: 'secondary' }];
  })();

  return {
    id: c.item_key,
    dimension: c.dimension,
    severity: c.severity,
    state: c.state,
    title: c.title,
    subtitle: c.subtitle ?? undefined,
    ackNote: c.ack_note ?? undefined,
    // Server returns acted_by as uuid + acted_at as ISO timestamp; for Sprint 4
    // we surface the timestamp only. Future polish: join workspace_members
    // server-side for the user's display name.
    ackBy: undefined,
    ackAt: c.ack_at ? new Date(c.ack_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined,
    daysToEvent: c.days_to_event ?? undefined,
    actions: baseActions,
  };
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ConflictsPanel({
  dealId,
  rows: rowsOverride,
  onRefresh,
}: {
  /**
   * Sprint 4 — when set, the panel fetches real conflicts via
   * ops.feasibility_check_for_deal and persists state transitions through
   * ops.set_deal_open_item_state. When omitted, the panel falls back to
   * Sprint 2's hard-coded test data so the surface still renders.
   */
  dealId?: string;
  /** Manual override of rows (used by tests / storybook). When set, suppresses real-data fetch. */
  rows?: ConflictRow[];
  /** Optional manual refresh handler. The panel installs its own when dealId is set. */
  onRefresh?: () => void;
} = {}) {
  // ── Real-data fetch (when dealId is set) ──────────────────────────────────
  const [serverRows, setServerRows] = useState<ConflictRow[] | null>(null);
  const [softLoad, setSoftLoad] = useState<DealConflictsSoftLoad | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Track in-flight mutations so we don't clobber optimistic UI on a slow
  // round-trip. Lightweight — no need for TanStack Query at Sprint 4 scope.
  const inFlightMutationCount = useRef(0);

  const refetch = useCallback(async () => {
    if (!dealId || rowsOverride) return;
    setRefreshing(true);
    try {
      const payload = await getDealConflicts(dealId);
      // If a mutation is mid-flight, skip the refetch result — the optimistic
      // UI is more current. Refetch will fire again after the mutation resolves.
      if (inFlightMutationCount.current === 0) {
        setServerRows(payload.conflicts.map(rowFromServerConflict));
        setSoftLoad(payload.soft_load);
      }
    } finally {
      setRefreshing(false);
    }
  }, [dealId, rowsOverride]);

  useEffect(() => {
    if (!dealId || rowsOverride) {
      setServerRows(null);
      return;
    }
    void refetch();
  }, [dealId, rowsOverride, refetch]);

  // ── Effective rows: server data > rows override > test data ──────────────
  const baseRows: ConflictRow[] = useMemo(() => {
    if (rowsOverride) return rowsOverride;
    if (dealId) return serverRows ?? [];
    return TEST_ROWS;
  }, [rowsOverride, dealId, serverRows]);

  // Local optimistic overlay — applied on top of baseRows so a Mark-handled
  // tap flips state instantly while the mutation lands.
  const [localStates, setLocalStates] = useState<Record<string, ConflictState>>({});

  const effectiveRows = useMemo(
    () =>
      baseRows.map((r) => ({ ...r, state: localStates[r.id] ?? r.state })),
    [baseRows, localStates],
  );

  const grouped = useMemo(() => {
    // Triage-aware sort within each state: ascending days-to-event, then
    // descending severity. Per Critic §C: this is a deterministic sort, not
    // an opinion or fitness score.
    const severityRank: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };
    const sortFn = (a: ConflictRow, b: ConflictRow) => {
      const dteA = a.daysToEvent ?? 999;
      const dteB = b.daysToEvent ?? 999;
      if (dteA !== dteB) return dteA - dteB;
      return severityRank[a.severity] - severityRank[b.severity];
    };
    const open = effectiveRows.filter((r) => r.state === 'open').sort(sortFn);
    const acknowledged = effectiveRows.filter((r) => r.state === 'acknowledged').sort(sortFn);
    const resolved = effectiveRows.filter((r) => r.state === 'resolved').sort(sortFn);
    return { open, acknowledged, resolved };
  }, [effectiveRows]);

  // ── Mutations: persist when dealId is set, else stay client-only ─────────
  const persistTransition = useCallback(
    async (itemKey: string, nextState: ConflictState) => {
      if (!dealId) return;
      inFlightMutationCount.current += 1;
      try {
        const result = await setDealConflictItemState(dealId, itemKey, nextState);
        if (!result.ok) {
          console.error('[ConflictsPanel] persist failed:', result.error);
          // Revert optimistic state on failure.
          setLocalStates((s) => {
            const next = { ...s };
            delete next[itemKey];
            return next;
          });
        }
      } finally {
        inFlightMutationCount.current = Math.max(0, inFlightMutationCount.current - 1);
        if (inFlightMutationCount.current === 0) {
          // Refetch to sync server-of-record state (e.g., acted_at, server-derived
          // metadata) with the optimistic UI.
          void refetch();
        }
      }
    },
    [dealId, refetch],
  );

  const markHandled = useCallback(
    (id: string) => {
      setLocalStates((s) => ({ ...s, [id]: 'acknowledged' }));
      void persistTransition(id, 'acknowledged');
    },
    [persistTransition],
  );
  const reopen = useCallback(
    (id: string) => {
      setLocalStates((s) => ({ ...s, [id]: 'open' }));
      void persistTransition(id, 'open');
    },
    [persistTransition],
  );

  const totalOpen = grouped.open.length;
  const totalAck = grouped.acknowledged.length;
  const totalResolved = grouped.resolved.length;
  const headerCount = totalOpen + totalAck;

  // Honesty rule: if no rows at all, hide the panel entirely (don't claim
  // there are zero conflicts when we may not have computed them yet).
  // When wired to a real deal: hide while the first fetch is in flight too,
  // so we never flash test-data placeholders.
  if (dealId && !rowsOverride && serverRows === null) return null;
  if (effectiveRows.length === 0) return null;

  // Pick the right refresh handler: server-fetch refetch when wired, else
  // any caller-provided onRefresh, else hide the button.
  const effectiveRefresh = dealId && !rowsOverride ? refetch : onRefresh;

  return (
    <StagePanel elevated className="flex flex-col" style={{ overflow: 'visible' }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[oklch(1_0_0_/_0.06)]">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)]">
            Open items
          </h2>
          {headerCount > 0 && (
            <span className="text-[11px] text-[var(--stage-text-tertiary)] tracking-tight">
              &middot; {headerCount}
            </span>
          )}
        </div>
        {effectiveRefresh && (
          <button
            type="button"
            onClick={effectiveRefresh}
            disabled={refreshing}
            aria-label="Refresh conflicts"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-50 transition-colors duration-75"
          >
            <RefreshCcw size={12} strokeWidth={1.5} aria-hidden className={cn(refreshing && 'animate-spin')} />
          </button>
        )}
      </div>
      {softLoad?.is_heavy && (
        <p className="px-3 py-2 text-[11px] text-[var(--stage-text-tertiary)] tracking-tight italic border-b border-[oklch(1_0_0_/_0.04)]">
          Heavy weekend &mdash; {softLoad.confirmed_in_72h} confirmed in 72h
          {softLoad.deals_in_72h > 0 && (
            <> &middot; {softLoad.deals_in_72h} {softLoad.deals_in_72h === 1 ? 'deal' : 'deals'} in flight</>
          )}
        </p>
      )}
      <StateSection title="Open" count={totalOpen}>
        {grouped.open.map((row) => (
          <Row key={row.id} row={row} onMarkHandled={markHandled} onReopen={reopen} />
        ))}
      </StateSection>
      {totalAck > 0 && (
        <StateSection title="Acknowledged" count={totalAck}>
          {grouped.acknowledged.map((row) => (
            <Row key={row.id} row={row} onMarkHandled={markHandled} onReopen={reopen} />
          ))}
        </StateSection>
      )}
      <StateSection title="Resolved" count={totalResolved} defaultCollapsed>
        {grouped.resolved.map((row) => (
          <Row key={row.id} row={row} onMarkHandled={markHandled} onReopen={reopen} />
        ))}
      </StateSection>
    </StagePanel>
  );
}
