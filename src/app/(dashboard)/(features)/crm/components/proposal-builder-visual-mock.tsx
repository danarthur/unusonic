'use client';

/**
 * ProposalBuilderVisualMock — static visual prototype for the redesigned
 * Proposal Builder. Reachable via `/crm/deal/[id]/proposal-builder?v=visual`.
 *
 * Scope: the BUILDER only. The client-facing rendering of the sent proposal
 * is deliberately out of scope here — this prototype is for iterating on
 * the PM's editing experience.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FileText,
  Pencil,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { StagePanel } from '@/shared/ui/stage-panel';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { cn } from '@/shared/lib/utils';
import { formatTime12h } from '@/shared/lib/parse-time';
import type { DealDetail } from '../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';

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

  // Preview / client-facing view intentionally removed from this prototype.
  // The builder is the focus — DocumentBody renders as the editable canvas
  // for the PM.

  return (
    <div className="flex flex-col min-h-full bg-[var(--stage-void)]">
      <EditTopBar
        dealId={deal.id}
        dealTitle={dealTitle}
        statusLabel={statusLabel}
        status={status}
        total={total}
      />

      <main className="flex-1 min-h-0 overflow-auto">
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
          />
        )}
      </main>
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
}: {
  dealId: string;
  dealTitle: string;
  statusLabel: string;
  status: string;
  total: number;
}) {
  return (
    <header
      data-surface="surface"
      className="relative z-20 shrink-0 flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]"
    >
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
}: DocumentBodyProps) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-10 sm:py-14 flex flex-col gap-10">
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
            className="stage-btn stage-btn-ghost inline-flex items-center gap-1.5 self-start -ml-2 h-8"
          >
            <Sparkles size={13} strokeWidth={1.75} />
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
            <ScopeRow key={`${block.title}-${i}`} block={block} editable={editable} />
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

function ScopeRow({ block, editable }: { block: DemoBlock; editable: boolean }) {
  return (
    <div className="py-4 border-b border-[var(--stage-edge-subtle)] last:border-b-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-6">
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
        <span className="stage-readout tabular-nums text-[var(--stage-text-primary)] whitespace-nowrap">
          {formatMoney(block.subtotal)}
        </span>
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
    </div>
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
