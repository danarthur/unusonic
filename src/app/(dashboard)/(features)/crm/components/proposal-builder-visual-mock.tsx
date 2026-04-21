'use client';

/**
 * ProposalBuilderVisualMock — static visual prototype for the redesigned
 * Proposal Builder. Reachable via `/crm/deal/[id]/proposal-builder?v=visual`.
 *
 * Scope: the BUILDER only. The client-facing rendering of the sent proposal
 * is deliberately out of scope here — this prototype is for iterating on
 * the PM's editing experience.
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
} from '@/features/sales/api/proposal-actions';
import {
  getCatalogPackagesWithTags,
  type PackageWithTags,
  type PackageTag,
} from '@/features/sales/api/package-actions';
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
import { StagePanel } from '@/shared/ui/stage-panel';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { formatTime12h } from '@/shared/lib/parse-time';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';

const SIDEBAR_STORAGE_KEY = 'unusonic.proposal_builder_rail_open';
const SIDEBAR_WIDTH = 340;

export type ProposalBuilderVisualMockProps = {
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

export function ProposalBuilderVisualMock({
  deal,
  forceDemo = false,
  clientName = null,
  venue = null,
}: ProposalBuilderVisualMockProps) {
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

  // When forceDemo is on, render the populated document with demo blocks
  // regardless of real proposal state. Lets us see both states without
  // needing a built proposal.
  const hasRealItems = forceDemo || (proposal?.items?.length ?? 0) > 0;

  // Real items grouped by package header. If no real items, fall back to demo.
  const scopeBlocks = useMemo<DemoBlock[]>(() => {
    if (!hasRealItems || !proposal) return DEMO_BLOCKS;
    const items = proposal.items ?? [];
    const blocks: DemoBlock[] = [];
    let current: DemoBlock | null = null;
    for (const item of items) {
      const name = (item as any).name ?? (item as any).description ?? 'Line item';
      const qty = Number((item as any).quantity ?? 1);
      const unitPrice = Number((item as any).unit_price ?? (item as any).override_price ?? 0);
      const amount = qty * unitPrice;
      const sortOrder = Number((item as any).sort_order ?? 0);
      const isHeader =
        (item as any).is_package_header === true ||
        (item as any).isPackageHeader === true;
      if (isHeader) {
        if (current) blocks.push(current);
        current = {
          title: name,
          summary: (item as any).description ?? '',
          subtotal: amount,
          lines: [],
          maxSortOrder: sortOrder,
        };
      } else {
        if (!current) {
          current = {
            title: 'A la carte',
            summary: '',
            subtotal: 0,
            lines: [],
            maxSortOrder: sortOrder,
          };
        }
        current.subtotal += amount;
        current.lines.push({
          label: name,
          qty: qty !== 1 ? `${qty} × $${unitPrice.toLocaleString()}` : undefined,
          amount: amount || 'included',
        });
        if (sortOrder > (current.maxSortOrder ?? -1)) {
          current.maxSortOrder = sortOrder;
        }
      }
    }
    if (current) blocks.push(current);
    return blocks.length ? blocks : DEMO_BLOCKS;
  }, [hasRealItems, proposal]);

  const subtotal = hasRealItems
    ? scopeBlocks.reduce((s, b) => s + b.subtotal, 0)
    : DEMO_SUBTOTAL;
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
        forceDemo={forceDemo}
        insertAfterSortOrder={
          selectedBlockIdx != null
            ? scopeBlocks[selectedBlockIdx]?.maxSortOrder ?? null
            : null
        }
        onItemAdded={refetchProposal}
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
}: {
  dealId: string;
  dealTitle: string;
  statusLabel: string;
  status: string;
  total: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
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

        <button
          type="button"
          className="stage-btn stage-btn-primary inline-flex items-center gap-2 h-9"
        >
          <Send size={14} strokeWidth={1.75} />
          Send
        </button>
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
    result.push({
      ...header,
      description: nextDesc,
      // Clear display_group_name so the section header doesn't duplicate the
      // bundle title (now carried by the header row's own name).
      display_group_name: null,
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
): PublicProposalDTO {
  const startsAt = deal.proposed_date
    ? new Date(`${deal.proposed_date}T00:00:00`).toISOString()
    : null;

  const displayItems = consolidateBundleRows(proposal.items ?? []);

  return {
    proposal: proposal as PublicProposalDTO['proposal'],
    event: {
      id: (deal as { event_id?: string | null }).event_id ?? deal.id,
      title: deal.title ?? 'Untitled production',
      clientName,
      startsAt,
      endsAt: null,
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
    items: displayItems.map((item) => ({
      ...item,
      isOptional: false,
      clientSelected: true,
      packageImageUrl: null,
      talentAvatarUrl: null,
      talentNames: null,
      talentEntityIds: null,
    })) as unknown as PublicProposalItem[],
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
  forceDemo,
  insertAfterSortOrder,
  onItemAdded,
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
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
}) {
  const [tab, setTab] = useState<RailTab>('catalog');

  // When the user clicks a scope row to select it, jump to the Inspector tab
  // so the line details are immediately visible. When they deselect, leave the
  // tab where it is — the Financial overview takes over without moving them.
  useEffect(() => {
    if (selectedBlockIdx != null) setTab('inspector');
  }, [selectedBlockIdx]);

  const selectedBlock =
    selectedBlockIdx != null ? scopeBlocks[selectedBlockIdx] : undefined;

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
                  />
                )}
                {tab === 'inspector' && (
                  <div className="h-full overflow-y-auto p-3">
                    {selectedBlock ? (
                      <LineInspector block={selectedBlock} />
                    ) : (
                      <FinancialInspector
                        scopeBlocks={scopeBlocks}
                        subtotal={subtotal}
                        tax={tax}
                        total={total}
                        taxRate={taxRate}
                        onSelectBlock={onSelectBlock}
                      />
                    )}
                  </div>
                )}
                {tab === 'team' && (
                  <TeamPicker selectedBlock={selectedBlock} />
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
}: {
  workspaceId: string | null;
  dealId: string;
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
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
    [dealId, forceDemo, insertAfterSortOrder, onItemAdded],
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

function LineInspector({ block }: { block: DemoBlock | undefined }) {
  // Local state — values typed into the inputs are held locally so the fields
  // feel alive in the prototype. Not persisted anywhere yet.
  const [priceValue, setPriceValue] = useState(
    block ? String(block.subtotal) : '',
  );
  const [qtyValue, setQtyValue] = useState('1');
  const [note, setNote] = useState('');

  // Reset local state when the selected block changes.
  useEffect(() => {
    setPriceValue(block ? String(block.subtotal) : '');
    setQtyValue('1');
    setNote('');
  }, [block?.title]);

  if (!block) return null;
  // Demo: fabricate a plausible cost so the margin bar has something to show.
  const numericPrice = Number(priceValue) || block.subtotal;
  const cost = Math.round(numericPrice * 0.38);
  const margin = numericPrice - cost;
  const marginPct = numericPrice > 0 ? margin / numericPrice : 0;

  // Demo: role slots with state. Real impl reads from crew_meta.required_roles.
  const roles: { label: string; state: 'assigned' | 'open' }[] = [
    { label: 'LD', state: 'assigned' },
    { label: 'Programmer', state: 'open' },
    { label: 'Follow spot op', state: 'assigned' },
  ];

  return (
    <StagePanel elevated className="p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="stage-label text-[var(--stage-text-tertiary)]">Line item</p>
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
            Rental
          </span>
        </div>
        <h3 className="text-[15px] font-medium tracking-tight text-[var(--stage-text-primary)] leading-tight">
          {block.title}
        </h3>
        <p className="text-[12px] text-[var(--stage-text-tertiary)] leading-[1.5]">
          From catalog · Base lighting kit
        </p>
      </div>

      {/* Price + Qty — editable */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Price</span>
          <input
            type="text"
            inputMode="decimal"
            value={priceValue}
            onChange={(e) => setPriceValue(e.target.value.replace(/[^\d.]/g, ''))}
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
            className="stage-input h-9 px-3 text-[13px] tabular-nums text-[var(--stage-text-primary)]"
            aria-label="Quantity"
          />
        </label>
      </div>

      {/* Margin */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="stage-label text-[var(--stage-text-tertiary)]">Margin</span>
          <span className="text-[12px] tabular-nums text-[var(--stage-text-primary)] font-medium">
            {Math.round(marginPct * 100)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-[var(--ctx-well)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-unusonic-success)] rounded-full"
            style={{ width: `${Math.max(0, Math.min(1, marginPct)) * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="flex items-baseline justify-between text-[12px] tabular-nums text-[var(--stage-text-secondary)]">
          <span>Cost {formatMoney(cost)}</span>
          <span>Margin {formatMoney(margin)}</span>
        </div>
      </div>

      {/* Crew roles */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Users size={11} strokeWidth={1.75} className="text-[var(--stage-text-tertiary)]" aria-hidden />
          <span className="stage-label text-[var(--stage-text-tertiary)]">Required crew</span>
        </div>
        <ul className="flex flex-col gap-1.5 list-none p-0">
          {roles.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between text-[12px] py-1.5 px-2.5 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)]"
            >
              <span className="text-[var(--stage-text-primary)]">{r.label}</span>
              {r.state === 'assigned' ? (
                <span className="text-[var(--color-unusonic-success)] text-[11px] font-medium">
                  Assigned
                </span>
              ) : (
                <button
                  type="button"
                  className="text-[var(--stage-accent)] text-[11px] font-medium hover:underline"
                >
                  Assign
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Internal note — editable */}
      <label className="flex flex-col gap-1.5">
        <span className="stage-label text-[var(--stage-text-tertiary)]">Internal note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Not shown to client. Rig notes, swap history, sub-rental reasons…"
          rows={3}
          className="stage-input min-h-[64px] px-3 py-2 rounded-[var(--stage-radius-input)] text-[12px] leading-[1.5] resize-none"
        />
      </label>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--stage-edge-subtle)]">
        <button
          type="button"
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px]"
        >
          Swap
        </button>
        <span className="text-[var(--stage-edge-subtle)] select-none">·</span>
        <button
          type="button"
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px]"
        >
          Unpack
        </button>
        <span className="text-[var(--stage-edge-subtle)] select-none">·</span>
        <button
          type="button"
          className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 h-8 text-[12px] text-[var(--color-unusonic-error)] hover:text-[var(--color-unusonic-error)]"
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
  onSelectBlock,
}: {
  scopeBlocks: DemoBlock[];
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  onSelectBlock?: (idx: number) => void;
}) {
  // Demo: same 38% cost assumption as LineInspector.
  const totalCost = Math.round(subtotal * 0.38);
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
          Click a line in the document to inspect or edit it.
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
        <InspectorRow label="Est. cost" amount={totalCost} muted />
        <InspectorRow label="Est. margin" amount={margin} muted />
      </div>

      {/* Margin bar */}
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
            style={{ width: `${Math.max(0, Math.min(1, marginPct)) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

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
            const bCost = Math.round(block.subtotal * 0.38);
            const bMarginPct = block.subtotal > 0 ? (block.subtotal - bCost) / block.subtotal : 0;
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
                        bMarginPct >= 0.5
                          ? 'text-[var(--color-unusonic-success)]'
                          : bMarginPct >= 0.3
                          ? 'text-[var(--color-unusonic-warning)]'
                          : 'text-[var(--color-unusonic-error)]',
                      )}
                    >
                      {Math.round(bMarginPct * 100)}%
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </StagePanel>
  );
}

function InspectorRow({
  label,
  amount,
  muted = false,
}: {
  label: string;
  amount: number;
  muted?: boolean;
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
        {formatMoney(amount)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team picker — links talent to a line item. Lists the workspace roster
// (staff + freelancers). Selecting a person assigns them to the currently-
// selected line. If nothing is selected, the button is disabled.
// ---------------------------------------------------------------------------

type TeamPerson = {
  id: string;
  name: string;
  role: string;
  group: 'staff' | 'freelancer';
  available: boolean;
};

const TEAM_DEMO: TeamPerson[] = [
  { id: 't1', name: 'Mark Hollis',    role: 'Owner / FOH',      group: 'staff',      available: true  },
  { id: 't2', name: 'Sarah Linden',   role: 'Production mgr',   group: 'staff',      available: true  },
  { id: 't3', name: 'Jake Moreno',    role: 'A1 / FOH eng',     group: 'staff',      available: false },
  { id: 't4', name: 'Amy Park',       role: 'LD / programmer',  group: 'staff',      available: true  },
  { id: 't5', name: 'David Ruiz',     role: 'Follow spot op',   group: 'freelancer', available: true  },
  { id: 't6', name: 'Rachel Cho',     role: 'A2 / monitor',     group: 'freelancer', available: true  },
  { id: 't7', name: 'Tomás Beltrán',  role: 'Stagehand / rigger', group: 'freelancer', available: false },
  { id: 't8', name: 'Priya Shah',     role: 'Video op',         group: 'freelancer', available: true  },
];

function TeamPicker({ selectedBlock }: { selectedBlock: DemoBlock | undefined }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TEAM_DEMO;
    return TEAM_DEMO.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q),
    );
  }, [query]);

  const staff = filtered.filter((p) => p.group === 'staff');
  const freelancers = filtered.filter((p) => p.group === 'freelancer');

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Context header — what we're assigning to */}
      <div className="shrink-0 px-3 pb-3 flex flex-col gap-2">
        <div
          className={cn(
            'px-3 py-2 rounded-[var(--stage-radius-input)] flex items-center gap-2',
            selectedBlock
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
            {selectedBlock ? (
              <>
                Assigning to <span className="text-[var(--stage-text-primary)] font-medium">{selectedBlock.title}</span>
              </>
            ) : (
              'Click a scope row to assign crew'
            )}
          </span>
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
        {staff.length > 0 && (
          <TeamGroup label="Staff" people={staff} canAssign={!!selectedBlock} />
        )}
        {freelancers.length > 0 && (
          <TeamGroup label="Freelancers" people={freelancers} canAssign={!!selectedBlock} />
        )}
        {filtered.length === 0 && (
          <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
            <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamGroup({
  label,
  people,
  canAssign,
}: {
  label: string;
  people: TeamPerson[];
  canAssign: boolean;
}) {
  return (
    <section className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
      <p className="px-4 pt-3 pb-1.5 stage-label text-[var(--stage-text-tertiary)]">
        {label}
      </p>
      <ul className="flex flex-col pb-1 list-none">
        {people.map((person) => (
          <li key={person.id}>
            <TeamPersonRow person={person} canAssign={canAssign} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamPersonRow({
  person,
  canAssign,
}: {
  person: TeamPerson;
  canAssign: boolean;
}) {
  const initials = person.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
  return (
    <button
      type="button"
      disabled={!canAssign}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        canAssign
          ? 'hover:bg-[oklch(1_0_0_/_0.025)] cursor-pointer'
          : 'opacity-55 cursor-not-allowed',
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
        <span className="text-[11px] text-[var(--stage-text-tertiary)] truncate">
          {person.role}
        </span>
      </div>
      <span
        className={cn(
          'size-1.5 rounded-full shrink-0',
          person.available
            ? 'bg-[var(--color-unusonic-success)]'
            : 'bg-[var(--color-unusonic-warning)]',
        )}
        aria-hidden
        title={person.available ? 'Available' : 'Has a conflict'}
      />
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
