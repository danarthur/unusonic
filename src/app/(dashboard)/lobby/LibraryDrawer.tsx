'use client';

/**
 * LibraryDrawer — Phase 2.3.
 *
 * Right-side sheet that lists every metric/widget the viewer can see (per
 * their resolved capability set, passed in from the Lobby page server
 * component as a string array) minus the cards already on their Lobby.
 * Clicking a row hands the new id back to the parent, which appends it to
 * the layout and persists via the existing server action.
 *
 * Filtering rules (mirrored in the Phase 2.3 design):
 *   - Only widget-kind metrics OR scalar/table metrics that carry a
 *     widgetKey (Phase 1.4's qbo-variance is the only one today). Pure
 *     scalar/table without a widget renderer can't be placed on the Lobby
 *     until Phase 3 ships the analytics_result card.
 *   - Skip cards already in the user's cardIds.
 *   - Skip entries flagged `pickable: false` in the registry (sheets,
 *     banners, page grids).
 *   - Capability filter happens server-side; the array passed in is
 *     already pre-filtered for what the viewer holds.
 *
 * @module app/(dashboard)/lobby/LibraryDrawer
 */

import * as React from 'react';
import { Search, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isWidgetMetric, type MetricDefinition } from '@/shared/lib/metrics/types';
import type { CapabilityKey } from '@/shared/lib/permission-registry';
import { cn } from '@/shared/lib/utils';

// ─── Domain grouping ─────────────────────────────────────────────────────────

type Domain = 'Finance' | 'Pipeline' | 'Schedule' | 'Production' | 'Workspace' | 'Aion';

/**
 * Single-source-of-truth lookup table mapping registry IDs to a presentation
 * domain. IDs not listed fall through to 'Production'. Kept as a table (not
 * a switch) so the file stays under the cyclomatic-complexity ratchet.
 */
const DOMAIN_BY_ID: Record<string, Domain> = {
  'lobby.financial_pulse': 'Finance',
  'lobby.revenue_trend': 'Finance',
  'lobby.payment_health': 'Finance',
  'lobby.client_concentration': 'Finance',
  'lobby.event_roi_snapshot': 'Finance',
  'lobby.deal_pipeline': 'Pipeline',
  'lobby.pipeline_velocity': 'Pipeline',
  'lobby.passive_pipeline_feed': 'Pipeline',
  'lobby.network': 'Workspace',
  'lobby.network_stream': 'Workspace',
  'lobby.global_pulse': 'Workspace',
  'lobby.passkey_nudge_banner': 'Workspace',
  'lobby.recovery_backup_prompt': 'Workspace',
  'lobby.action_stream': 'Aion',
  'lobby.sentiment_pulse': 'Aion',
  'lobby.today_schedule': 'Schedule',
  'lobby.week_strip': 'Schedule',
  'lobby.urgency_strip': 'Schedule',
  'lobby.action_queue': 'Schedule',
  'lobby.activity_feed': 'Schedule',
  'lobby.event_type_dist': 'Schedule',
};

/** Resolves the presentation domain for a metric. Falls through to Production. */
function domainFor(def: MetricDefinition): Domain {
  if (def.id.startsWith('finance.')) return 'Finance';
  return DOMAIN_BY_ID[def.id] ?? 'Production';
}

const DOMAIN_ORDER: Domain[] = [
  'Schedule',
  'Production',
  'Pipeline',
  'Finance',
  'Workspace',
  'Aion',
];

// ─── Filter / pick ───────────────────────────────────────────────────────────

/**
 * Returns the registry entries pickable for this viewer. Pure — no I/O,
 * no React. Exposed for the unit test.
 */
export function pickableForViewer(
  userCaps: ReadonlyArray<CapabilityKey>,
  currentCardIds: ReadonlyArray<string>,
): MetricDefinition[] {
  const capSet = new Set<string>(userCaps);
  const onLobby = new Set(currentCardIds);
  return Object.values(METRICS).filter((def) => {
    if (onLobby.has(def.id)) return false;
    // Capability gate.
    if (
      !def.requiredCapabilities.every((cap) => capSet.has(cap as string))
    ) {
      return false;
    }
    // Renderer-availability gate.
    const hasWidgetRenderer =
      isWidgetMetric(def) ||
      ('widgetKey' in def && typeof def.widgetKey === 'string' && def.widgetKey.length > 0);
    if (!hasWidgetRenderer) return false;
    // Pickable flag — defaults to true when omitted.
    if (isWidgetMetric(def) && def.pickable === false) return false;
    return true;
  });
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Row({
  def,
  onAdd,
  disabled,
  disabledReason,
}: {
  def: MetricDefinition;
  onAdd: (id: string) => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onAdd(def.id)}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={cn(
        'w-full text-left rounded-[var(--stage-radius-input,10px)] px-3 py-2.5',
        'border border-[var(--stage-edge-subtle)]',
        'bg-[var(--stage-surface-elevated)]',
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:border-[var(--stage-edge-strong,oklch(1_0_0/0.16))]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {def.title}
          </p>
          <p className="text-xs text-[var(--stage-text-secondary)] line-clamp-2 mt-0.5">
            {def.description}
          </p>
        </div>
        <Plus
          className="w-4 h-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
    </button>
  );
}

function Group({
  domain,
  defs,
  onAdd,
  atCap,
  cap,
}: {
  domain: Domain;
  defs: MetricDefinition[];
  onAdd: (id: string) => void;
  atCap: boolean;
  cap: number;
}) {
  if (defs.length === 0) return null;
  const reason = atCap ? `At cap (${cap} cards). Remove one first.` : undefined;
  return (
    <section className="flex flex-col gap-2">
      <p className="stage-label text-[var(--stage-text-tertiary)] uppercase tracking-wider text-[10px]">
        {domain}
      </p>
      <div className="flex flex-col gap-1.5">
        {defs.map((def) => (
          <Row
            key={def.id}
            def={def}
            onAdd={onAdd}
            disabled={atCap}
            disabledReason={reason}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Capability keys the viewer holds in this workspace. Resolved server-side
   * so the drawer is never shown a card the viewer can't load.
   */
  userCaps: ReadonlyArray<CapabilityKey>;
  /** The viewer's current Lobby card list — used to filter and to enforce the cap. */
  currentCardIds: ReadonlyArray<string>;
  /** Hard cap on how many cards a Lobby can hold. */
  cap: number;
  /** Called with the registry id when the user picks a card. */
  onAdd: (id: string) => void;
}

export function LibraryDrawer({
  open,
  onOpenChange,
  userCaps,
  currentCardIds,
  cap,
  onAdd,
}: LibraryDrawerProps) {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const pickable = React.useMemo(
    () => pickableForViewer(userCaps, currentCardIds),
    [userCaps, currentCardIds],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter(
      (def) =>
        def.title.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q),
    );
  }, [pickable, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<Domain, MetricDefinition[]>();
    for (const def of filtered) {
      const d = domainFor(def);
      const list = map.get(d) ?? [];
      list.push(def);
      map.set(d, list);
    }
    return map;
  }, [filtered]);

  const atCap = currentCardIds.length >= cap;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" ariaLabel="Add card from library">
        <SheetHeader>
          <div className="flex flex-col">
            <SheetTitle>Card library</SheetTitle>
            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
              {pickable.length} available · {currentCardIds.length} of {cap} on lobby
            </p>
          </div>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <label className="relative block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--stage-text-tertiary)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards"
              aria-label="Search cards"
              className={cn(
                'w-full h-9 pl-9 pr-3 rounded-[var(--stage-radius-input,10px)]',
                'text-sm tabular-nums',
                'bg-[var(--ctx-well,var(--stage-surface))]',
                'border border-[var(--stage-edge-subtle)]',
                'text-[var(--stage-text-primary)]',
                'placeholder:text-[var(--stage-text-tertiary)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/50',
              )}
            />
          </label>

          {filtered.length === 0 && (
            <div className="rounded-[var(--stage-radius-panel,12px)] border border-[var(--stage-edge-subtle)] px-4 py-6 text-center">
              <p className="text-sm text-[var(--stage-text-primary)]">
                {pickable.length === 0 ? 'Every card is on your lobby' : 'No matches'}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                {pickable.length === 0
                  ? 'Remove one to swap in a different card.'
                  : 'Try a different search term.'}
              </p>
            </div>
          )}

          {DOMAIN_ORDER.map((domain) => (
            <Group
              key={domain}
              domain={domain}
              defs={grouped.get(domain) ?? []}
              onAdd={(id) => {
                if (atCap) return;
                onAdd(id);
              }}
              atCap={atCap}
              cap={cap}
            />
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
