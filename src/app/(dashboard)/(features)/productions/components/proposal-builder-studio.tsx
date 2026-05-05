'use client';

/**
 * ProposalBuilderStudio — the Proposal Builder for /productions/deal/[id]/proposal-builder.
 *
 * Scope: the PM's editing surface. Renders the shared public components
 * (ProposalHero, ProposalSummaryBlock, LineItemGrid) inside a themed
 * document so the builder is WYSIWYG of what the client will see.
 *
 * Responsibilities held here:
 *   - Catalog picker + tag filters + semantic search (Catalog tab)
 *   - Scope selection + per-line inspector (Inspector tab)
 *   - Crew roster + role chip filters + assignment writes (Team tab)
 *   - Proposal-level financial overview + payment terms editor
 *   - Send popover (recipient picker + sendForSignature)
 *
 * Data model notes:
 *   - Edits persist immediately via updateProposalItem / updateProposal.
 *   - Crew assignments write to ops.deal_crew; talent shows on the doc via
 *     the resolve-talent-from-deal-crew helper (same helper the public
 *     /p/[token] reader uses, so builder preview ≡ client view).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getProposalForDeal,
} from '@/features/sales/api/proposal-actions';
import {
  getDealCrew,
  listDealRoster,
  type DealCrewRow,
  type CrewSearchResult,
} from '../actions/deal-crew';
import { ProposalBuilderSidebar } from './proposal-builder/sidebar';
import {
  EditTopBar,
  DocumentBody,
  EmptyStateHero,
} from './proposal-builder/document';
import type { DemoBlock } from './proposal-builder/types';
import { getPortalTheme } from '@/app/(dashboard)/settings/portal/actions';
import {
  resolvePortalCssVars,
  type PortalThemePreset,
  type PortalThemeConfig,
} from '@/shared/lib/portal-theme';
import {
  buildRequiredRolePredicate,
} from '@/features/sales/lib/resolve-talent-from-deal-crew';
import { formatTime12h } from '@/shared/lib/parse-time';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';

const SIDEBAR_STORAGE_KEY = 'unusonic.proposal_builder_rail_open';
const SIDEBAR_WIDTH = 340;

export type ProposalBuilderStudioProps = {
  deal: DealDetail;
  contacts?: { id: string; name: string; email: string }[];
  clientAttached?: boolean;
  /** When true, always render the populated document with demo scope blocks,
   *  even if the deal has no real proposal items yet. Enabled via ?demo=1. */
  forceDemo?: boolean;
  /** Resolved client name from the bill_to stakeholder (page-level). */
  clientName?: string | null;
  /** Resolved venue from the venue_contact stakeholder (page-level). */
  venue?: { name: string; address: string | null } | null;
};

// ---------------------------------------------------------------------------
// Demo scope — used as a visual fallback when the real proposal has no items
// so the visual direction is visible on empty deals. Real deals with items
// always render the real data.
// ---------------------------------------------------------------------------

// DemoBlock + DemoLine types moved to ./proposal-builder/types (Phase 0.5
// split, 2026-04-28). Re-imported above.

const DEMO_BLOCKS: DemoBlock[] = [
  {
    title: 'Audio package',
    summary: 'L-Acoustics Kara line array, MA3 console, 8-channel monitor world, A1 + A2.',
    subtotal: 14800,
    lines: [
      { label: 'System & console', qty: '1 × $9,800', amount: 9800 },
      { label: 'A1 engineer', qty: '2 days', amount: 3200 },
      { label: 'A2 tech', qty: '2 days', amount: 1800 },
      { label: 'Monitor world', amount: 'included' },
    ],
  },
  {
    title: 'Lighting package',
    summary: 'Trussed moving-head rig with haze, two-op lighting console.',
    subtotal: 11200,
    lines: [
      { label: 'Rig & trussing', qty: '1 × $7,400', amount: 7400 },
      { label: 'LD + programmer', qty: '2 days', amount: 2400 },
      { label: 'Follow spot', qty: '1 op, 1 night', amount: 1400 },
    ],
  },
  {
    title: 'Crew & logistics',
    summary: 'Load-in, strike, pre-rig day. Overtime not expected.',
    subtotal: 4400,
    lines: [
      { label: 'Pre-rig day', qty: '4 crew × 8h', amount: 2800 },
      { label: 'Load-in / strike', qty: '6 crew × 4h', amount: 1600 },
    ],
  },
];

const DEMO_SUBTOTAL = DEMO_BLOCKS.reduce((sum, b) => sum + b.subtotal, 0);
const DEMO_TAX_RATE = 0.0825;
const DEMO_TAX = Math.round(DEMO_SUBTOTAL * DEMO_TAX_RATE);
const DEMO_TOTAL = DEMO_SUBTOTAL + DEMO_TAX;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalBuilderStudio({
  deal,
  contacts = [],
  clientAttached = false,
  forceDemo = false,
  clientName = null,
  venue = null,
}: ProposalBuilderStudioProps) {
  const [proposal, setProposal] = useState<ProposalWithItems | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === '1';
  });

  // The document area is true WYSIWYG of the client view: it paints in the
  // workspace's portal theme so what the PM sees is what the client gets.
  // Sidebar + top bar stay Stage Engineering — they're builder chrome.
  const [portalTheme, setPortalTheme] = useState<{
    preset: PortalThemePreset;
    config: PortalThemeConfig;
    name: string | null;
    logoUrl: string | null;
  } | null>(null);

  useEffect(() => {
    getPortalTheme().then((theme) => {
      if (theme) setPortalTheme(theme);
    });
  }, []);

  const portalCssVars = useMemo(
    () =>
      portalTheme
        ? resolvePortalCssVars(portalTheme.preset, portalTheme.config)
        : {},
    [portalTheme],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // storage blocked — state still updates in memory
      }
      return next;
    });
  }, []);

  // Scope-row selection. null = nothing selected (inspector shows proposal-
  // level financials). A number = that scope block is selected (inspector
  // shows line-item details).
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);

  const handleSelectBlock = useCallback(
    (idx: number) => {
      setSelectedBlockIdx((prev) => (prev === idx ? null : idx));
      // If the sidebar is closed, pop it open so the inspector is visible.
      if (!sidebarOpen) {
        setSidebarOpen(true);
        try {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '1');
        } catch {
          // ignore
        }
      }
    },
    [sidebarOpen],
  );

  const refetchProposal = useCallback(() => {
    if (forceDemo) return;
    getProposalForDeal(deal.id).then(setProposal);
  }, [deal.id, forceDemo]);

  useEffect(() => {
    refetchProposal();
  }, [refetchProposal]);

  // Crew data — deal_crew rows (assigned + open slots) and the workspace roster
  // (staff + network preferred). `getDealCrew` also runs syncDealCrewFromProposal
  // internally, so this is the merge-on-load point that catches Production Team
  // Card manual assignments the builder wouldn't otherwise see.
  const [dealCrew, setDealCrew] = useState<DealCrewRow[]>([]);
  const [roster, setRoster] = useState<CrewSearchResult[]>([]);

  const refetchCrew = useCallback(() => {
    if (forceDemo) return;
    getDealCrew(deal.id).then(setDealCrew);
  }, [deal.id, forceDemo]);

  const refetchRoster = useCallback(() => {
    if (forceDemo) return;
    listDealRoster(deal.id).then(setRoster);
  }, [deal.id, forceDemo]);

  useEffect(() => {
    refetchCrew();
    refetchRoster();
  }, [refetchCrew, refetchRoster]);

  // Three rendering states:
  //   1. forceDemo + no real items → DEMO_BLOCKS (explicit ?demo=1 preview).
  //   2. Real items exist          → render DocumentBody + real scope blocks.
  //   3. No items, not forceDemo   → EmptyStateHero + empty scope blocks.
  //                                  Do NOT leak DEMO_BLOCKS into real deals —
  //                                  deleting everything off a real proposal
  //                                  should show $0 and "Line items" empty,
  //                                  not the $30,400 demo fixture.
  const itemCount = proposal?.items?.length ?? 0;
  const useDemoBlocks = forceDemo && itemCount === 0;
  const hasRealItems = useDemoBlocks || itemCount > 0;

  const scopeBlocks = useMemo<DemoBlock[]>(() => {
    if (useDemoBlocks) return DEMO_BLOCKS;
    if (!proposal || itemCount === 0) return [];
    const items = proposal.items ?? [];
    const blocks: DemoBlock[] = [];
    let current: DemoBlock | null = null;
    for (const item of items) {
      const raw = item as Record<string, unknown>;
      const name = (raw.name as string | undefined) ?? (raw.description as string | undefined) ?? 'Line item';
      const qty = Number(raw.quantity ?? 1);
      // Effective price: override_price wins when set, else unit_price (the
      // catalog baseline). Matches LineItemGrid + calculateProposalTotal
      // everywhere else. Previously this collapsed override_price whenever
      // unit_price was non-null (always), so PM price edits never showed up
      // in the top-bar Total or FinancialInspector subtotal.
      const baseUnitPrice = Number(raw.unit_price ?? 0);
      const overridePrice = raw.override_price != null ? Number(raw.override_price) : null;
      const effectiveUnitPrice = overridePrice ?? baseUnitPrice;
      const rowUnitType = (raw.unit_type as string | null | undefined) ?? null;
      const rowUnitMultiplier = raw.unit_multiplier != null ? Number(raw.unit_multiplier) : null;
      // Symmetric with LineItemGrid + calculateProposalTotal: multiplier only
      // applies for hour/day items, else 1.
      const rowMultiplier = (rowUnitType === 'hour' || rowUnitType === 'day')
        ? (rowUnitMultiplier != null && rowUnitMultiplier > 0 ? rowUnitMultiplier : 1)
        : 1;
      const amount = qty * effectiveUnitPrice * rowMultiplier;
      const rowActualCost = raw.actual_cost != null ? Number(raw.actual_cost) : null;
      const sortOrder = Number(raw.sort_order ?? 0);
      const isHeader = raw.is_package_header === true || raw.isPackageHeader === true;
      const childCatalogId =
        (raw.origin_package_id as string | null | undefined) ??
        (raw.package_id as string | null | undefined) ??
        null;
      if (isHeader) {
        if (current) blocks.push(current);
        const snap = (raw.definition_snapshot as Record<string, unknown> | null | undefined) ?? null;
        const category = (snap?.category as string | null | undefined) ?? null;
        const hasInstance = (raw.package_instance_id as string | null | undefined) != null;
        current = {
          title: name,
          summary: (raw.description as string | undefined) ?? '',
          subtotal: amount,
          lines: [],
          maxSortOrder: sortOrder,
          headerSortOrder: sortOrder,
          headerItemId: raw.id as string | undefined,
          catalogItemId: childCatalogId,
          childCatalogItemIds: [],
          packageInstanceId: (raw.package_instance_id as string | null | undefined) ?? null,
          isHeader: true,
          quantity: qty,
          overridePrice,
          unitPrice: baseUnitPrice,
          internalNotes: (raw.internal_notes as string | null | undefined) ?? null,
          category,
          unitType: rowUnitType,
          unitMultiplier: rowUnitMultiplier,
          effectiveMultiplier: rowMultiplier,
          isOptional: raw.is_optional === true,
          isClientVisible: raw.is_client_visible !== false,
          // Bundle header cost = summed child costs (we'll add as children
          // stream in below). Start at 0. A single-item package with no
          // children simply stays at 0 until a child row closes the loop.
          actualCost: hasInstance ? 0 : rowActualCost,
          costIsComputed: hasInstance,
        };
      } else if (raw.package_instance_id && current && current.packageInstanceId === raw.package_instance_id) {
        // Bundle child — append to the open bundle header block.
        current.subtotal += amount;
        current.lines.push({
          label: name,
          qty: qty !== 1 ? `${qty} × $${effectiveUnitPrice.toLocaleString()}` : undefined,
          amount: amount || 'included',
        });
        if (sortOrder > (current.maxSortOrder ?? -1)) {
          current.maxSortOrder = sortOrder;
        }
        if (childCatalogId && current.childCatalogItemIds) {
          current.childCatalogItemIds.push(childCatalogId);
        }
        // Sum children's cost into the bundle header's displayed cost,
        // including each child's own multiplier. Matches get-event-ledger's
        // "exclude bundle header, sum children" rule so PM view + Event ROI
        // dashboard agree on the math.
        if (rowActualCost != null) {
          current.actualCost = (current.actualCost ?? 0) + rowActualCost * qty * rowMultiplier;
        }
      } else {
        // Standalone a-la-carte row — its own block so Price/Qty/Notes edit cleanly.
        if (current) blocks.push(current);
        const snap = (raw.definition_snapshot as Record<string, unknown> | null | undefined) ?? null;
        const category = (snap?.category as string | null | undefined) ?? null;
        current = {
          title: name,
          summary: (raw.description as string | undefined) ?? '',
          subtotal: amount,
          lines: [],
          maxSortOrder: sortOrder,
          headerSortOrder: sortOrder,
          headerItemId: raw.id as string | undefined,
          catalogItemId: childCatalogId,
          childCatalogItemIds: [],
          packageInstanceId: null,
          isHeader: false,
          quantity: qty,
          overridePrice,
          unitPrice: baseUnitPrice,
          internalNotes: (raw.internal_notes as string | null | undefined) ?? null,
          category,
          unitType: rowUnitType,
          unitMultiplier: rowUnitMultiplier,
          effectiveMultiplier: rowMultiplier,
          isOptional: raw.is_optional === true,
          isClientVisible: raw.is_client_visible !== false,
          actualCost: rowActualCost,
          costIsComputed: false,
        };
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }, [useDemoBlocks, proposal, itemCount]);

  // Subtotal mirrors the rendering state. Demo preview: use the fixture total.
  // Real deal (empty or not): sum real blocks — an empty proposal reads $0,
  // not the demo $30,400 fixture.
  const subtotal = useDemoBlocks
    ? DEMO_SUBTOTAL
    : scopeBlocks.reduce((s, b) => s + b.subtotal, 0);

  // Proposal-level expected cost: sum of resolved block costs (which already
  // roll up bundle children). Blocks with unknown cost contribute 0. The
  // `costKnown` flag tracks whether any block had a resolved cost — drives
  // whether FinancialInspector shows a real margin or em-dashes.
  const { totalCost, costKnown } = useMemo(() => {
    if (useDemoBlocks) return { totalCost: 0, costKnown: false };
    let total = 0;
    let known = false;
    for (const b of scopeBlocks) {
      if (b.actualCost != null) {
        total += b.actualCost;
        known = true;
      }
    }
    return { totalCost: total, costKnown: known };
  }, [useDemoBlocks, scopeBlocks]);

  // Required-role predicate: which (catalog_item_id, role_note) pairs carry
  // the explicit `required: true` flag in their snapshot. Built once in the
  // parent and passed down so LineInspector, the Team tab's Needs chips, and
  // the top-bar Send warning all agree.
  const isRequiredRole = useMemo(
    () => buildRequiredRolePredicate(
      (proposal?.items ?? []) as unknown as Array<{
        origin_package_id?: string | null;
        package_id?: string | null;
        definition_snapshot?: unknown;
      }>,
    ),
    [proposal],
  );

  // Unfilled required slots across the entire proposal — drives the Send
  // warning badge. A row counts when: entity_id is null AND its (catalog,
  // role) pair is explicitly required.
  const unfilledRequiredCount = useMemo(() => {
    if (useDemoBlocks) return 0;
    return dealCrew.filter(
      (r) =>
        r.entity_id === null &&
        r.catalog_item_id != null &&
        r.role_note != null &&
        isRequiredRole(r.catalog_item_id, r.role_note),
    ).length;
  }, [dealCrew, isRequiredRole, useDemoBlocks]);
  const taxRate = proposal
    ? Number(((proposal as any)?.tax_rate_snapshot ?? 0))
    : DEMO_TAX_RATE;
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax;

  const status = (proposal?.status as string | undefined) ?? 'draft';
  const statusLabel = statusText(status);
  const dateLabel = deal.proposed_date ? formatShowDate(deal.proposed_date) : null;
  const timeLabel =
    deal.event_start_time
      ? `${formatTime12h(deal.event_start_time)}${deal.event_end_time ? ` – ${formatTime12h(deal.event_end_time)}` : ''}`
      : null;
  const dealTitle = deal.title || 'Untitled production';

  // The builder is the focus — client-facing preview mode is intentionally
  // out of scope. Layout: docked sidebar (catalog + inspector) on the left,
  // flush against the main app nav, with the document as the main area.
  // Matches the Aion page sidebar pattern: width-animated open↔close, state
  // persisted in localStorage.

  return (
    <div className="flex h-full w-full min-h-full bg-[var(--stage-void)]">
      <ProposalBuilderSidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        scopeBlocks={scopeBlocks}
        selectedBlockIdx={selectedBlockIdx}
        onSelectBlock={handleSelectBlock}
        subtotal={subtotal}
        tax={tax}
        total={total}
        taxRate={taxRate}
        workspaceId={deal.workspace_id ?? null}
        dealId={deal.id}
        proposalId={proposal?.id ?? null}
        forceDemo={forceDemo}
        insertAfterSortOrder={
          selectedBlockIdx != null
            ? scopeBlocks[selectedBlockIdx]?.maxSortOrder ?? null
            : null
        }
        onItemAdded={() => {
          refetchProposal();
          // getDealCrew runs syncDealCrewFromProposal internally, so refetching
          // crew after a package is added picks up the new required-role open
          // slots (e.g. adding a DJ package surfaces an open "DJ" slot).
          refetchCrew();
        }}
        onRefetchProposal={refetchProposal}
        onClearSelection={() => setSelectedBlockIdx(null)}
        dealCrew={dealCrew}
        roster={roster}
        onRefetchCrew={refetchCrew}
        isRequiredRole={isRequiredRole}
        totalCost={totalCost}
        costKnown={costKnown}
        proposal={proposal}
      />

      <div className="flex flex-col flex-1 min-w-0 relative">
        <EditTopBar
          dealId={deal.id}
          dealTitle={dealTitle}
          statusLabel={statusLabel}
          status={status}
          total={total}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          unfilledRequiredCount={unfilledRequiredCount}
          contacts={contacts}
          clientAttached={clientAttached}
          lineItemCount={itemCount}
          proposalStatus={status}
          onRefetchProposal={refetchProposal}
        />

        <main
          className="flex-1 min-h-0 overflow-auto"
          style={
            portalTheme && hasRealItems
              ? ({
                  ...portalCssVars,
                  backgroundColor: 'var(--portal-bg)',
                  color: 'var(--portal-text)',
                  fontFamily: 'var(--portal-font-body)',
                } as React.CSSProperties)
              : undefined
          }
        >
          {!hasRealItems ? (
            <EmptyStateHero dealId={deal.id} />
          ) : (
            <DocumentBody
              deal={deal}
              scopeBlocks={scopeBlocks}
              subtotal={subtotal}
              tax={tax}
              taxRate={taxRate}
              total={total}
              dateLabel={dateLabel}
              timeLabel={timeLabel}
              dealTitle={dealTitle}
              editable
              selectedBlockIdx={selectedBlockIdx}
              onSelectBlock={handleSelectBlock}
              themed={portalTheme !== null}
              proposal={proposal}
              portalTheme={portalTheme}
              clientName={clientName}
              venue={venue}
              dealCrew={dealCrew}
            />
          )}
        </main>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Helpers — formatMoney moved to ./proposal-builder/helpers.ts (Phase 0.5
// split, 2026-04-28). formatShowDate + statusText stay local to this file.
// ---------------------------------------------------------------------------

function formatShowDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusText(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Accepted';
    case 'sent':
      return 'Sent · awaiting reply';
    case 'viewed':
      return 'Viewed just now';
    default:
      return 'Draft · autosaved';
  }
}
