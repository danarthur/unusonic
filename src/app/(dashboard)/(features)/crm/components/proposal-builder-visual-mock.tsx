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
  GripVertical,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { getPortalTheme } from '@/app/(dashboard)/settings/portal/actions';
import {
  resolvePortalCssVars,
  type PortalThemePreset,
  type PortalThemeConfig,
} from '@/shared/lib/portal-theme';
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
}: ProposalBuilderVisualMockProps) {
  const [proposal, setProposal] = useState<ProposalWithItems | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === '1';
  });

  // Workspace portal theme — the same preset + config the client sees on the
  // sent proposal. Applied to the DOCUMENT area only; sidebar + top bar keep
  // Unusonic's Stage Engineering tokens (they're builder chrome, not content).
  const [portalTheme, setPortalTheme] = useState<{
    preset: PortalThemePreset;
    config: PortalThemeConfig;
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

  useEffect(() => {
    if (forceDemo) return;
    getProposalForDeal(deal.id).then(setProposal);
  }, [deal.id, forceDemo]);

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
        };
      } else {
        if (!current) {
          current = { title: 'A la carte', summary: '', subtotal: 0, lines: [] };
        }
        current.subtotal += amount;
        current.lines.push({
          label: name,
          qty: qty !== 1 ? `${qty} × $${unitPrice.toLocaleString()}` : undefined,
          amount: amount || 'included',
        });
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
        subtotal={subtotal}
        tax={tax}
        total={total}
        taxRate={taxRate}
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
            portalTheme
              ? ({
                  ...portalCssVars,
                  backgroundColor: 'var(--portal-bg)',
                  color: 'var(--portal-text)',
                  fontFamily: 'var(--portal-font-body)',
                } as React.CSSProperties)
              : undefined
          }
        >
          {portalTheme && (
            <ThemeBanner
              presetLabel={presetLabelFor(portalTheme.preset)}
            />
          )}
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
   *  paints in the workspace's client-facing theme. Top bar + sidebar stay
   *  Unusonic-themed since they're builder chrome. */
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
}: DocumentBodyProps) {
  return (
    <div
      className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-10 sm:py-14 flex flex-col gap-10"
      style={themed ? THEMED_TOKEN_OVERRIDES : undefined}
    >
      {/* Block: Header identity (client, date, venue, owner) */}
      <section className="flex flex-col gap-4">
        <BlockLabel label="Prepared for" editable={editable} />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[28px] sm:text-[32px] font-medium tracking-tight text-[var(--stage-text-primary)] leading-[1.1]">
            {dealTitle}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 stage-readout text-[var(--stage-text-secondary)]">
            {dateLabel && <span className="tabular-nums whitespace-nowrap">{dateLabel}</span>}
            {dateLabel && timeLabel && <Dot />}
            {timeLabel && <span className="tabular-nums whitespace-nowrap">{timeLabel}</span>}
            {(dateLabel || timeLabel) && <Dot />}
            <span>At a venue to be confirmed</span>
            <Dot />
            <span>Prepared by your team</span>
          </div>
        </div>
      </section>

      <HairlineRule />

      {/* Block: Voice — the PM's sentence */}
      <section className="flex flex-col gap-3">
        <BlockLabel label="Overview" editable={editable} />
        <p className="text-[17px] leading-[1.65] text-[var(--stage-text-primary)] tracking-[-0.005em]">
          We've put together the production package you and I walked through. The audio rig is sized
          for the room with headroom for a DJ set. Lighting is designed to pick up the brand colors
          without drawing focus from the stage. Our crew will load in the day before so the room is
          ready when your team arrives.
        </p>
        {editable && (
          <button
            type="button"
            className="stage-btn stage-btn-ghost inline-flex items-center gap-2 self-start -ml-2 h-8"
          >
            <AionMark size={16} status="idle" />
            Rewrite with Aion
          </button>
        )}
      </section>

      <HairlineRule />

      {/* Block: Scope — the line items */}
      <section className="flex flex-col gap-5">
        <BlockLabel label="What's included" editable={editable} />
        <div className="flex flex-col">
          {scopeBlocks.map((block, i) => (
            <ScopeRow
              key={`${block.title}-${i}`}
              block={block}
              editable={editable}
              selected={editable && selectedBlockIdx === i}
              onClick={onSelectBlock ? () => onSelectBlock(i) : undefined}
            />
          ))}
        </div>

        {/* Totals — restrained typography, no filled row backgrounds */}
        <div className="mt-2 pt-5 border-t border-[var(--stage-edge-subtle)]">
          <div className="flex flex-col gap-1.5">
            <TotalRow label="Subtotal" amount={subtotal} />
            {tax > 0 && (
              <TotalRow
                label={`Sales tax${taxRate ? ` (${(taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)` : ''}`}
                amount={tax}
              />
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--stage-edge-subtle)] flex items-baseline justify-between">
            <span className="stage-label text-[var(--stage-text-primary)] normal-case tracking-normal text-[13px] font-medium">
              Total
            </span>
            <span className="text-[28px] sm:text-[32px] font-medium tabular-nums tracking-tight text-[var(--stage-text-primary)] leading-none">
              {formatMoney(total)}
            </span>
          </div>
        </div>

        {editable && (
          <button
            type="button"
            className="stage-btn stage-btn-secondary inline-flex items-center gap-2 self-start h-9 mt-2"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add from catalog
            <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal ml-1">
              ⌘K
            </span>
          </button>
        )}
      </section>

      <HairlineRule />

      {/* Block: Terms */}
      <section className="flex flex-col gap-3">
        <BlockLabel label="Terms" editable={editable} />
        <p className="text-[15px] leading-[1.65] text-[var(--stage-text-primary)]">
          A <strong className="font-medium tabular-nums">{formatMoney(Math.round(total * 0.5))}</strong> deposit
          holds the date. Balance of{' '}
          <strong className="font-medium tabular-nums">{formatMoney(total - Math.round(total * 0.5))}</strong>{' '}
          is due fourteen days before the show.
        </p>
        <p className="text-[13px] leading-[1.6] text-[var(--stage-text-secondary)]">
          Includes standard production insurance and a two-hour post-show strike window. Overtime
          billed at 1.5× after ten hours. This proposal is valid for thirty days.
        </p>
      </section>

      <HairlineRule />

      {/* Block: Accept */}
      <section className="flex flex-col gap-5">
        <BlockLabel label="Accept" editable={editable} />
        <StagePanel className="p-6 flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <div className="flex flex-col gap-1">
              <span className="stage-label text-[var(--stage-text-tertiary)]">To accept</span>
              <p className="stage-readout text-[var(--stage-text-primary)]">
                Sign below and we'll send a deposit invoice within the hour.
              </p>
            </div>
            <span className="text-[22px] font-medium tabular-nums tracking-tight text-[var(--stage-text-primary)]">
              {formatMoney(total)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="stage-label text-[var(--stage-text-tertiary)]">Signature</span>
            <div className="h-12 rounded-[var(--stage-radius-input)] border-b border-[var(--stage-edge-subtle)] bg-transparent" />
          </div>

          <button
            type="button"
            className={cn(
              'stage-btn stage-btn-primary inline-flex items-center justify-center gap-2 h-11 self-start px-6',
              editable && 'opacity-70 pointer-events-none',
            )}
            style={
              themed
                ? { color: 'var(--portal-accent-text)' }
                : undefined
            }
          >
            Accept and sign
            <ArrowRight size={15} strokeWidth={1.75} />
          </button>
          {editable && (
            <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              This is how the client accepts — the button is live on the sent proposal.
            </p>
          )}
        </StagePanel>
      </section>

      {/* Footer — real presence signals */}
      <footer className="flex flex-col gap-1 pt-6 border-t border-[var(--stage-edge-subtle)]">
        <p className="stage-readout text-[var(--stage-text-primary)]">Your production company</p>
        <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
          Nashville, TN · Licensed & insured · Reply to the proposer directly
        </p>
      </footer>
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
// Theme banner — small pill above the document showing which portal theme is
// currently applied. Clicks through to workspace settings so the PM can change
// how the client sees the sent proposal.
// ---------------------------------------------------------------------------

function ThemeBanner({ presetLabel }: { presetLabel: string }) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 pt-5 sm:pt-7 flex items-center justify-between gap-3">
      <span
        className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase"
        style={{
          color: 'color-mix(in oklch, var(--portal-text-secondary) 75%, transparent)',
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: 'var(--portal-accent)' }}
          aria-hidden
        />
        Client sees · {presetLabel}
      </span>
      <Link
        href="/settings/portal"
        className="text-[11px] tracking-[0.02em] hover:underline"
        style={{ color: 'var(--portal-text-secondary)' }}
      >
        Change theme
      </Link>
    </div>
  );
}

const PRESET_LABELS: Record<string, string> = {
  paper: 'Paper',
  clean: 'Clean',
  blackout: 'Blackout',
  editorial: 'Editorial',
  civic: 'Civic',
  linen: 'Linen',
  poster: 'Poster',
  terminal: 'Terminal',
  marquee: 'Marquee',
  broadcast: 'Broadcast',
  gallery: 'Gallery',
  custom: 'Custom',
};

function presetLabelFor(preset: string): string {
  return PRESET_LABELS[preset] ?? preset;
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

function BlockLabel({ label, editable }: { label: string; editable: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="stage-label text-[var(--stage-text-tertiary)]">{label}</p>
      {editable && (
        <button
          type="button"
          className="opacity-0 hover:opacity-100 focus:opacity-100 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-opacity p-1 -mr-1 rounded-[var(--stage-radius-input)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:opacity-100"
          aria-label={`Edit ${label.toLowerCase()}`}
        >
          <Pencil size={12} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function ScopeRow({
  block,
  editable,
  selected = false,
  onClick,
}: {
  block: DemoBlock;
  editable: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  const wrapperProps = onClick
    ? ({ type: 'button' as const, onClick, 'aria-pressed': selected })
    : {};
  return (
    <Wrapper
      {...(wrapperProps as {})}
      className={cn(
        'group relative w-full text-left py-4 border-b border-[var(--stage-edge-subtle)] last:border-b-0 first:pt-0 transition-colors',
        editable && 'cursor-pointer hover:bg-[oklch(1_0_0_/_0.015)] -mx-3 px-3 rounded-[var(--stage-radius-input)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        selected && 'bg-[oklch(1_0_0_/_0.025)]',
      )}
    >
      {/* Accent left-stripe for the selected row (inspector target). */}
      {selected && (
        <span
          className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[var(--stage-accent)]"
          aria-hidden
        />
      )}

      <div className="flex items-baseline justify-between gap-6">
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          {/* Drag grip — reveals on hover, persistent when selected. */}
          {editable && (
            <button
              type="button"
              className={cn(
                'shrink-0 -ml-5 p-0.5 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-opacity',
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
              aria-label="Reorder"
            >
              <GripVertical size={14} strokeWidth={1.75} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="stage-readout text-[var(--stage-text-primary)] font-medium">
              {block.title}
            </span>
            {block.summary && (
              <span className="text-[13px] leading-[1.55] text-[var(--stage-text-secondary)]">
                {block.summary}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="stage-readout tabular-nums text-[var(--stage-text-primary)] whitespace-nowrap">
            {formatMoney(block.subtotal)}
          </span>
          {editable && (
            <button
              type="button"
              className={cn(
                '-mr-2 p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-opacity',
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
              aria-label="More actions"
            >
              <MoreHorizontal size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {block.lines.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 pl-0">
          {block.lines.map((line, i) => (
            <li
              key={`${line.label}-${i}`}
              className="flex items-baseline justify-between gap-6 text-[13px]"
            >
              <span className="flex-1 min-w-0 flex items-baseline gap-2 text-[var(--stage-text-secondary)]">
                <span className="text-[var(--stage-text-tertiary)]">—</span>
                <span className="truncate">{line.label}</span>
                {line.qty && (
                  <span className="text-[var(--stage-text-tertiary)] tabular-nums whitespace-nowrap">
                    · {line.qty}
                  </span>
                )}
              </span>
              <span className="tabular-nums whitespace-nowrap text-[var(--stage-text-secondary)]">
                {line.amount === 'included' ? 'included' : formatMoney(line.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  );
}

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
  subtotal,
  tax,
  total,
  taxRate,
}: {
  isOpen: boolean;
  onToggle: () => void;
  scopeBlocks: DemoBlock[];
  selectedBlockIdx: number | null;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
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
                {tab === 'catalog' && <CatalogPicker />}
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
// Catalog picker — search + category accordions + click-to-add
// ---------------------------------------------------------------------------

type CatalogItem = {
  id: string;
  name: string;
  summary?: string;
  price: number;
  unit?: 'flat' | 'day' | 'hour';
};

type CatalogCategory = {
  id: string;
  label: string;
  items: CatalogItem[];
};

const CATALOG_DEMO: CatalogCategory[] = [
  {
    id: 'audio',
    label: 'Audio',
    items: [
      { id: 'audio-kara', name: 'L-Acoustics Kara line array', summary: 'Stereo hang, amps, rigging, 24-box ceiling', price: 6800 },
      { id: 'audio-sd12', name: 'DiGiCo SD12 console', summary: 'FOH or monitor, with Waves SoundGrid', price: 1400 },
      { id: 'audio-ma3', name: 'MA3 onPC wing', summary: 'Console + stagebox, recorded show file', price: 1200 },
      { id: 'audio-wireless', name: 'Wireless rack — 8ch', summary: 'Shure Axient digital, RF coordination', price: 1600 },
      { id: 'audio-monitor', name: 'Monitor world', summary: 'IEM + wedge package, monitor position', price: 2200 },
      { id: 'audio-smaart', name: 'Smaart measurement kit', summary: 'System tuning by an A1 on-site', price: 400 },
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    items: [
      { id: 'lx-base', name: 'Base lighting kit', summary: 'Trussing, 12 PARs, console, 1-op', price: 3200 },
      { id: 'lx-moving', name: 'Moving-head rig', summary: '16 Martin MAC Aura XB, haze, programmer', price: 7400 },
      { id: 'lx-full', name: 'Full stage lighting', summary: 'Moving + static wash + FX, LD + programmer', price: 11200 },
      { id: 'lx-haze', name: 'Haze + atmospherics', summary: 'MDG ATMe + 2× Le Maitre low-fog', price: 900 },
      { id: 'lx-followspot', name: 'Follow spot package', summary: 'Lycian 1271 + operator, comms', price: 1400 },
    ],
  },
  {
    id: 'video',
    label: 'Video / LED',
    items: [
      { id: 'vid-16x9', name: '16×9 LED wall — ROE BP2v2', summary: '12ft × 7ft, processor, spare modules', price: 5800 },
      { id: 'vid-cams', name: 'Tri-camera switcher', summary: '3× Blackmagic, TriCaster, 2 ops', price: 4200 },
      { id: 'vid-playback', name: 'Playback server', summary: 'QLab Pro with redundancy', price: 700 },
      { id: 'vid-confidence', name: 'Confidence monitors', summary: '2× 32" on-stage, wedge stand', price: 450 },
    ],
  },
  {
    id: 'crew',
    label: 'Crew',
    items: [
      { id: 'crew-a1', name: 'FOH engineer (A1)', summary: 'Day rate, 10-hour day, OT after', price: 1200, unit: 'day' },
      { id: 'crew-a2', name: 'Monitor engineer (A2)', summary: 'Day rate, 10-hour day, OT after', price: 1000, unit: 'day' },
      { id: 'crew-ld', name: 'Lighting designer + programmer', summary: 'Pre-pro day + show day', price: 1400, unit: 'day' },
      { id: 'crew-stagehand', name: 'Stagehand', summary: 'Load-in, strike, show call', price: 320, unit: 'day' },
      { id: 'crew-vid-op', name: 'Video operator', summary: 'Switcher, playback, or LED', price: 900, unit: 'day' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    items: [
      { id: 'tx-sprinter', name: 'Sprinter van — local', summary: 'Crew cab, 14ft box, driver', price: 420 },
      { id: 'tx-box', name: 'Box truck — 26ft', summary: 'Lift gate, driver, regional', price: 780 },
      { id: 'tx-cartage', name: 'Cartage — backline', summary: 'Local runner, one-way', price: 240 },
    ],
  },
  {
    id: 'fees',
    label: 'Fees & passthroughs',
    items: [
      { id: 'fee-per-diem', name: 'Per diem — crew', summary: '$75 / crew / day, non-taxable', price: 75, unit: 'day' },
      { id: 'fee-travel', name: 'Travel & lodging', summary: 'Passthrough, receipts', price: 0 },
      { id: 'fee-insurance', name: 'Rider insurance rider', summary: 'Additional insured certificate', price: 250 },
    ],
  },
];

function CatalogPicker() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['lighting']));

  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (!isSearching) return CATALOG_DEMO;
    const q = query.toLowerCase();
    return CATALOG_DEMO
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.summary ?? '').toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query, isSearching]);

  const totalMatches = useMemo(
    () => filtered.reduce((n, c) => n + c.items.length, 0),
    [filtered],
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Sticky search header — the sidebar already labels itself */}
      <div className="shrink-0 px-3 pb-3 flex items-center gap-2">
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
            className="stage-input w-full h-8 pl-8 pr-3 text-[13px]"
            aria-label="Search catalog"
          />
        </label>
        {isSearching && (
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal tabular-nums shrink-0">
            {totalMatches}
          </span>
        )}
      </div>

      {/* Category accordions — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
            <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
            <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              Try another search or clear to browse.
            </p>
          </div>
        ) : (
          filtered.map((cat) => {
            const isOpen = isSearching || expanded.has(cat.id);
            return (
              <section key={cat.id} className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => !isSearching && toggle(cat.id)}
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
                    {cat.items.map((item) => (
                      <li key={item.id}>
                        <CatalogItemRow item={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function CatalogItemRow({ item }: { item: CatalogItem }) {
  return (
    <button
      type="button"
      className="group w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[oklch(1_0_0_/_0.025)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-[var(--stage-text-primary)] font-medium truncate">
          {item.name}
        </span>
        {item.summary && (
          <span className="text-[12px] leading-[1.45] text-[var(--stage-text-tertiary)] line-clamp-2">
            {item.summary}
          </span>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[12px] tabular-nums text-[var(--stage-text-secondary)] whitespace-nowrap">
          {item.price > 0 ? `$${item.price.toLocaleString()}` : 'per receipt'}
          {item.unit && item.unit !== 'flat' && (
            <span className="text-[var(--stage-text-tertiary)]"> / {item.unit}</span>
          )}
        </span>
        <span
          className="size-5 inline-flex items-center justify-center rounded-full bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] group-hover:bg-[var(--stage-accent-muted)] transition-colors"
          aria-hidden
        >
          <Plus size={11} strokeWidth={2} />
        </span>
      </div>
    </button>
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
}: {
  scopeBlocks: DemoBlock[];
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
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

      {/* Per-package rows */}
      <div className="flex flex-col gap-2">
        <span className="stage-label text-[var(--stage-text-tertiary)]">By package</span>
        <ul className="flex flex-col list-none p-0">
          {scopeBlocks.map((block, i) => {
            const bCost = Math.round(block.subtotal * 0.38);
            const bMarginPct = block.subtotal > 0 ? (block.subtotal - bCost) / block.subtotal : 0;
            return (
              <li
                key={`${block.title}-${i}`}
                className="flex items-center justify-between py-1.5 text-[12px] border-b border-[var(--stage-edge-subtle)] last:border-b-0"
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
            className="stage-input w-full h-8 pl-8 pr-3 text-[13px]"
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

function HairlineRule() {
  return <div className="h-px bg-[var(--stage-edge-subtle)]" aria-hidden />;
}

function Dot() {
  return <span className="text-[var(--stage-text-tertiary)] select-none">·</span>;
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
