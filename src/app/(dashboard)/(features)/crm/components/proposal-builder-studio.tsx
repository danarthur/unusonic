'use client';

/**
 * ProposalBuilderStudio — the Proposal Builder for /crm/deal/[id]/proposal-builder.
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
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Copy,
  FileText,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getProposalForDeal,
  addPackageToProposal,
  updateProposalItem,
  updateProposal,
  deleteProposalItem,
  deleteProposalItemsByPackageInstanceId,
  unpackPackageInstance,
  sendForSignature,
} from '@/features/sales/api/proposal-actions';
import {
  getCatalogPackagesWithTags,
  type PackageWithTags,
  type PackageTag,
} from '@/features/sales/api/package-actions';
import {
  getDealCrew,
  addManualDealCrew,
  assignDealCrewEntity,
  removeDealCrew,
  listDealRoster,
  type DealCrewRow,
  type CrewSearchResult,
} from '../actions/deal-crew';
import {
  getWorkspaceTags,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import { semanticSearchCatalog } from '@/features/sales/api/catalog-embeddings';
import { getPortalTheme } from '@/app/(dashboard)/settings/portal/actions';
import {
  resolvePortalCssVars,
  resolvePortalTheme,
  type PortalThemePreset,
  type PortalThemeConfig,
} from '@/shared/lib/portal-theme';
import { ProposalHero } from '@/features/sales/ui/public/ProposalHero';
import { LineItemGrid } from '@/features/sales/ui/public/LineItemGrid';
import { ProposalSummaryBlock } from '@/features/sales/ui/public/ProposalSummaryBlock';
import { SectionTrim } from '@/features/sales/ui/public/SectionTrim';
import type {
  PublicProposalDTO,
  PublicProposalItem,
} from '@/features/sales/model/public-proposal';
import {
  buildRequiredRolePredicate,
  buildTalentRolePredicate,
  resolveTalentForItem,
} from '@/features/sales/lib/resolve-talent-from-deal-crew';
import { StagePanel } from '@/shared/ui/stage-panel';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
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

type DemoLine = { label: string; qty?: string; amount: number | 'included' };
type DemoBlock = {
  title: string;
  summary: string;
  subtotal: number;
  lines: DemoLine[];
  /** Highest sort_order among this block's proposal_items. Used to position
   *  new items inserted "below" this block. undefined for demo data. */
  maxSortOrder?: number;
  /** The header row's own sort_order — the "entry point" for swap and for
   *  any operation that wants to place something at this block's position
   *  rather than after its children. */
  headerSortOrder?: number;
  /** proposal_item.id of this block's header row. undefined for demo data. */
  headerItemId?: string;
  /** origin_package_id / package_id of the header — matches ops.deal_crew.catalog_item_id
   *  so we can link required-role rows to this block. null for a-la-carte / demo. */
  catalogItemId?: string | null;
  /** origin_package_id of every child row under this header. Required-role crew
   *  lives on the ingredients for bundles — e.g. Gold Package header has no
   *  crew_meta, but its DJ child and Chauvet child do — so the LineInspector
   *  must look up deal_crew rows keyed to any of these ids, not just the header. */
  childCatalogItemIds?: string[];
  /** package_instance_id shared by a bundle's header + children. When set +
   *  isHeader=true, Unpack and whole-bundle Delete become available. */
  packageInstanceId?: string | null;
  /** True when the header row is the is_package_header=true row of a bundle. */
  isHeader?: boolean;
  /** Editable fields — persist via updateProposalItem. Seeded from the header row. */
  quantity?: number;
  overridePrice?: number | null;
  unitPrice?: number;
  internalNotes?: string | null;
  /** Expected cost per unit, baked from the catalog's target_cost at add time.
   *  For bundle headers this is the SUMMED child cost (children carry the real
   *  cost; the header has none of its own) — read-only display.
   *  For a-la-carte / single-item package rows this is the row's own
   *  actual_cost — editable via the Est. cost input. */
  actualCost?: number | null;
  /** When true, cost is computed from children (bundle header) and the Est.
   *  cost input should be read-only with a "Sum of ingredients" note. */
  costIsComputed?: boolean;
  /** Catalog category of the header row's package, e.g. 'package' / 'rental' / 'service'.
   *  Drives the small category pill in the inspector header. */
  category?: string | null;
  /** Catalog unit type — 'flat' / 'hour' / 'day'. Read-only here (catalog-level
   *  concept; changing it mid-proposal would reshape the math contract). */
  unitType?: string | null;
  /** For 'hour' / 'day' items: how many hours/days this line represents. Editable
   *  per proposal — a service with a catalog default of 8 hours can be bumped to
   *  10 for a long night. Scales both revenue and cost. */
  unitMultiplier?: number | null;
  /** Cached effective multiplier: unitMultiplier when unitType is hour/day, else 1.
   *  Computed once in the reducer so downstream consumers don't re-derive it. */
  effectiveMultiplier?: number;
  /** When true, the client sees a checkbox on this line and can decline it.
   *  Not shown on the scope pill unless isClientVisible is also true. */
  isOptional?: boolean;
  /** When false, this line is hidden from the client-facing proposal entirely.
   *  Still visible + editable in the builder; still counted in margin math. */
  isClientVisible?: boolean;
};

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
// Edit-mode top bar
// ---------------------------------------------------------------------------

function EditTopBar({
  dealId,
  dealTitle,
  statusLabel,
  status,
  total,
  sidebarOpen,
  onToggleSidebar,
  unfilledRequiredCount,
  contacts,
  clientAttached,
  lineItemCount,
  proposalStatus,
  onRefetchProposal,
}: {
  dealId: string;
  dealTitle: string;
  statusLabel: string;
  status: string;
  total: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  unfilledRequiredCount: number;
  contacts: { id: string; name: string; email: string }[];
  clientAttached: boolean;
  lineItemCount: number;
  proposalStatus: string;
  onRefetchProposal: () => void;
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [signerId, setSignerId] = useState<string | null>(null);
  const [signingName, setSigningName] = useState('');
  const [signingEmail, setSigningEmail] = useState('');
  const [customForm, setCustomForm] = useState(false);

  // Default the signer to the first contact with an email when the panel
  // first opens — most common flow is "send to bill_to contact."
  useEffect(() => {
    if (!sendOpen) return;
    if (signerId || signingEmail.trim()) return;
    const first = contacts[0];
    if (first) {
      setSignerId(first.id);
      setSigningName(first.name);
      setSigningEmail(first.email);
    } else {
      setCustomForm(true);
    }
  }, [sendOpen, contacts, signerId, signingEmail]);

  const canSend =
    clientAttached &&
    lineItemCount > 0 &&
    signingEmail.trim().length > 0 &&
    !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const res = await sendForSignature(
      dealId,
      signingEmail.trim(),
      signingName.trim() || signingEmail.trim(),
    );
    setSending(false);
    if (res.success) {
      toast.success('Proposal sent');
      if (res.docusealFallback) {
        toast.warning(`E-signature step skipped (${res.docusealFallback.reason}). Sent as a plain proposal link.`);
      }
      setSendOpen(false);
      onRefetchProposal();
    } else {
      toast.error(res.error);
    }
  };

  const alreadySent = proposalStatus === 'sent' || proposalStatus === 'viewed' || proposalStatus === 'accepted';

  return (
    <header
      data-surface="surface"
      className="relative z-20 shrink-0 flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]"
    >
      {!sidebarOpen && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 -ml-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Open build tools"
        >
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      )}

      <Link
        href={`/crm?selected=${dealId}`}
        className="p-2 -ml-2 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        aria-label="Back to deal"
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
      </Link>

      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-center gap-2 stage-label text-[var(--stage-text-tertiary)]">
          <span>Proposal</span>
          <span className="text-[var(--stage-text-tertiary)] select-none">·</span>
          <StatusDot status={status} />
          <span className="text-[var(--stage-text-secondary)] normal-case tracking-normal">
            {statusLabel}
          </span>
        </div>
        <h1 className="text-[15px] font-medium text-[var(--stage-text-primary)] tracking-tight truncate leading-tight">
          {dealTitle}
        </h1>
      </div>

      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <div className="flex flex-col items-end leading-tight">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Total</span>
          <span className="stage-readout tabular-nums text-[var(--stage-text-primary)]">
            {formatMoney(total)}
          </span>
        </div>

        <div className="h-8 w-px bg-[var(--stage-edge-subtle)] mx-1" aria-hidden />

        <div className="relative">
          <button
            type="button"
            onClick={() => setSendOpen((v) => !v)}
            className="stage-btn stage-btn-primary inline-flex items-center gap-2 h-9"
            aria-expanded={sendOpen}
            title={
              unfilledRequiredCount > 0
                ? `${unfilledRequiredCount} required role${unfilledRequiredCount === 1 ? '' : 's'} still open`
                : undefined
            }
          >
            <Send size={14} strokeWidth={1.75} />
            {alreadySent ? 'Resend' : 'Send'}
            {unfilledRequiredCount > 0 && (
              <span
                className="inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-medium tabular-nums"
                style={{
                  backgroundColor: 'oklch(0.82 0.16 75 / 0.18)',
                  color: 'var(--color-unusonic-warning)',
                }}
                aria-label={`${unfilledRequiredCount} required roles unfilled`}
              >
                {unfilledRequiredCount} open
              </span>
            )}
          </button>

          {/* Send popover — recipient picker + DocuSeal-backed send. Reuses
               the same sendForSignature action as the legacy builder; this is
               a thinner UI because the visual mock auto-saves items on blur
               so we don't need a pre-send upsert. */}
          {sendOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSendOpen(false)}
                aria-hidden
              />
              <div
                className="absolute top-full right-0 mt-2 w-80 z-50 p-4 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-top)] bg-[var(--stage-surface-raised)] shadow-[0_18px_40px_-12px_oklch(0_0_0/0.45)]"
                data-surface="raised"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between">
                    <span className="stage-label text-[var(--stage-text-tertiary)]">Send to</span>
                    {!clientAttached && (
                      <span className="stage-label text-[var(--color-unusonic-warning)] normal-case tracking-normal">
                        No bill_to contact attached
                      </span>
                    )}
                  </div>

                  {/* Contact chips — most common path is picking an existing stakeholder. */}
                  {contacts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {contacts.map((c) => {
                        const active = signerId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (active) {
                                setSignerId(null);
                                setSigningName('');
                                setSigningEmail('');
                              } else {
                                setSignerId(c.id);
                                setSigningName(c.name);
                                setSigningEmail(c.email);
                                setCustomForm(false);
                              }
                            }}
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap inline-flex items-center gap-1',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                            )}
                            style={
                              active
                                ? {
                                    backgroundColor: 'var(--stage-surface-raised)',
                                    borderColor: 'var(--stage-edge-top)',
                                    color: 'var(--stage-text-primary)',
                                  }
                                : {
                                    backgroundColor: 'transparent',
                                    borderColor: 'oklch(1 0 0 / 0.08)',
                                    color: 'var(--stage-text-secondary)',
                                  }
                            }
                            aria-pressed={active}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomForm((v) => !v);
                          if (!customForm) {
                            setSignerId(null);
                            setSigningName('');
                            setSigningEmail('');
                          }
                        }}
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap"
                        style={{
                          backgroundColor: 'transparent',
                          borderColor: 'oklch(1 0 0 / 0.08)',
                          color: customForm
                            ? 'var(--stage-text-primary)'
                            : 'var(--stage-text-secondary)',
                        }}
                      >
                        {customForm ? 'Cancel' : '+ Other email'}
                      </button>
                    </div>
                  )}

                  {(customForm || contacts.length === 0) && (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={signingName}
                        onChange={(e) => setSigningName(e.target.value)}
                        placeholder="Recipient name"
                        className="stage-input h-8 px-3 text-[12px] text-[var(--stage-text-primary)]"
                        aria-label="Recipient name"
                      />
                      <input
                        type="email"
                        value={signingEmail}
                        onChange={(e) => setSigningEmail(e.target.value)}
                        placeholder="Recipient email"
                        className="stage-input h-8 px-3 text-[12px] text-[var(--stage-text-primary)]"
                        aria-label="Recipient email"
                      />
                    </div>
                  )}

                  {unfilledRequiredCount > 0 && (
                    <p className="text-[11px] text-[var(--color-unusonic-warning)] leading-[1.4]">
                      {unfilledRequiredCount} required role{unfilledRequiredCount === 1 ? '' : 's'} still open. You can send anyway.
                    </p>
                  )}
                  {lineItemCount === 0 && (
                    <p className="text-[11px] text-[var(--color-unusonic-warning)] leading-[1.4]">
                      Add at least one line item before sending.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend}
                    className="stage-btn stage-btn-primary w-full h-9 inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Send size={13} strokeWidth={1.75} />
                    {sending ? 'Sending…' : alreadySent ? 'Resend proposal' : 'Send proposal'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// The document body — shared between edit and preview (with/without affordances)
// ---------------------------------------------------------------------------

type DocumentBodyProps = {
  deal: DealDetail;
  scopeBlocks: DemoBlock[];
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  dateLabel: string | null;
  timeLabel: string | null;
  dealTitle: string;
  editable: boolean;
  /** Index of the currently-inspected scope block (null = nothing selected).
   *  Highlights with an accent left-stripe. */
  selectedBlockIdx?: number | null;
  /** Called when a scope row is clicked. Toggles selection. */
  onSelectBlock?: (idx: number) => void;
  /** When true, remap internal --stage-* tokens to --portal-* so the document
   *  paints in the workspace's client-facing theme — true WYSIWYG of what the
   *  client sees. Top bar + sidebar stay Unusonic-themed (builder chrome). */
  themed?: boolean;
};

/** CSS variable overrides applied to the DocumentBody root when themed.
 *  Every downstream class like `text-[var(--stage-text-primary)]` resolves to
 *  the portal token instead, so the existing markup inherits the theme. */
const THEMED_TOKEN_OVERRIDES: React.CSSProperties = {
  // @ts-expect-error — custom CSS properties are valid on CSSProperties
  '--stage-text-primary': 'var(--portal-text)',
  '--stage-text-secondary': 'var(--portal-text-secondary)',
  '--stage-text-tertiary':
    'color-mix(in oklch, var(--portal-text-secondary) 55%, transparent)',
  '--stage-edge-subtle': 'var(--portal-border-subtle)',
  '--stage-edge-top': 'var(--portal-border)',
  '--stage-accent': 'var(--portal-accent)',
  '--stage-accent-muted':
    'color-mix(in oklch, var(--portal-accent) 12%, transparent)',
  '--stage-surface-elevated': 'var(--portal-surface)',
  '--stage-surface-raised': 'var(--portal-surface)',
  '--stage-void': 'var(--portal-bg)',
  fontFamily: 'var(--portal-font-body)',
};

/**
 * Consolidate multi-row bundles into a single displayable row.
 *
 * `addPackageToProposal` writes a bundle as a header row (is_package_header=true,
 * carrying the bundle price) followed by child rows (at unit_price=0). Rendering
 * all of those as separate cards creates noise and zero-priced children.
 *
 * This adapter keeps the header, rolls the children's names into the header's
 * description as an "Includes: …" list, and drops the children from the array.
 * A la carte items (no package_instance_id) and single-item packages pass through
 * unchanged. Sort order is preserved.
 */
function consolidateBundleRows(
  items: ProposalWithItems['items'],
): ProposalWithItems['items'] {
  type AnyItem = (typeof items)[number] & {
    package_instance_id?: string | null;
    is_package_header?: boolean | null;
    sort_order?: number | null;
    name?: string | null;
    description?: string | null;
  };
  const byInstance = new Map<string, AnyItem[]>();
  const standalone: AnyItem[] = [];

  for (const raw of items as AnyItem[]) {
    const instanceId = raw.package_instance_id ?? null;
    if (instanceId) {
      if (!byInstance.has(instanceId)) byInstance.set(instanceId, []);
      byInstance.get(instanceId)!.push(raw);
    } else {
      standalone.push(raw);
    }
  }

  const result: AnyItem[] = [];

  for (const group of byInstance.values()) {
    const header = group.find((i) => i.is_package_header === true);
    if (!header) {
      // No header (single-item package) — pass through all rows in the group.
      result.push(...group);
      continue;
    }
    const children = group.filter((i) => i.is_package_header !== true);
    const inclusions = children
      .map((c) => c.name ?? '')
      .filter(Boolean)
      .join(' · ');
    const originalDesc = header.description ?? '';
    const nextDesc = inclusions
      ? (originalDesc
          ? `${originalDesc}\nIncludes: ${inclusions}`
          : `Includes: ${inclusions}`)
      : originalDesc;
    // Preserve the children's catalog ids on the consolidated header so
    // downstream code (talent threading, required-crew lookup) can still
    // find deal_crew rows keyed to the ingredient package — without them,
    // a bundle's assigned DJ is invisible because the deal_crew row points
    // at the DJ package, not the bundle.
    const childCatalogIds = children
      .map((c) => (c as unknown as Record<string, unknown>).origin_package_id as string | null ?? (c as unknown as Record<string, unknown>).package_id as string | null)
      .filter(Boolean) as string[];
    result.push({
      ...header,
      description: nextDesc,
      // Clear display_group_name so the section header doesn't duplicate the
      // bundle title (now carried by the header row's own name).
      display_group_name: null,
      child_catalog_ids: childCatalogIds,
    } as AnyItem);
  }

  for (const item of standalone) {
    result.push({
      ...item,
      display_group_name: null,
    } as AnyItem);
  }

  result.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return result as ProposalWithItems['items'];
}

function buildPublicProposalDTO(
  deal: DealDetail,
  proposal: ProposalWithItems,
  workspaceMeta: {
    name?: string;
    logoUrl?: string | null;
    portalThemePreset?: string | null;
    portalThemeConfig?: Record<string, unknown> | null;
  },
  total: number,
  clientName: string | null,
  venue: { name: string; address: string | null } | null,
  dealCrew: DealCrewRow[],
): PublicProposalDTO {
  // Build startsAt / endsAt as raw local-time strings (no Z suffix) so
  // formatTime in ProposalSummaryBlock doesn't drift across timezones. This
  // mirrors get-public-proposal.ts so the builder preview and sent proposal
  // display identical times. When no start time is set, the hero gates on
  // `hasEventTimes`, so the time component is never shown — we still embed
  // noon for a safe fallback rather than midnight (which reads as "12 AM"
  // if any gate regressed).
  const dealStart = deal.event_start_time ?? null;
  const dealEnd = deal.event_end_time ?? null;
  const startsAt = deal.proposed_date
    ? dealStart
      ? `${deal.proposed_date}T${dealStart}:00`
      : `${deal.proposed_date}T12:00:00`
    : null;
  const endsAt = deal.proposed_date && dealEnd
    ? `${deal.proposed_date}T${dealEnd}:00`
    : null;

  const rawItems = proposal.items ?? [];
  const displayItems = consolidateBundleRows(rawItems);

  // Predicate built from pre-consolidation items so bundle ingredients
  // contribute their booking_type='talent' flags — the bundle header row
  // typically carries no crew_meta of its own.
  const isTalentRole = buildTalentRolePredicate(
    rawItems as unknown as Array<{
      origin_package_id?: string | null;
      package_id?: string | null;
      definition_snapshot?: unknown;
    }>,
  );

  return {
    proposal: proposal as PublicProposalDTO['proposal'],
    event: {
      id: (deal as { event_id?: string | null }).event_id ?? deal.id,
      title: deal.title ?? 'Untitled production',
      clientName,
      startsAt,
      endsAt,
      hasEventTimes: !!deal.event_start_time,
      eventStartTime: deal.event_start_time ?? null,
      eventEndTime: deal.event_end_time ?? null,
    },
    workspace: {
      id: deal.workspace_id ?? '',
      name: workspaceMeta.name ?? 'Your production company',
      logoUrl: workspaceMeta.logoUrl ?? null,
      portalThemePreset: workspaceMeta.portalThemePreset ?? null,
      portalThemeConfig: workspaceMeta.portalThemeConfig ?? null,
    },
    items: displayItems.map((item) => {
      const raw = item as Record<string, unknown>;
      const catalogIds: string[] = [];
      const origin = (raw.origin_package_id as string | null | undefined) ?? null;
      const pkg = (raw.package_id as string | null | undefined) ?? null;
      if (origin) catalogIds.push(origin);
      if (pkg && pkg !== origin) catalogIds.push(pkg);
      // Bundle header: preserved by consolidateBundleRows so we can match
      // deal_crew rows keyed to ingredient packages.
      for (const id of (raw.child_catalog_ids as string[] | undefined) ?? []) {
        if (!catalogIds.includes(id)) catalogIds.push(id);
      }
      const talent = resolveTalentForItem(catalogIds, dealCrew, isTalentRole);

      return {
        ...item,
        isOptional: false,
        clientSelected: true,
        packageImageUrl: null,
        talentAvatarUrl: talent.talentAvatarUrl,
        talentNames: talent.talentNames,
        talentEntityIds: talent.talentEntityIds,
      };
    }) as unknown as PublicProposalItem[],
    total,
    venue,
    embedSrc: null,
    signedPdfDownloadUrl: null,
  };
}

function DocumentBody({
  deal,
  scopeBlocks,
  subtotal,
  tax,
  taxRate,
  total,
  dateLabel,
  timeLabel,
  dealTitle,
  editable,
  selectedBlockIdx,
  onSelectBlock,
  themed = false,
  proposal,
  portalTheme,
  clientName,
  venue,
  dealCrew,
}: DocumentBodyProps & {
  proposal: ProposalWithItems | null;
  portalTheme:
    | {
        preset: PortalThemePreset;
        config: PortalThemeConfig;
        name: string | null;
        logoUrl: string | null;
      }
    | null;
  clientName: string | null;
  venue: { name: string; address: string | null } | null;
  dealCrew: DealCrewRow[];
}) {
  // True WYSIWYG: render the actual public proposal components composed the
  // same way the client sees them. Builder-only chrome (sign panel, deposit
  // step, "It's a Date" celebratory state) is replaced with a builder notice.
  if (!proposal) return null;

  const dto = buildPublicProposalDTO(
    deal,
    proposal,
    {
      name: portalTheme?.name ?? undefined,
      logoUrl: portalTheme?.logoUrl ?? null,
      portalThemePreset: portalTheme?.preset ?? null,
      portalThemeConfig: (portalTheme?.config ?? null) as Record<string, unknown> | null,
    },
    total,
    clientName,
    venue,
    dealCrew,
  );

  // Pull preset-driven layout decisions (item layout, section trim, accent band).
  const tokens = portalTheme
    ? resolvePortalTheme(portalTheme.preset, portalTheme.config).tokens
    : null;
  const itemLayout = (tokens?.itemLayout as 'card' | 'row' | 'minimal') ?? 'card';
  const sectionTrim = (tokens?.sectionTrim as 'none' | 'wave' | 'angle' | 'dots' | 'straight') ?? 'none';
  const accentBand = (tokens?.accentBand as 'none' | 'top' | 'bottom') ?? 'none';
  const sectionBgAlternate = tokens?.sectionBgAlternate === 'true';

  return (
    <div
      className="flex flex-col w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16"
      style={{
        maxWidth: 'var(--portal-content-max-width, 56rem)',
        ...(themed ? THEMED_TOKEN_OVERRIDES : {}),
      }}
    >
      <ProposalHero data={dto} className="mb-8 sm:mb-10" accentBand={accentBand} />

      <ProposalSummaryBlock
        eventTitle={dto.event.title}
        startsAt={dto.event.startsAt}
        endsAt={dto.event.endsAt}
        hasEventTimes={dto.event.hasEventTimes}
        venue={dto.venue}
        total={dto.total}
        depositPercent={(dto.proposal as { deposit_percent?: number | null }).deposit_percent ?? null}
        paymentDueDays={(dto.proposal as { payment_due_days?: number | null }).payment_due_days ?? null}
        paymentNotes={(dto.proposal as { payment_notes?: string | null }).payment_notes ?? null}
        scopeNotes={(dto.proposal as { scope_notes?: string | null }).scope_notes ?? null}
        className="mb-8"
      />

      <SectionTrim variant={sectionTrim} className="my-6 sm:my-8" />

      <section className="flex-1">
        <h2
          className="mb-4"
          style={{
            color: 'var(--portal-text-secondary)',
            fontSize: 'var(--portal-label-size)',
            fontWeight: 'var(--portal-label-weight)' as React.CSSProperties['fontWeight'],
            letterSpacing: 'var(--portal-label-tracking)',
            textTransform: 'var(--portal-label-transform)' as React.CSSProperties['textTransform'],
          }}
        >
          Scope
        </h2>
        <LineItemGrid
          items={dto.items}
          style={{ gap: 'var(--portal-gap)' } as React.CSSProperties}
          disabled
          eventStartTime={dto.event.eventStartTime ?? null}
          eventEndTime={dto.event.eventEndTime ?? null}
          layout={itemLayout}
          sectionBgAlternate={sectionBgAlternate}
          sectionTrim={sectionTrim}
        />
      </section>

      {/* Builder-context placeholder where the client will sign on the live
          proposal. Not the actual DocuSeal panel — that's only present when the
          proposal is sent. */}
      <BuilderSignPlaceholder />

      <p
        className="text-center text-xs mt-12 pb-4 tracking-[0.08em] uppercase"
        style={{ color: 'var(--portal-text-secondary)', opacity: 0.5 }}
      >
        Powered by Unusonic
      </p>
    </div>
  );
}

function BuilderSignPlaceholder() {
  return (
    <div
      className="mt-8 p-5 rounded-[var(--portal-radius)] text-sm text-center"
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) dashed var(--portal-border)',
        color: 'var(--portal-text-secondary)',
      }}
    >
      <p style={{ color: 'var(--portal-text)', fontWeight: 500, marginBottom: '0.25rem' }}>
        Sign block
      </p>
      <p style={{ fontSize: '12px' }}>
        Visible to the client when this proposal is sent. They sign here to accept.
      </p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Empty-state hero — four doors (Aion headline + three secondary)
// ---------------------------------------------------------------------------

function EmptyStateHero({ dealId }: { dealId: string }) {
  const secondaryDoors = [
    {
      icon: FileText,
      title: 'Start from a template',
      body: 'Pre-built scopes for common show types.',
    },
    {
      icon: Copy,
      title: 'Duplicate a past show',
      body: 'Pull a recent one and tune the details.',
    },
    {
      icon: Plus,
      title: 'Start blank',
      body: 'Build from scratch with the catalog palette. ⌘K anywhere.',
    },
  ];
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-16 sm:py-24 flex flex-col items-center text-center gap-3">
      <p className="stage-label text-[var(--stage-text-tertiary)]">Proposal</p>
      <h2 className="text-[28px] sm:text-[32px] font-medium tracking-tight text-[var(--stage-text-primary)] leading-[1.1]">
        Build the proposal
      </h2>
      <p className="stage-readout text-[var(--stage-text-secondary)] max-w-md">
        Four ways to start. Everything composes on the same canvas the client will see.
      </p>

      {/* Headline door — Aion. Full-width, ring-lit left edge, prism mark. */}
      <button
        type="button"
        className="group mt-8 w-full text-left flex items-center gap-5 p-5 sm:p-6 rounded-[var(--stage-radius-panel)] bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] hover:bg-[var(--stage-surface-raised)] hover:border-[var(--stage-edge-top)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
      >
        <div className="shrink-0">
          <AionMark size={40} status="idle" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="stage-readout text-[var(--stage-text-primary)] font-medium">
              Build with Aion
            </span>
            <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              Recommended
            </span>
          </div>
          <span className="text-[13px] leading-[1.5] text-[var(--stage-text-secondary)]">
            Describe the show in a sentence. Aion drafts the scope from your catalog and past
            deals, then you edit anything you want.
          </span>
        </div>
        <ArrowRight
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-primary)] transition-colors"
          aria-hidden
        />
      </button>

      {/* Secondary row — three other paths. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-3">
        {secondaryDoors.map(({ icon: Icon, title, body }) => (
          <button
            key={title}
            type="button"
            className="group text-left flex flex-col gap-3 p-5 rounded-[var(--stage-radius-panel)] bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] hover:bg-[var(--stage-surface-raised)] hover:border-[var(--stage-edge-top)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
          >
            <Icon
              size={16}
              strokeWidth={1.5}
              className="text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] transition-colors"
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <span className="stage-readout text-[var(--stage-text-primary)]">{title}</span>
              <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal leading-[1.5]">
                {body}
              </span>
            </div>
          </button>
        ))}
      </div>

      <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal mt-10 max-w-md">
        Your client will see a single document with scope, terms, and an accept button. You can
        preview exactly what they see at any time.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ProposalBuilderSidebar — docked sidebar attached to the main app nav, like
// the Aion chat-history sidebar. Holds the Catalog picker and Line Inspector
// as tab-switched views. Animates width 0↔SIDEBAR_WIDTH; state persists in
// localStorage.
// ---------------------------------------------------------------------------

type RailTab = 'catalog' | 'inspector' | 'team';

function ProposalBuilderSidebar({
  isOpen,
  onToggle,
  scopeBlocks,
  selectedBlockIdx,
  onSelectBlock,
  subtotal,
  tax,
  total,
  taxRate,
  workspaceId,
  dealId,
  proposalId,
  forceDemo,
  insertAfterSortOrder,
  onItemAdded,
  onRefetchProposal,
  onClearSelection,
  dealCrew,
  roster,
  onRefetchCrew,
  isRequiredRole,
  totalCost,
  costKnown,
  proposal,
}: {
  isOpen: boolean;
  onToggle: () => void;
  scopeBlocks: DemoBlock[];
  selectedBlockIdx: number | null;
  onSelectBlock: (idx: number) => void;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  workspaceId: string | null;
  dealId: string;
  proposalId: string | null;
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
  onRefetchProposal: () => void;
  onClearSelection: () => void;
  dealCrew: DealCrewRow[];
  roster: CrewSearchResult[];
  onRefetchCrew: () => void;
  isRequiredRole: (catalogItemId: string, roleNote: string) => boolean;
  totalCost: number;
  costKnown: boolean;
  proposal: ProposalWithItems | null;
}) {
  const [tab, setTab] = useState<RailTab>('catalog');
  // When LineInspector's "Assign" button is clicked for a specific role, we
  // jump to the Team tab and keep the role in context so the click handler
  // there knows which slot it's trying to fill.
  const [teamRoleFocus, setTeamRoleFocus] = useState<string | null>(null);

  // Swap mode — captured when the PM clicks Swap on a selected line. Flips
  // the Catalog tab into a "pick a replacement" state; the next catalog click
  // deletes the original and inserts the new row at the same sort_order.
  type SwapTarget = {
    itemId: string;
    title: string;
    sortOrder: number;
    packageInstanceId: string | null;
    isHeader: boolean;
  };
  const [swap, setSwap] = useState<SwapTarget | null>(null);

  // When the user clicks a scope row to select it, jump to the Inspector tab
  // so the line details are immediately visible. When they deselect, leave the
  // tab where it is — the Financial overview takes over without moving them.
  useEffect(() => {
    if (selectedBlockIdx != null) setTab('inspector');
  }, [selectedBlockIdx]);

  // Clear the role focus when the user leaves the Team tab — the focus is
  // an ephemeral hand-off from LineInspector, not a sticky filter.
  useEffect(() => {
    if (tab !== 'team') setTeamRoleFocus(null);
  }, [tab]);

  // Leaving the Catalog tab while in swap mode cancels the swap — users should
  // see the banner the whole time they're picking a replacement.
  useEffect(() => {
    if (tab !== 'catalog') setSwap(null);
  }, [tab]);

  const selectedBlock =
    selectedBlockIdx != null ? scopeBlocks[selectedBlockIdx] : undefined;

  const handleAssignRoleFromInspector = useCallback((role: string) => {
    setTeamRoleFocus(role);
    setTab('team');
  }, []);

  const handleEnterSwap = useCallback((target: SwapTarget) => {
    setSwap(target);
    setTab('catalog');
  }, []);

  // When a catalog item is clicked while in swap mode, we delete the target
  // and reuse insertAfterSortOrder on addPackageToProposal so the new row
  // lands where the old one was. Returned from the sidebar so CatalogPicker
  // can defer its click handling.
  const handleSwapPick = useCallback(
    async (newPackageId: string) => {
      if (!swap || !proposalId) return;
      try {
        if (swap.isHeader && swap.packageInstanceId) {
          await deleteProposalItemsByPackageInstanceId(proposalId, swap.packageInstanceId);
        } else {
          await deleteProposalItem(swap.itemId);
        }
        await addPackageToProposal(dealId, newPackageId, swap.sortOrder - 1);
        toast.success('Swapped line item');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Swap failed');
        return;
      } finally {
        setSwap(null);
        onClearSelection();
      }
      onItemAdded();
    },
    [swap, proposalId, dealId, onItemAdded, onClearSelection],
  );

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {/* Mobile backdrop — clicking it closes the sidebar. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40 bg-[oklch(0.06_0_0/0.75)] lg:hidden"
            onClick={onToggle}
            aria-hidden
          />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="shrink-0 overflow-hidden h-full fixed lg:relative z-50 lg:z-auto"
            data-surface="surface"
          >
            <div
              className="flex flex-col h-full bg-[var(--stage-surface)] border-r border-[var(--stage-edge-subtle)]"
              style={{ width: SIDEBAR_WIDTH }}
            >
              {/* Header — label + close button */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3">
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  Build tools
                </span>
                <button
                  type="button"
                  onClick={onToggle}
                  className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  aria-label="Close build tools"
                >
                  <PanelLeftClose size={15} strokeWidth={1.5} />
                </button>
              </div>

              {/* Tab switcher */}
              <div className="shrink-0 px-3 pb-3">
                <div className="inline-flex items-center p-0.5 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)]">
                  <RailTabButton
                    label="Catalog"
                    active={tab === 'catalog'}
                    onClick={() => setTab('catalog')}
                  />
                  <RailTabButton
                    label="Inspector"
                    active={tab === 'inspector'}
                    onClick={() => setTab('inspector')}
                  />
                  <RailTabButton
                    label="Team"
                    active={tab === 'team'}
                    onClick={() => setTab('team')}
                  />
                </div>
              </div>

              {/* Body — tab contents */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'catalog' && (
                  <CatalogPicker
                    workspaceId={workspaceId}
                    dealId={dealId}
                    forceDemo={forceDemo}
                    insertAfterSortOrder={insertAfterSortOrder}
                    onItemAdded={onItemAdded}
                    swap={swap}
                    onSwapPick={handleSwapPick}
                    onCancelSwap={() => setSwap(null)}
                  />
                )}
                {tab === 'inspector' && (
                  <div className="h-full overflow-y-auto flex flex-col">
                    {/* Scope-picker row — always visible so the PM can jump
                         between line items without scrolling through the doc
                         or back out to the Financial overview. Same filter-chip
                         geometry as the Team tab's Needed-roles row. */}
                    {scopeBlocks.length > 0 && scopeBlocks[0].headerItemId && (
                      <div className="shrink-0 px-3 pt-3 pb-2 flex flex-col gap-1.5">
                        <span className="stage-label text-[var(--stage-text-tertiary)]">
                          {selectedBlockIdx == null ? 'Line items' : 'Inspecting'}
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                          {scopeBlocks.map((b, i) => {
                            const active = selectedBlockIdx === i;
                            // Non-standard items get a subtle prefix so the PM
                            // sees at-a-glance which lines are optional or
                            // internal. Internal wins over optional if both are
                            // set (internal is the stronger "not what the client
                            // sees" signal).
                            const marker = b.isClientVisible === false
                              ? '◌ '
                              : b.isOptional === true
                                ? '+ '
                                : null;
                            const markerTitle = b.isClientVisible === false
                              ? 'Internal only — hidden from client'
                              : b.isOptional === true
                                ? 'Optional — client can decline'
                                : undefined;
                            return (
                              <button
                                key={b.headerItemId ?? `block-${i}`}
                                type="button"
                                onClick={() => onSelectBlock(i)}
                                title={markerTitle}
                                className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap',
                                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                                )}
                                style={
                                  active
                                    ? {
                                        backgroundColor: 'var(--stage-surface-raised)',
                                        borderColor: 'var(--stage-edge-top)',
                                        color: 'var(--stage-text-primary)',
                                      }
                                    : {
                                        backgroundColor: 'transparent',
                                        borderColor: 'oklch(1 0 0 / 0.08)',
                                        color: 'var(--stage-text-secondary)',
                                      }
                                }
                                aria-pressed={active}
                              >
                                {marker && (
                                  <span className="text-[var(--stage-text-tertiary)] mr-0.5">
                                    {marker}
                                  </span>
                                )}
                                {b.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex-1 min-h-0 p-3">
                      {selectedBlock ? (
                        <LineInspector
                          block={selectedBlock}
                          proposalId={proposalId}
                          dealCrew={dealCrew}
                          onAssignRole={handleAssignRoleFromInspector}
                          onRefetchCrew={onRefetchCrew}
                          onRefetchProposal={onRefetchProposal}
                          onClearSelection={onClearSelection}
                          onSwap={handleEnterSwap}
                          isRequiredRole={isRequiredRole}
                        />
                      ) : (
                        <FinancialInspector
                          scopeBlocks={scopeBlocks}
                          subtotal={subtotal}
                          tax={tax}
                          total={total}
                          taxRate={taxRate}
                          totalCost={totalCost}
                          costKnown={costKnown}
                          onSelectBlock={onSelectBlock}
                          proposal={proposal}
                          onRefetchProposal={onRefetchProposal}
                        />
                      )}
                    </div>
                  </div>
                )}
                {tab === 'team' && (
                  <TeamPicker
                    dealId={dealId}
                    selectedBlock={selectedBlock}
                    dealCrew={dealCrew}
                    roster={roster}
                    forceDemo={forceDemo}
                    roleFocus={teamRoleFocus}
                    onSetRoleFocus={setTeamRoleFocus}
                    onRefetchCrew={onRefetchCrew}
                    isRequiredRole={isRequiredRole}
                  />
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function RailTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 px-3 rounded-[calc(var(--stage-radius-input)-2px)] text-[12px] font-medium tracking-[0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        active
          ? 'bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Catalog picker — real data: workspace packages, workspace tags, semantic
// search, click-to-add. Packages group by category enum; tag chips filter
// orthogonally (AND logic). Shift-click stages items for batch add.
// ---------------------------------------------------------------------------

/** Color token → OKLCH pill tints for tag chips. Mirrors smart-tag-input.tsx. */
const TAG_PILL_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  'blue-400':     { bg: 'oklch(0.35 0.08 250 / 0.35)', border: 'oklch(0.55 0.12 250 / 0.5)', dot: 'oklch(0.65 0.15 250)' },
  'emerald-400':  { bg: 'oklch(0.35 0.08 145 / 0.35)', border: 'oklch(0.55 0.12 145 / 0.5)', dot: 'oklch(0.65 0.15 145)' },
  'amber-400':    { bg: 'oklch(0.35 0.08 70  / 0.35)', border: 'oklch(0.55 0.12 70  / 0.5)', dot: 'oklch(0.75 0.15 70)' },
  'rose-400':     { bg: 'oklch(0.35 0.08 350 / 0.35)', border: 'oklch(0.55 0.12 350 / 0.5)', dot: 'oklch(0.65 0.18 350)' },
  'violet-400':   { bg: 'oklch(0.35 0.08 290 / 0.35)', border: 'oklch(0.55 0.12 290 / 0.5)', dot: 'oklch(0.65 0.15 290)' },
  'teal-400':     { bg: 'oklch(0.35 0.08 180 / 0.35)', border: 'oklch(0.55 0.12 180 / 0.5)', dot: 'oklch(0.65 0.12 180)' },
  'orange-400':   { bg: 'oklch(0.35 0.08 45  / 0.35)', border: 'oklch(0.55 0.12 45  / 0.5)', dot: 'oklch(0.7 0.15 45)' },
  'fuchsia-400':  { bg: 'oklch(0.35 0.08 320 / 0.35)', border: 'oklch(0.55 0.12 320 / 0.5)', dot: 'oklch(0.65 0.18 320)' },
  'slate-400':    { bg: 'oklch(0.35 0.02 250 / 0.3)',  border: 'oklch(0.5 0.02 250 / 0.45)', dot: 'oklch(0.6 0.02 250)' },
};

function tagPill(color: string) {
  return TAG_PILL_STYLES[color] ?? TAG_PILL_STYLES['slate-400'];
}

/** Category display order + labels for the accordion. */
const CATEGORY_ORDER: { id: string; label: string }[] = [
  { id: 'package',     label: 'Packages' },
  { id: 'service',     label: 'Services' },
  { id: 'rental',      label: 'Rentals' },
  { id: 'talent',      label: 'Talent' },
  { id: 'retail_sale', label: 'Retail' },
  { id: 'fee',         label: 'Fees' },
];

function CatalogPicker({
  workspaceId,
  dealId,
  forceDemo,
  insertAfterSortOrder,
  onItemAdded,
  swap,
  onSwapPick,
  onCancelSwap,
}: {
  workspaceId: string | null;
  dealId: string;
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
  swap: { itemId: string; title: string; sortOrder: number; packageInstanceId: string | null; isHeader: boolean } | null;
  onSwapPick: (newPackageId: string) => Promise<void>;
  onCancelSwap: () => void;
}) {
  const [query, setQuery] = useState('');
  const [packages, setPackages] = useState<PackageWithTags[]>([]);
  const [allTags, setAllTags] = useState<WorkspaceTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['package']));
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);

  // ── Initial load — catalog + tags in parallel ────────────────────────────
  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      getCatalogPackagesWithTags(workspaceId),
      getWorkspaceTags(workspaceId),
    ]).then(([pkgsResult, tagsResult]) => {
      if (cancelled) return;
      setPackages((pkgsResult.packages ?? []).filter((p) => (p as any).is_active !== false && (p as any).is_draft !== true));
      setAllTags(tagsResult.tags ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Semantic search — debounced, only when query is non-empty ────────────
  const isSearching = query.trim().length > 0;
  useEffect(() => {
    if (!isSearching || !workspaceId) {
      setSemanticIds(null);
      setSemanticLoading(false);
      return;
    }
    setSemanticLoading(true);
    const handle = setTimeout(async () => {
      const results = await semanticSearchCatalog(workspaceId, query.trim(), 30);
      setSemanticIds(results.map((r) => r.packageId));
      setSemanticLoading(false);
    }, 220);
    return () => { clearTimeout(handle); };
  }, [query, isSearching, workspaceId]);

  // ── Filtered + grouped packages ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = packages;

    // Tag filter — AND logic across selected tags.
    if (selectedTagIds.size > 0) {
      list = list.filter((p) => {
        const pkgTagIds = new Set((p.tags ?? []).map((t) => t.id));
        for (const id of selectedTagIds) if (!pkgTagIds.has(id)) return false;
        return true;
      });
    }

    // Search: semantic ids (reordered by similarity) OR plain filter fallback.
    if (isSearching) {
      if (semanticIds !== null) {
        const idSet = new Set(semanticIds);
        list = list.filter((p) => idSet.has(p.id));
        list.sort((a, b) => semanticIds.indexOf(a.id) - semanticIds.indexOf(b.id));
      } else {
        const q = query.trim().toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q),
        );
      }
    }

    // Group by category (preserving semantic ordering within each group).
    const groups = new Map<string, PackageWithTags[]>();
    for (const pkg of list) {
      const cat = pkg.category ?? 'package';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(pkg);
    }
    return CATEGORY_ORDER
      .map(({ id, label }) => ({ id, label, items: groups.get(id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [packages, selectedTagIds, isSearching, semanticIds, query]);

  const totalMatches = useMemo(
    () => filtered.reduce((n, c) => n + c.items.length, 0),
    [filtered],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleCategory = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const addPackage = useCallback(
    async (pkg: PackageWithTags) => {
      if (forceDemo) {
        toast.info('Demo view — open without ?demo=1 to add real items.');
        return;
      }
      // Swap mode: delete the original + insert this package at the old spot.
      // Sidebar owns the full flow; we just hand off the chosen package id.
      if (swap) {
        setAdding((prev) => new Set(prev).add(pkg.id));
        try {
          await onSwapPick(pkg.id);
        } finally {
          setAdding((prev) => {
            const next = new Set(prev);
            next.delete(pkg.id);
            return next;
          });
        }
        return;
      }
      setAdding((prev) => new Set(prev).add(pkg.id));
      const result = await addPackageToProposal(dealId, pkg.id, insertAfterSortOrder ?? undefined);
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(pkg.id);
        return next;
      });
      if (result.success) {
        setRecentlyAdded(pkg.id);
        window.setTimeout(() => setRecentlyAdded((current) => (current === pkg.id ? null : current)), 800);
        toast.success(`Added ${pkg.name}`);
        onItemAdded();
      } else {
        toast.error(result.error ?? 'Could not add to proposal.');
      }
    },
    [dealId, forceDemo, insertAfterSortOrder, onItemAdded, swap, onSwapPick],
  );

  const commitStaged = useCallback(async () => {
    if (forceDemo) {
      toast.info('Demo view — open without ?demo=1 to add real items.');
      return;
    }
    const ids = Array.from(stagedIds);
    const stagedPkgs = packages.filter((p) => ids.includes(p.id));
    setStagedIds(new Set());
    // Sequential — server positions each relative to the previous insert.
    let cursor = insertAfterSortOrder;
    for (const pkg of stagedPkgs) {
      const result = await addPackageToProposal(dealId, pkg.id, cursor ?? undefined);
      if (!result.success) {
        toast.error(`${pkg.name}: ${result.error ?? 'failed'}`);
        continue;
      }
      // Next item lands after this one — approximate step (header+children).
      if (cursor != null) cursor += 10;
    }
    toast.success(`Added ${stagedPkgs.length} item${stagedPkgs.length === 1 ? '' : 's'}`);
    onItemAdded();
  }, [stagedIds, packages, insertAfterSortOrder, dealId, forceDemo, onItemAdded]);

  const onRowClick = useCallback(
    (pkg: PackageWithTags, withShift: boolean) => {
      if (withShift) {
        setStagedIds((prev) => {
          const next = new Set(prev);
          if (next.has(pkg.id)) next.delete(pkg.id);
          else next.add(pkg.id);
          return next;
        });
      } else {
        addPackage(pkg);
      }
    },
    [addPackage],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Swap banner — one-shot mode: the next catalog click replaces the
           named line. Cancel restores normal add-to-proposal behavior. */}
      {swap && (
        <div className="shrink-0 mx-3 mb-2 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-dashed border-[var(--stage-edge-subtle)] flex items-center gap-2">
          <span className="text-[11px] text-[var(--stage-text-secondary)] flex-1 min-w-0 truncate">
            Swapping <span className="text-[var(--stage-text-primary)] font-medium">{swap.title}</span> — pick a replacement
          </span>
          <button
            type="button"
            onClick={onCancelSwap}
            className="shrink-0 text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
            aria-label="Cancel swap"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search + match count */}
      <div className="shrink-0 px-3 pb-2 flex items-center gap-2">
        <label className="relative flex items-center flex-1 min-w-0">
          <Search
            size={13}
            strokeWidth={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search catalog…"
            className="stage-input w-full h-8 text-[13px]"
            style={{ paddingLeft: '30px', paddingRight: '12px' }}
            aria-label="Search catalog"
          />
        </label>
        {isSearching && (
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal tabular-nums shrink-0 min-w-[22px] text-right">
            {semanticLoading ? '…' : totalMatches}
          </span>
        )}
      </div>

      {/* Tag filter chip row — horizontal scroll */}
      <div className="shrink-0 px-3 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {allTags.map((tag) => {
            const isActive = selectedTagIds.has(tag.id);
            const pill = tagPill(tag.color);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap flex items-center gap-1',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                )}
                style={
                  isActive
                    ? { backgroundColor: pill.bg, borderColor: pill.border, color: 'var(--stage-text-primary)' }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: 'oklch(1 0 0 / 0.08)',
                        color: 'var(--stage-text-secondary)',
                      }
                }
                aria-pressed={isActive}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: pill.dot }}
                  aria-hidden
                />
                {tag.label}
              </button>
            );
          })}

          {selectedTagIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTagIds(new Set())}
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors"
              aria-label="Clear tag filters"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results — categories */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <CatalogSkeleton />
        ) : filtered.length === 0 ? (
          <CatalogEmpty
            workspaceId={workspaceId}
            hasPackages={packages.length > 0}
            isFiltered={isSearching || selectedTagIds.size > 0}
          />
        ) : (
          filtered.map((cat) => {
            const isOpen = isSearching || expandedCats.has(cat.id);
            return (
              <section key={cat.id} className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => !isSearching && toggleCategory(cat.id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[oklch(1_0_0_/_0.02)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset"
                >
                  <ChevronDown
                    size={13}
                    strokeWidth={1.75}
                    className={cn(
                      'shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-150',
                      !isOpen && '-rotate-90',
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 stage-readout text-[var(--stage-text-primary)]">
                    {cat.label}
                  </span>
                  <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal tabular-nums">
                    {cat.items.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="flex flex-col pb-1 list-none">
                    {cat.items.map((pkg) => (
                      <li key={pkg.id}>
                        <CatalogItemRow
                          pkg={pkg}
                          onClick={(withShift) => onRowClick(pkg, withShift)}
                          isStaged={stagedIds.has(pkg.id)}
                          isAdding={adding.has(pkg.id)}
                          wasRecentlyAdded={recentlyAdded === pkg.id}
                          isBundle={pkg.category === 'package'}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* Staged-batch footer bar — appears when ≥1 item staged via shift-click */}
      {stagedIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]">
          <span className="flex-1 text-[12px] text-[var(--stage-text-primary)] font-medium">
            {stagedIds.size} item{stagedIds.size === 1 ? '' : 's'} staged
          </span>
          <button
            type="button"
            onClick={() => setStagedIds(new Set())}
            className="stage-btn stage-btn-ghost inline-flex items-center h-7 text-[12px] px-2"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={commitStaged}
            className="stage-btn stage-btn-primary inline-flex items-center gap-1.5 h-7 text-[12px] px-3"
          >
            Add {stagedIds.size}
          </button>
        </div>
      )}

      {/* Manage-tags footnote */}
      {allTags.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-[var(--stage-edge-subtle)]">
          <Link
            href="/catalog"
            className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal hover:text-[var(--stage-text-primary)] transition-colors"
          >
            Manage tags in Catalog →
          </Link>
        </div>
      )}
    </div>
  );
}

function CatalogItemRow({
  pkg,
  onClick,
  isStaged,
  isAdding,
  wasRecentlyAdded,
  isBundle,
}: {
  pkg: PackageWithTags;
  onClick: (withShift: boolean) => void;
  isStaged: boolean;
  isAdding: boolean;
  wasRecentlyAdded: boolean;
  isBundle: boolean;
}) {
  const unit = (pkg as PackageWithTags & { unit_type?: string }).unit_type ?? 'flat';
  const priceLabel = Number(pkg.price) > 0 ? `$${Number(pkg.price).toLocaleString()}` : '—';
  const unitSuffix = unit === 'hour' ? ' / hr' : unit === 'day' ? ' / day' : '';
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.shiftKey)}
      disabled={isAdding}
      className={cn(
        'group w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        isStaged
          ? 'bg-[var(--stage-accent-muted)]'
          : wasRecentlyAdded
          ? 'bg-[oklch(0.75_0.18_145_/_0.08)]'
          : 'hover:bg-[oklch(1_0_0_/_0.025)]',
        isAdding && 'opacity-60 cursor-wait',
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-[13px] text-[var(--stage-text-primary)] font-medium truncate flex items-center gap-1.5">
          {isBundle && (
            <span
              className="shrink-0 stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal px-1 py-px rounded-sm border border-[var(--stage-edge-subtle)] text-[9px] uppercase"
              style={{ lineHeight: 1 }}
            >
              Bundle
            </span>
          )}
          <span className="truncate">{pkg.name}</span>
        </span>
        {pkg.description && (
          <span className="text-[12px] leading-[1.45] text-[var(--stage-text-tertiary)] line-clamp-2">
            {pkg.description}
          </span>
        )}
        {pkg.tags && pkg.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {pkg.tags.slice(0, 3).map((tag) => {
              const pill = tagPill(tag.color);
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] border"
                  style={{ backgroundColor: pill.bg, borderColor: pill.border, color: 'var(--stage-text-secondary)' }}
                >
                  <span className="size-1 rounded-full" style={{ backgroundColor: pill.dot }} aria-hidden />
                  {tag.label}
                </span>
              );
            })}
            {pkg.tags.length > 3 && (
              <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                +{pkg.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[12px] tabular-nums text-[var(--stage-text-secondary)] whitespace-nowrap">
          {priceLabel}
          {unitSuffix && (
            <span className="text-[var(--stage-text-tertiary)]">{unitSuffix}</span>
          )}
        </span>
        <span
          className={cn(
            'size-5 inline-flex items-center justify-center rounded-full border transition-colors',
            isStaged
              ? 'bg-[var(--stage-accent)] border-transparent text-[oklch(0.10_0_0)]'
              : wasRecentlyAdded
              ? 'bg-[var(--color-unusonic-success)] border-transparent text-[oklch(0.10_0_0)]'
              : 'bg-[var(--stage-surface-raised)] border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] group-hover:bg-[var(--stage-accent-muted)]',
          )}
          aria-hidden
        >
          {isAdding ? (
            <AionMark size={14} status="loading" />
          ) : wasRecentlyAdded ? (
            '✓'
          ) : isStaged ? (
            '✓'
          ) : (
            <Plus size={11} strokeWidth={2} />
          )}
        </span>
      </div>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 py-2">
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 rounded bg-[var(--ctx-well)] stage-skeleton" style={{ width: `${60 + (i % 3) * 10}%` }} />
            <div className="h-2.5 rounded bg-[var(--ctx-well)] stage-skeleton" style={{ width: `${40 + (i % 2) * 15}%` }} />
          </div>
          <div className="h-4 w-10 rounded bg-[var(--ctx-well)] stage-skeleton" />
        </div>
      ))}
    </div>
  );
}

function CatalogEmpty({
  workspaceId,
  hasPackages,
  isFiltered,
}: {
  workspaceId: string | null;
  hasPackages: boolean;
  isFiltered: boolean;
}) {
  if (!workspaceId) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
        <p className="stage-readout text-[var(--stage-text-secondary)]">Workspace unavailable</p>
      </div>
    );
  }
  if (isFiltered && hasPackages) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
        <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
        <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
          Try a different search or clear your tag filters.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
      <p className="stage-readout text-[var(--stage-text-secondary)]">No catalog items yet</p>
      <Link
        href="/catalog"
        className="stage-label text-[var(--stage-accent)] normal-case tracking-normal hover:underline"
      >
        Add items in Catalog →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line inspector — right-rail panel for the currently-selected scope row.
// ---------------------------------------------------------------------------

function LineInspector({
  block,
  proposalId,
  dealCrew,
  onAssignRole,
  onRefetchCrew,
  onRefetchProposal,
  onClearSelection,
  onSwap,
  isRequiredRole,
}: {
  block: DemoBlock | undefined;
  proposalId: string | null;
  dealCrew: DealCrewRow[];
  onAssignRole: (role: string) => void;
  onRefetchCrew: () => void;
  onRefetchProposal: () => void;
  onClearSelection: () => void;
  onSwap: (target: {
    itemId: string;
    title: string;
    sortOrder: number;
    packageInstanceId: string | null;
    isHeader: boolean;
  }) => void;
  isRequiredRole: (catalogItemId: string, roleNote: string) => boolean;
}) {
  // Effective unit price — override_price wins, else unit_price.
  const effectiveUnitPrice = block?.overridePrice ?? block?.unitPrice ?? 0;

  // Local state mirrors the server-side values; on-blur each field saves via
  // updateProposalItem and then onRefetchProposal re-seeds the block.
  const [priceValue, setPriceValue] = useState(String(effectiveUnitPrice));
  const [qtyValue, setQtyValue] = useState(String(block?.quantity ?? 1));
  const [note, setNote] = useState(block?.internalNotes ?? '');
  const [costValue, setCostValue] = useState(
    block?.actualCost != null ? String(block.actualCost) : '',
  );
  const [multiplierValue, setMultiplierValue] = useState(
    block?.unitMultiplier != null ? String(block.unitMultiplier) : '',
  );
  const [savingField, setSavingField] = useState<'price' | 'qty' | 'note' | 'cost' | 'multiplier' | null>(null);

  // Reset local state when the selected item changes (by id, not title —
  // two items can share the same name).
  useEffect(() => {
    setPriceValue(String(block?.overridePrice ?? block?.unitPrice ?? 0));
    setQtyValue(String(block?.quantity ?? 1));
    setNote(block?.internalNotes ?? '');
    setCostValue(block?.actualCost != null ? String(block.actualCost) : '');
    setMultiplierValue(block?.unitMultiplier != null ? String(block.unitMultiplier) : '');
  }, [block?.headerItemId]);

  // Crew rows tied to this block. deal_crew is the source of truth — every
  // required-role on the catalog (for both the header package and bundle
  // ingredients) already has an unconfirmed row here, created by
  // syncDealCrewFromProposal at load time.
  //
  // For bundles, crew_meta lives on the child rows (e.g. Gold Package header
  // has none; its DJ ingredient carries the DJ role). So we match deal_crew
  // against the union of the header's package id AND every child package id,
  // not just the header alone.
  const roleSlots = useMemo(() => {
    if (!block) return [] as Array<{ label: string; row: DealCrewRow; required: boolean }>;
    const relevantIds = new Set<string>();
    if (block.catalogItemId) relevantIds.add(block.catalogItemId);
    for (const id of block.childCatalogItemIds ?? []) relevantIds.add(id);
    if (relevantIds.size === 0) return [];
    return dealCrew
      .filter((r) => r.catalog_item_id != null && relevantIds.has(r.catalog_item_id))
      .filter((r) => r.role_note)
      .map((r) => ({
        label: r.role_note as string,
        row: r,
        required: r.catalog_item_id
          ? isRequiredRole(r.catalog_item_id, r.role_note as string)
          : false,
      }));
  }, [dealCrew, block, isRequiredRole]);

  const handleUnassign = async (rowId: string) => {
    const res = await removeDealCrew(rowId);
    if (res.success) {
      onRefetchCrew();
    } else {
      toast.error(res.error);
    }
  };

  const savePrice = useCallback(async () => {
    if (!block?.headerItemId) return;
    const parsed = Number(priceValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceValue(String(block.overridePrice ?? block.unitPrice ?? 0));
      return;
    }
    // Revert to catalog default when the PM types back the unit_price —
    // keeps override_price null so the proposal tracks catalog changes.
    const next = parsed === (block.unitPrice ?? 0) ? null : parsed;
    if (next === (block.overridePrice ?? null)) return;
    setSavingField('price');
    const res = await updateProposalItem(block.headerItemId, { override_price: next });
    setSavingField(null);
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, priceValue, onRefetchProposal]);

  const saveQty = useCallback(async () => {
    if (!block?.headerItemId) return;
    const parsed = Number(qtyValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setQtyValue(String(block.quantity ?? 1));
      return;
    }
    if (parsed === (block.quantity ?? 1)) return;
    setSavingField('qty');
    const res = await updateProposalItem(block.headerItemId, { quantity: parsed });
    setSavingField(null);
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, qtyValue, onRefetchProposal]);

  const saveNote = useCallback(async () => {
    if (!block?.headerItemId) return;
    const next = note.trim() === '' ? null : note;
    if (next === (block.internalNotes ?? null)) return;
    setSavingField('note');
    const res = await updateProposalItem(block.headerItemId, { internal_notes: next });
    setSavingField(null);
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, note, onRefetchProposal]);

  const saveCost = useCallback(async () => {
    // Bundle headers carry computed cost — never persist a header-level cost.
    if (!block?.headerItemId || block.costIsComputed) return;
    const trimmed = costValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setCostValue(block.actualCost != null ? String(block.actualCost) : '');
      return;
    }
    if (parsed === (block.actualCost ?? null)) return;
    setSavingField('cost');
    const res = await updateProposalItem(block.headerItemId, { actual_cost: parsed });
    setSavingField(null);
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, costValue, onRefetchProposal]);

  const saveMultiplier = useCallback(async () => {
    // Only meaningful for hourly/daily items. unit_type itself is catalog-level
    // and not editable here — switching a service from flat to hourly would
    // reshape the math contract for the line.
    if (!block?.headerItemId) return;
    if (block.unitType !== 'hour' && block.unitType !== 'day') return;
    const trimmed = multiplierValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      setMultiplierValue(block.unitMultiplier != null ? String(block.unitMultiplier) : '');
      return;
    }
    if (parsed === (block.unitMultiplier ?? null)) return;
    setSavingField('multiplier');
    const res = await updateProposalItem(block.headerItemId, { unit_multiplier: parsed });
    setSavingField(null);
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, multiplierValue, onRefetchProposal]);

  const toggleOptional = useCallback(async () => {
    if (!block?.headerItemId) return;
    const next = !block.isOptional;
    const res = await updateProposalItem(block.headerItemId, { is_optional: next });
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, onRefetchProposal]);

  const toggleClientVisible = useCallback(async () => {
    if (!block?.headerItemId) return;
    const next = block.isClientVisible === false ? true : false;
    const res = await updateProposalItem(block.headerItemId, { is_client_visible: next });
    if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
    onRefetchProposal();
  }, [block, onRefetchProposal]);

  const handleSwap = useCallback(() => {
    if (!block?.headerItemId) return;
    onSwap({
      itemId: block.headerItemId,
      title: block.title,
      sortOrder: block.headerSortOrder ?? 0,
      packageInstanceId: block.packageInstanceId ?? null,
      isHeader: !!block.isHeader,
    });
  }, [block, onSwap]);

  const canUnpack = !!(block?.isHeader && block?.packageInstanceId && proposalId);
  const handleUnpack = useCallback(async () => {
    if (!canUnpack || !proposalId || !block?.packageInstanceId) return;
    const res = await unpackPackageInstance(proposalId, block.packageInstanceId);
    if (!res.success) { toast.error(res.error ?? 'Unpack failed'); return; }
    toast.success('Bundle unpacked');
    onClearSelection();
    onRefetchProposal();
  }, [canUnpack, proposalId, block?.packageInstanceId, onClearSelection, onRefetchProposal]);

  const handleDelete = useCallback(async () => {
    if (!block?.headerItemId) return;
    if (block.isHeader && block.packageInstanceId && proposalId) {
      const res = await deleteProposalItemsByPackageInstanceId(proposalId, block.packageInstanceId);
      if (!res.success) { toast.error(res.error); return; }
    } else {
      const res = await deleteProposalItem(block.headerItemId);
      if (!res.success) { toast.error(res.error); return; }
    }
    toast.success('Removed');
    onClearSelection();
    onRefetchProposal();
    // deal_crew has a partial unique index on role_note; orphaned rows (now
    // without a live catalog_item_id) get culled by syncDealCrewFromProposal
    // on the next getDealCrew call — trigger it so the inspector reflects
    // "DJ slot gone" the moment the DJ line was deleted.
    onRefetchCrew();
  }, [block, proposalId, onClearSelection, onRefetchProposal, onRefetchCrew]);

  if (!block) return null;
  // Live preview of row total — reflects the local (unsaved) price/qty/hours
  // so the PM sees the effect before blur commits it. For flat items the
  // multiplier is 1; for hour/day items it scales both revenue and cost
  // (symmetric with LineItemGrid on the document side).
  const parsedPrice = Number(priceValue);
  const parsedQty = Number(qtyValue);
  const parsedMultiplier = Number(multiplierValue);
  const livePrice = Number.isFinite(parsedPrice) ? parsedPrice : effectiveUnitPrice;
  const liveQty = Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : (block.quantity ?? 1);
  const isHourOrDay = block.unitType === 'hour' || block.unitType === 'day';
  const liveMultiplier = isHourOrDay
    ? (Number.isFinite(parsedMultiplier) && parsedMultiplier > 0
        ? parsedMultiplier
        : (block.unitMultiplier != null && block.unitMultiplier > 0 ? block.unitMultiplier : 1))
    : 1;
  const liveTotal = livePrice * liveQty * liveMultiplier;

  const categoryLabel = (() => {
    switch (block.category) {
      case 'package': return 'Package';
      case 'service': return 'Service';
      case 'rental': return 'Rental';
      case 'talent': return 'Talent';
      case 'retail_sale': return 'Retail';
      case 'fee': return 'Fee';
      default: return block.isHeader ? 'Bundle' : 'Line item';
    }
  })();

  const subtitle = block.summary?.trim() ? block.summary : null;

  return (
    <StagePanel elevated className="p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="stage-label text-[var(--stage-text-tertiary)]">Line item</p>
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
            {categoryLabel}
          </span>
        </div>
        <h3 className="text-[15px] font-medium tracking-tight text-[var(--stage-text-primary)] leading-tight">
          {block.title}
        </h3>
        {subtitle && (
          <p className="text-[12px] text-[var(--stage-text-tertiary)] leading-[1.5] whitespace-pre-wrap">
            {subtitle}
          </p>
        )}
      </div>

      {/* Price + Qty + Est. cost — editable, on-blur save. Est. cost reads
           proposal_items.actual_cost (seeded from catalog target_cost when the
           item was added). Bundle headers show a computed sum of ingredient
           costs and are read-only — children carry the real cost. */}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Price</span>
          <input
            type="text"
            inputMode="decimal"
            value={priceValue}
            onChange={(e) => setPriceValue(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={savePrice}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            disabled={!block.headerItemId}
            className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
            aria-label="Price"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Qty</span>
          <input
            type="text"
            inputMode="numeric"
            value={qtyValue}
            onChange={(e) => setQtyValue(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={saveQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            disabled={!block.headerItemId}
            className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
            aria-label="Quantity"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            Est. cost
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={block.costIsComputed
              ? (block.actualCost != null ? String(block.actualCost) : '')
              : costValue}
            onChange={(e) => setCostValue(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={saveCost}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            disabled={!block.headerItemId || block.costIsComputed}
            placeholder="—"
            className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)] disabled:opacity-70"
            aria-label="Estimated cost"
            title={block.costIsComputed ? 'Sum of ingredients — edit each child to change' : undefined}
          />
        </label>
      </div>

      {/* Hours or Days — only for items whose catalog unit_type is hour/day.
           Scales revenue AND cost. Saved to proposal_items.unit_multiplier. */}
      {isHourOrDay && (
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            {block.unitType === 'hour' ? 'Hours' : 'Days'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={multiplierValue}
            onChange={(e) => setMultiplierValue(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={saveMultiplier}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            disabled={!block.headerItemId}
            placeholder={block.unitType === 'hour' ? 'Hours per line' : 'Days per line'}
            className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
            aria-label={block.unitType === 'hour' ? 'Hours' : 'Days'}
            title={`${block.unitType === 'hour' ? 'Hours' : 'Days'} per line — catalog default can be overridden for this proposal`}
          />
        </label>
      )}

      {/* Row total + margin — live preview of price × qty vs. cost × qty.
           Margin band thresholds match the catalog edit page and the
           FinancialInspector for consistency. */}
      {(() => {
        // For a-la-carte rows: actualCost is per-unit, so scale by qty × multiplier.
        // For bundle headers: actualCost is already the summed total for 1 bundle
        // instance (children's multipliers already rolled up in the reducer),
        // so we only scale by liveQty. Bundle headers never have hour/day
        // unit_type themselves, so liveMultiplier is 1 for them anyway.
        const liveCost = block.actualCost != null
          ? (block.costIsComputed ? block.actualCost * liveQty : block.actualCost * liveQty * liveMultiplier)
          : null;
        const rowMargin = liveCost != null ? liveTotal - liveCost : null;
        const rowMarginPct = liveCost != null && liveTotal > 0 ? rowMargin! / liveTotal : null;
        const marginColor = rowMarginPct == null
          ? 'var(--stage-text-tertiary)'
          : rowMarginPct >= 0.5
          ? 'var(--color-unusonic-success)'
          : rowMarginPct >= 0.3
          ? 'var(--color-unusonic-warning)'
          : 'var(--color-unusonic-error)';
        return (
          <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--stage-edge-subtle)]">
            <div className="flex items-baseline justify-between">
              <span className="stage-label text-[var(--stage-text-tertiary)]">Row total</span>
              <span className="text-[13px] tabular-nums text-[var(--stage-text-primary)] font-medium">
                {formatMoney(liveTotal)}
                {savingField && (
                  <span className="ml-2 text-[11px] text-[var(--stage-text-tertiary)] font-normal">Saving…</span>
                )}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[12px] tabular-nums">
              <span className="text-[var(--stage-text-tertiary)]">Row margin</span>
              <span className="font-medium" style={{ color: marginColor }}>
                {rowMargin == null || rowMarginPct == null
                  ? '—'
                  : `${formatMoney(rowMargin)} · ${Math.round(rowMarginPct * 100)}%`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Crew roles */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Users size={11} strokeWidth={1.75} className="text-[var(--stage-text-tertiary)]" aria-hidden />
          <span className="stage-label text-[var(--stage-text-tertiary)]">Required crew</span>
        </div>
        {roleSlots.length === 0 ? (
          <p className="text-[12px] text-[var(--stage-text-tertiary)] leading-[1.5]">
            No crew roles defined on this package. Edit the package in Catalog to add required roles.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 list-none p-0">
            {roleSlots.map((slot) => {
              const assignedName =
                slot.row.entity_id != null ? slot.row.entity_name ?? 'Assigned' : null;
              return (
                <li
                  key={slot.row.id}
                  className="flex items-center justify-between gap-2 text-[12px] py-1.5 px-2.5 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)]"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[var(--stage-text-primary)] truncate inline-flex items-center gap-1">
                      {slot.label}
                      {slot.required && (
                        <span
                          className="text-[var(--color-unusonic-warning)] text-[10px] font-medium leading-none"
                          title="Required role"
                          aria-label="Required"
                        >
                          *
                        </span>
                      )}
                    </span>
                    {assignedName && (
                      <span className="text-[11px] text-[var(--stage-text-tertiary)] truncate">
                        {assignedName}
                      </span>
                    )}
                  </div>
                  {assignedName ? (
                    <button
                      type="button"
                      onClick={() => handleUnassign(slot.row.id)}
                      className="shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] text-[11px] font-medium transition-colors"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAssignRole(slot.label)}
                      className="shrink-0 text-[var(--stage-accent)] text-[11px] font-medium hover:underline"
                    >
                      Assign
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Internal note — editable, on-blur save */}
      <label className="flex flex-col gap-1.5">
        <span className="stage-label text-[var(--stage-text-tertiary)]">Internal note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          disabled={!block.headerItemId}
          placeholder="Not shown to client. Rig notes, swap history, sub-rental reasons…"
          rows={3}
          className="stage-input min-h-[64px] px-3 py-2 rounded-[var(--stage-radius-input)] text-[12px] leading-[1.5] resize-none"
        />
      </label>

      {/* Visibility toggles — small-text row styled like the design-system
           filter-chip area so they read as meta-controls, not primary fields.
           Optional = client can decline on the live proposal; Internal-only
           hides from the client doc entirely. Both columns already exist on
           proposal_items and are consumed by get-public-proposal + LineItemGrid. */}
      <div className="flex flex-col gap-1.5">
        <span className="stage-label text-[var(--stage-text-tertiary)]">Visibility</span>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`inspector-optional-${block.headerItemId ?? 'na'}`}
            className="inline-flex items-center gap-2 text-[12px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-pointer select-none"
          >
            <input
              id={`inspector-optional-${block.headerItemId ?? 'na'}`}
              type="checkbox"
              checked={block.isOptional === true}
              onChange={toggleOptional}
              disabled={!block.headerItemId}
              className="size-3.5 rounded-[3px] border border-[oklch(1_0_0_/_0.18)] bg-[var(--ctx-well)] accent-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            />
            <span>Optional</span>
            <span className="text-[11px] text-[var(--stage-text-tertiary)] font-normal">
              — client can decline on the proposal
            </span>
          </label>
          <label
            htmlFor={`inspector-client-visible-${block.headerItemId ?? 'na'}`}
            className="inline-flex items-center gap-2 text-[12px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-pointer select-none"
          >
            <input
              id={`inspector-client-visible-${block.headerItemId ?? 'na'}`}
              type="checkbox"
              checked={block.isClientVisible === false}
              onChange={toggleClientVisible}
              disabled={!block.headerItemId}
              className="size-3.5 rounded-[3px] border border-[oklch(1_0_0_/_0.18)] bg-[var(--ctx-well)] accent-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            />
            <span>Internal only</span>
            <span className="text-[11px] text-[var(--stage-text-tertiary)] font-normal">
              — hide from client-facing proposal
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--stage-edge-subtle)]">
        <button
          type="button"
          onClick={handleSwap}
          disabled={!block.headerItemId}
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Swap
        </button>
        <span className="text-[var(--stage-edge-subtle)] select-none">·</span>
        <button
          type="button"
          onClick={handleUnpack}
          disabled={!canUnpack}
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
          title={canUnpack ? undefined : 'Only bundles can be unpacked'}
        >
          Unpack
        </button>
        <span className="text-[var(--stage-edge-subtle)] select-none">·</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!block.headerItemId}
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px] text-[var(--color-unusonic-error)] hover:text-[var(--color-unusonic-error)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete
        </button>
      </div>
    </StagePanel>
  );
}

// ---------------------------------------------------------------------------
// Financial inspector — shown when nothing is selected. Gives the PM a
// proposal-level overview: totals, cost estimate, margin, per-package margin
// rows. Click a scope row in the document to drill into a specific item.
// ---------------------------------------------------------------------------

function FinancialInspector({
  scopeBlocks,
  subtotal,
  tax,
  total,
  taxRate,
  totalCost,
  costKnown,
  onSelectBlock,
  proposal,
  onRefetchProposal,
}: {
  scopeBlocks: DemoBlock[];
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  totalCost: number;
  costKnown: boolean;
  onSelectBlock?: (idx: number) => void;
  proposal: ProposalWithItems | null;
  onRefetchProposal: () => void;
}) {
  // Real margin when at least one block had a resolved cost. Otherwise the
  // inspector renders em-dashes — a fake percent is worse than a blank.
  const margin = subtotal - totalCost;
  const marginPct = subtotal > 0 ? margin / subtotal : 0;

  return (
    <StagePanel elevated className="p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <p className="stage-label text-[var(--stage-text-tertiary)]">Proposal</p>
        <h3 className="text-[15px] font-medium tracking-tight text-[var(--stage-text-primary)] leading-tight">
          Financial overview
        </h3>
        <p className="text-[12px] text-[var(--stage-text-tertiary)] leading-[1.5]">
          Click a line item above, or a row below, to inspect or edit it.
        </p>
      </div>

      {/* Hero total */}
      <div className="flex flex-col gap-1">
        <span className="stage-label text-[var(--stage-text-tertiary)]">Total</span>
        <span className="text-[28px] font-medium tabular-nums tracking-tight text-[var(--stage-text-primary)] leading-none">
          {formatMoney(total)}
        </span>
      </div>

      {/* Breakdown rows */}
      <div className="flex flex-col gap-1.5 pt-3 border-t border-[var(--stage-edge-subtle)]">
        <InspectorRow label="Subtotal" amount={subtotal} />
        {tax > 0 && (
          <InspectorRow
            label={`Sales tax${taxRate ? ` (${(taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)` : ''}`}
            amount={tax}
          />
        )}
        <InspectorRow label="Est. cost" amount={totalCost} muted valueMissing={!costKnown} />
        <InspectorRow label="Est. margin" amount={margin} muted valueMissing={!costKnown} />
      </div>

      {/* Margin bar — only meaningful when cost is known */}
      {costKnown && subtotal > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="stage-label text-[var(--stage-text-tertiary)]">Margin</span>
            <span className="text-[12px] tabular-nums text-[var(--stage-text-primary)] font-medium">
              {Math.round(marginPct * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--ctx-well)] rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                marginPct >= 0.5
                  ? 'bg-[var(--color-unusonic-success)]'
                  : marginPct >= 0.3
                  ? 'bg-[var(--color-unusonic-warning)]'
                  : 'bg-[var(--color-unusonic-error)]',
              )}
              style={{
                // Negative margins (selling under cost) get drawn as a zeroed
                // bar with warning color — users still see the % in the label.
                width: `${Math.max(0, Math.min(1, marginPct)) * 100}%`,
              }}
              aria-hidden
            />
          </div>
        </div>
      )}

      {/* Per-package rows — clickable to drill into the line inspector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="stage-label text-[var(--stage-text-tertiary)]">By package</span>
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
            Click to inspect
          </span>
        </div>
        <ul className="flex flex-col list-none p-0">
          {scopeBlocks.map((block, i) => {
            const bCost = block.actualCost;
            const bCostKnown = bCost != null;
            const bMarginPct = bCostKnown && block.subtotal > 0
              ? (block.subtotal - bCost) / block.subtotal
              : null;
            return (
              <li key={`${block.title}-${i}`}>
                <button
                  type="button"
                  onClick={onSelectBlock ? () => onSelectBlock(i) : undefined}
                  disabled={!onSelectBlock}
                  className={cn(
                    'w-full flex items-center justify-between py-1.5 px-2 -mx-2 rounded-[var(--stage-radius-input)] text-[12px] border-b border-[var(--stage-edge-subtle)] last:border-b-0 text-left transition-colors',
                    onSelectBlock
                      ? 'hover:bg-[oklch(1_0_0_/_0.03)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                      : '',
                  )}
                >
                  <span className="flex-1 min-w-0 truncate text-[var(--stage-text-primary)]">
                    {block.title}
                  </span>
                  <span className="shrink-0 flex items-baseline gap-3 tabular-nums">
                    <span className="text-[var(--stage-text-secondary)]">
                      {formatMoney(block.subtotal)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] w-9 text-right',
                        bMarginPct == null
                          ? 'text-[var(--stage-text-tertiary)]'
                          : bMarginPct >= 0.5
                          ? 'text-[var(--color-unusonic-success)]'
                          : bMarginPct >= 0.3
                          ? 'text-[var(--color-unusonic-warning)]'
                          : 'text-[var(--color-unusonic-error)]',
                      )}
                    >
                      {bMarginPct == null ? '—' : `${Math.round(bMarginPct * 100)}%`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Payment terms + scope notes — proposal-level editable fields that
           render on the client-facing ProposalSummaryBlock. Previously only
           editable via SQL; now on-blur save from the builder. */}
      {proposal?.id && (
        <TermsEditor proposal={proposal} onRefetchProposal={onRefetchProposal} />
      )}
    </StagePanel>
  );
}

// ---------------------------------------------------------------------------
// TermsEditor — payment terms + scope notes, wired to updateProposal.
// On-blur save for each field. Mirrors the updateProposalItem pattern.
// ---------------------------------------------------------------------------

function TermsEditor({
  proposal,
  onRefetchProposal,
}: {
  proposal: ProposalWithItems;
  onRefetchProposal: () => void;
}) {
  const raw = proposal as unknown as Record<string, unknown>;
  const serverDepositPct = raw.deposit_percent as number | null | undefined;
  const serverPaymentDueDays = raw.payment_due_days as number | null | undefined;
  const serverPaymentNotes = raw.payment_notes as string | null | undefined;
  const serverScopeNotes = raw.scope_notes as string | null | undefined;

  const [depositPct, setDepositPct] = useState(
    serverDepositPct != null ? String(serverDepositPct) : '',
  );
  const [paymentDueDays, setPaymentDueDays] = useState(
    serverPaymentDueDays != null ? String(serverPaymentDueDays) : '',
  );
  const [paymentNotes, setPaymentNotes] = useState(serverPaymentNotes ?? '');
  const [scopeNotes, setScopeNotes] = useState(serverScopeNotes ?? '');
  const [saving, setSaving] = useState<keyof typeof saverMap | null>(null);

  // Re-seed local state when the proposal id changes OR when the server values
  // change (after a save completes and onRefetchProposal propagates new data).
  useEffect(() => {
    setDepositPct(serverDepositPct != null ? String(serverDepositPct) : '');
    setPaymentDueDays(serverPaymentDueDays != null ? String(serverPaymentDueDays) : '');
    setPaymentNotes(serverPaymentNotes ?? '');
    setScopeNotes(serverScopeNotes ?? '');
  }, [proposal.id, serverDepositPct, serverPaymentDueDays, serverPaymentNotes, serverScopeNotes]);

  // Shared save path — computes the patch for a given field and commits.
  // Declared as a const map so the `saving` state key type stays correct.
  const saverMap = {
    deposit: async () => {
      const trimmed = depositPct.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 100)) {
        setDepositPct(serverDepositPct != null ? String(serverDepositPct) : '');
        return;
      }
      if (parsed === (serverDepositPct ?? null)) return;
      setSaving('deposit');
      const res = await updateProposal(proposal.id, { deposit_percent: parsed });
      setSaving(null);
      if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
      onRefetchProposal();
    },
    dueDays: async () => {
      const trimmed = paymentDueDays.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
        setPaymentDueDays(serverPaymentDueDays != null ? String(serverPaymentDueDays) : '');
        return;
      }
      if (parsed === (serverPaymentDueDays ?? null)) return;
      setSaving('dueDays');
      const res = await updateProposal(proposal.id, { payment_due_days: parsed });
      setSaving(null);
      if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
      onRefetchProposal();
    },
    paymentNotes: async () => {
      const next = paymentNotes.trim() === '' ? null : paymentNotes;
      if (next === (serverPaymentNotes ?? null)) return;
      setSaving('paymentNotes');
      const res = await updateProposal(proposal.id, { payment_notes: next });
      setSaving(null);
      if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
      onRefetchProposal();
    },
    scopeNotes: async () => {
      const next = scopeNotes.trim() === '' ? null : scopeNotes;
      if (next === (serverScopeNotes ?? null)) return;
      setSaving('scopeNotes');
      const res = await updateProposal(proposal.id, { scope_notes: next });
      setSaving(null);
      if (!res.success) { toast.error(res.error ?? 'Save failed'); return; }
      onRefetchProposal();
    },
  };

  return (
    <>
      {/* Payment terms */}
      <div className="flex flex-col gap-2 pt-3 border-t border-[var(--stage-edge-subtle)]">
        <div className="flex items-baseline justify-between">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Payment terms</span>
          {saving && (
            <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              Saving…
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="stage-label text-[var(--stage-text-tertiary)]">Deposit %</span>
            <input
              type="text"
              inputMode="numeric"
              value={depositPct}
              onChange={(e) => setDepositPct(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={saverMap.deposit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="—"
              className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
              aria-label="Deposit percent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="stage-label text-[var(--stage-text-tertiary)]">Balance due (days before event)</span>
            <input
              type="text"
              inputMode="numeric"
              value={paymentDueDays}
              onChange={(e) => setPaymentDueDays(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={saverMap.dueDays}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="—"
              className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
              aria-label="Balance due days before event"
              title="Number of days before the event date by which the client must pay the balance."
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Payment notes</span>
          <textarea
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            onBlur={saverMap.paymentNotes}
            rows={2}
            placeholder="Overrides the deposit/due line on the client proposal when set."
            className="stage-input min-h-[48px] px-3 py-2 rounded-[var(--stage-radius-input)] text-[12px] leading-[1.5] resize-none"
            aria-label="Payment notes"
          />
        </label>
      </div>

      {/* Scope notes — free text that renders on ProposalSummaryBlock under
           the payment line. Used for "Includes travel within 50 miles", venue
           caveats, etc. */}
      <label className="flex flex-col gap-1.5">
        <span className="stage-label text-[var(--stage-text-tertiary)]">Scope notes</span>
        <textarea
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
          onBlur={saverMap.scopeNotes}
          rows={3}
          placeholder="Shown to client. Assumptions, inclusions, caveats…"
          className="stage-input min-h-[64px] px-3 py-2 rounded-[var(--stage-radius-input)] text-[12px] leading-[1.5] resize-none"
          aria-label="Scope notes"
        />
      </label>
    </>
  );
}

function InspectorRow({
  label,
  amount,
  muted = false,
  valueMissing = false,
}: {
  label: string;
  amount: number;
  muted?: boolean;
  /** When true, render an em-dash instead of $amount. Use for cost/margin
   *  rows when no line item has a resolved cost — showing $0 would misread
   *  as "zero cost" rather than "unknown." */
  valueMissing?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 text-[12px]">
      <span className={muted ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--stage-text-secondary)]'}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          muted ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--stage-text-secondary)]',
        )}
      >
        {valueMissing ? '—' : formatMoney(amount)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team picker — real roster from listDealRoster(). Splits into Staff (ROSTER_MEMBER
// edges) and Network (preferred PARTNER/VENDOR/CLIENT edges). Clicking a person
// writes to ops.deal_crew:
//   - if a scope row is selected AND an open slot exists for that package, fills
//     it via assignDealCrewEntity (optionally preferring an open slot whose
//     role_note matches the focused role passed in from LineInspector);
//   - else adds a new manual row via addManualDealCrew.
// After any write, refetches deal_crew so LineInspector + Team tab both reflect
// the new state. Conflict warnings from checkCrewConflict bubble up via toast.
// ---------------------------------------------------------------------------

function TeamPicker({
  dealId,
  selectedBlock,
  dealCrew,
  roster,
  forceDemo,
  roleFocus,
  onSetRoleFocus,
  onRefetchCrew,
  isRequiredRole,
}: {
  dealId: string;
  selectedBlock: DemoBlock | undefined;
  dealCrew: DealCrewRow[];
  roster: CrewSearchResult[];
  forceDemo: boolean;
  roleFocus: string | null;
  onSetRoleFocus: (role: string | null) => void;
  onRefetchCrew: () => void;
  isRequiredRole: (catalogItemId: string, roleNote: string) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);

  // Open roles across the whole proposal — any deal_crew row with no entity
  // assigned yet counts as "needed." Grouped by role_note with counts so the
  // PM can see at a glance what slots still need filling. Required flag is
  // set when ANY of the grouped rows come from an explicitly-required role.
  const openRoleNeeds = useMemo(() => {
    const groups = new Map<string, DealCrewRow[]>();
    for (const row of dealCrew) {
      if (row.entity_id !== null) continue;
      const label = (row.role_note ?? '').trim();
      if (!label) continue;
      const list = groups.get(label) ?? [];
      list.push(row);
      groups.set(label, list);
    }
    return [...groups.entries()]
      .map(([role, rows]) => ({
        role,
        count: rows.length,
        required: rows.some(
          (r) => r.catalog_item_id != null && isRequiredRole(r.catalog_item_id, role),
        ),
      }))
      .sort((a, b) => {
        // Required first, then alphabetical — required slots are the higher
        // priority visual target.
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.role.localeCompare(b.role);
      });
  }, [dealCrew, isRequiredRole]);

  const handleChipClick = useCallback(
    (role: string) => {
      // Toggle — click the same chip again to clear the filter and see everyone.
      onSetRoleFocus(roleFocus === role ? null : role);
    },
    [roleFocus, onSetRoleFocus],
  );

  // Entities already on this deal — we tag their rows in the picker so the PM
  // can see at a glance who's already committed, and we prevent accidental
  // double-add attempts on them.
  const assignedEntityIds = useMemo(
    () => new Set(dealCrew.map((r) => r.entity_id).filter(Boolean) as string[]),
    [dealCrew],
  );

  // Two-stage filter:
  //   1. If roleFocus is set (LineInspector "Assign" on a specific role),
  //      narrow to people whose skills or job_title match the role. This is
  //      the "pulls from the network tab of djs" case — assigning a DJ slot
  //      should show DJs, not the whole roster.
  //   2. Query text narrows further across name/title/skill.
  const roleNarrowed = useMemo(() => {
    if (!roleFocus) return roster;
    const roleLower = roleFocus.toLowerCase();
    return roster.filter((p) => {
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(roleLower) ||
        roleLower.includes((p.job_title ?? '').toLowerCase() || '\0');
      const skillMatch = p.skills.some((s) => {
        const sLower = s.toLowerCase();
        return sLower.includes(roleLower) || roleLower.includes(sLower);
      });
      return titleMatch || skillMatch;
    });
  }, [roleFocus, roster]);

  // When role narrowing produces nothing, fall back to the full roster so the
  // PM still has an escape hatch — we flag the state so the UI can explain.
  const roleMatchedSome = !roleFocus || roleNarrowed.length > 0;
  const roleFiltered = roleMatchedSome ? roleNarrowed : roster;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roleFiltered;
    return roleFiltered.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(q);
      const skillMatch = p.skills.some((s) => s.toLowerCase().includes(q));
      return nameMatch || titleMatch || skillMatch;
    });
  }, [query, roleFiltered]);

  // Split the roster by employment status so "staff" (internal employees) and
  // freelance crew (external contractors) land under their own headers when
  // the workspace has tagged them. Anything unset falls into Staff.
  const staff = filtered.filter((p) => p.employment_status !== 'external_contractor');
  const freelancers = filtered.filter((p) => p.employment_status === 'external_contractor');

  const handlePickPerson = useCallback(
    async (person: CrewSearchResult) => {
      if (forceDemo) {
        toast('Team wiring is disabled in demo mode — drop ?demo=1 to assign crew.');
        return;
      }
      if (assignedEntityIds.has(person.entity_id)) {
        toast(`${person.name} is already on this deal`);
        return;
      }
      setPendingEntityId(person.entity_id);

      // Find the best open slot to fill. Preference order:
      //   1. Slot that matches BOTH the selected block AND the focused role
      //      (e.g. clicked "Assign" on DJ in LineInspector for Gold Package).
      //   2. Any open slot on the selected block (block selected, no role).
      //   3. Any open slot matching the focused role across the whole proposal
      //      (clicked the "DJ" chip without a block — most common flow).
      // If nothing matches, fall through to addManualDealCrew as a deal-level
      // add with no specific slot.
      let openSlot: DealCrewRow | undefined;

      const relevantBlockIds = new Set<string>();
      if (selectedBlock?.catalogItemId) relevantBlockIds.add(selectedBlock.catalogItemId);
      for (const id of selectedBlock?.childCatalogItemIds ?? []) relevantBlockIds.add(id);

      const focusLower = roleFocus?.toLowerCase() ?? null;
      const openRows = dealCrew.filter((r) => r.entity_id === null);

      if (relevantBlockIds.size > 0 && focusLower) {
        openSlot = openRows.find(
          (r) =>
            r.catalog_item_id != null &&
            relevantBlockIds.has(r.catalog_item_id) &&
            (r.role_note ?? '').toLowerCase() === focusLower,
        );
      }
      if (!openSlot && relevantBlockIds.size > 0) {
        openSlot = openRows.find(
          (r) => r.catalog_item_id != null && relevantBlockIds.has(r.catalog_item_id),
        );
      }
      if (!openSlot && focusLower) {
        openSlot = openRows.find(
          (r) => (r.role_note ?? '').toLowerCase() === focusLower,
        );
      }

      try {
        if (openSlot) {
          const res = await assignDealCrewEntity(openSlot.id, person.entity_id);
          if (res.success) {
            if (res.conflict) toast.warning(res.conflict);
            else toast.success(`Assigned ${person.name} · ${openSlot.role_note ?? selectedBlock?.title ?? 'crew'}`);
            onSetRoleFocus(null);
            onRefetchCrew();
          } else {
            toast.error(res.error);
          }
        } else if (roleFocus) {
          // Role is in focus but no matching open slot exists (e.g. all DJ slots
          // already filled, or role tagged on a package not yet added). Add as a
          // manual row with the role preserved so the PM still captures intent.
          const res = await addManualDealCrew(dealId, person.entity_id, roleFocus);
          if (res.success) {
            if (res.conflict) toast.warning(res.conflict);
            else toast.success(`Added ${person.name} · ${roleFocus}`);
            onSetRoleFocus(null);
            onRefetchCrew();
          } else {
            toast.error(res.error);
          }
        } else {
          // No role, no block — an untyped "deal-level add" creates an orphan
          // row with null role_note that's hard to use later. Prompt instead.
          toast('Pick a role above or select a scope row to assign this person.');
        }
      } finally {
        setPendingEntityId(null);
      }
    },
    [
      forceDemo,
      assignedEntityIds,
      selectedBlock,
      dealCrew,
      roleFocus,
      dealId,
      onSetRoleFocus,
      onRefetchCrew,
    ],
  );

  const contextText = (() => {
    if (roleFocus && selectedBlock) {
      return (
        <>
          Filling <span className="text-[var(--stage-text-primary)] font-medium">{roleFocus}</span> on{' '}
          <span className="text-[var(--stage-text-primary)] font-medium">{selectedBlock.title}</span>
        </>
      );
    }
    if (selectedBlock) {
      return (
        <>
          Assigning to <span className="text-[var(--stage-text-primary)] font-medium">{selectedBlock.title}</span>
        </>
      );
    }
    return 'Click a person to add them to this deal';
  })();

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Needed-roles chips — one per role_note across every open deal_crew slot
           on this proposal. Click to narrow the roster to people who match,
           click again (or the Clear button below) to see everyone. Styled to
           match the Catalog tag-filter row for visual consistency. */}
      {openRoleNeeds.length > 0 && (
        <div className="shrink-0 px-3 pb-3 flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            Needed for this proposal
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            {openRoleNeeds.map((need) => {
              const active = roleFocus === need.role;
              return (
                <button
                  key={need.role}
                  type="button"
                  onClick={() => handleChipClick(need.role)}
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap flex items-center gap-1.5',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--stage-surface-raised)',
                          borderColor: 'var(--stage-edge-top)',
                          color: 'var(--stage-text-primary)',
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: 'oklch(1 0 0 / 0.08)',
                          color: 'var(--stage-text-secondary)',
                        }
                  }
                  aria-pressed={active}
                >
                  <span>{need.role}</span>
                  {need.required && (
                    <span
                      className="text-[var(--color-unusonic-warning)] leading-none"
                      title="Required role"
                      aria-label="Required"
                    >
                      *
                    </span>
                  )}
                  <span className="tabular-nums text-[var(--stage-text-tertiary)]">
                    {need.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Context header — what we're assigning to */}
      <div className="shrink-0 px-3 pb-3 flex flex-col gap-2">
        <div
          className={cn(
            'px-3 py-2 rounded-[var(--stage-radius-input)] flex items-center gap-2',
            selectedBlock || roleFocus
              ? 'bg-[oklch(1_0_0_/_0.03)] border border-[var(--stage-edge-subtle)]'
              : 'bg-transparent border border-dashed border-[var(--stage-edge-subtle)]',
          )}
        >
          <Users
            size={12}
            strokeWidth={1.75}
            className="text-[var(--stage-text-tertiary)] shrink-0"
            aria-hidden
          />
          <span className="text-[12px] text-[var(--stage-text-secondary)] flex-1 min-w-0 truncate">
            {contextText}
          </span>
          {roleFocus && (
            <button
              type="button"
              onClick={() => onSetRoleFocus(null)}
              className="shrink-0 text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
              aria-label="Clear role focus"
            >
              Clear
            </button>
          )}
        </div>

        <label className="relative flex items-center">
          <Search
            size={13}
            strokeWidth={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team…"
            className="stage-input w-full h-8 text-[13px]"
            style={{ paddingLeft: '30px', paddingRight: '12px' }}
            aria-label="Search team"
          />
        </label>
      </div>

      {/* Roster */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* When role narrowing found nothing, we fell back to the full list —
             tell the PM so they understand why non-DJs are showing for a DJ slot. */}
        {roleFocus && !roleMatchedSome && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-dashed border-[var(--stage-edge-subtle)]">
            <p className="text-[11px] text-[var(--stage-text-tertiary)] leading-[1.5]">
              No one on your team matches <span className="text-[var(--stage-text-secondary)]">{roleFocus}</span> yet.
              Showing everyone — tag skills on their profile to narrow this next time.
            </p>
          </div>
        )}
        {roster.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
            <p className="stage-readout text-[var(--stage-text-secondary)]">
              No crew yet
            </p>
            <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              Add people to your roster from the Network page to book them here.
            </p>
          </div>
        ) : (
          <>
            {staff.length > 0 && (
              <TeamGroup
                label="Staff"
                people={staff}
                assignedEntityIds={assignedEntityIds}
                pendingEntityId={pendingEntityId}
                onPick={handlePickPerson}
              />
            )}
            {freelancers.length > 0 && (
              <TeamGroup
                label="Freelancers"
                people={freelancers}
                assignedEntityIds={assignedEntityIds}
                pendingEntityId={pendingEntityId}
                onPick={handlePickPerson}
              />
            )}
            {filtered.length === 0 && (
              <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
                <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeamGroup({
  label,
  people,
  assignedEntityIds,
  pendingEntityId,
  onPick,
}: {
  label: string;
  people: CrewSearchResult[];
  assignedEntityIds: Set<string>;
  pendingEntityId: string | null;
  onPick: (person: CrewSearchResult) => void;
}) {
  return (
    <section className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
      <p className="px-4 pt-3 pb-1.5 stage-label text-[var(--stage-text-tertiary)]">
        {label}
      </p>
      <ul className="flex flex-col pb-1 list-none">
        {people.map((person) => (
          <li key={person.entity_id}>
            <TeamPersonRow
              person={person}
              isAssigned={assignedEntityIds.has(person.entity_id)}
              isPending={pendingEntityId === person.entity_id}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamPersonRow({
  person,
  isAssigned,
  isPending,
  onPick,
}: {
  person: CrewSearchResult;
  isAssigned: boolean;
  isPending: boolean;
  onPick: (person: CrewSearchResult) => void;
}) {
  const initials = person.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
  const disabled = isAssigned || isPending;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(person)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        disabled
          ? 'opacity-55 cursor-not-allowed'
          : 'hover:bg-[oklch(1_0_0_/_0.025)] cursor-pointer',
      )}
    >
      <span
        className="size-7 shrink-0 rounded-full inline-flex items-center justify-center bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)] text-[10px] font-medium text-[var(--stage-text-secondary)] tracking-wide"
        aria-hidden
      >
        {initials}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-[var(--stage-text-primary)] font-medium truncate">
          {person.name}
        </span>
        {(person.job_title || person.skills.length > 0) && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] truncate">
            {person.job_title ?? person.skills.slice(0, 3).join(' · ')}
          </span>
        )}
      </div>
      {isAssigned ? (
        <span
          className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--stage-text-tertiary)]"
          title="Already on this deal"
        >
          On deal
        </span>
      ) : isPending ? (
        <span
          className="shrink-0 size-1.5 rounded-full bg-[var(--stage-text-tertiary)] animate-pulse"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-[13px] text-[var(--stage-text-secondary)]">{label}</span>
      <span className="text-[14px] tabular-nums text-[var(--stage-text-secondary)]">
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'accepted'
      ? 'var(--color-unusonic-success)'
      : status === 'sent'
      ? 'var(--color-unusonic-info)'
      : 'var(--stage-text-tertiary)';
  return (
    <span
      className="inline-block size-1.5 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}

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
