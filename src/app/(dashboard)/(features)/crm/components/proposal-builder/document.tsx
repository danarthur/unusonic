'use client';

/**
 * Document chrome cluster — the WYSIWYG document area + edit-mode top bar.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 * This is the largest extraction; it brings the studio file under the
 * typecheck-friendly threshold and lets us drop `ignoreBuildErrors: true`
 * from next.config.ts.
 *
 * Owns:
 *   - EditTopBar — top bar with deal context, send popover, copy link.
 *   - DocumentBody — the WYSIWYG document preview, rendered in the workspace
 *     portal theme so the builder is byte-identical to the client view.
 *   - BuilderSignPlaceholder — bottom-of-document signature stub.
 *   - EmptyStateHero — pre-data state shown when the deal has no proposal
 *     items yet.
 *   - StatusDot — small status pill primitive (used by EditTopBar).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FileText,
  PanelLeft,
  Plus,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  addPackageToProposal,
  deleteProposalItem,
  deleteProposalItemsByPackageInstanceId,
  sendForSignature,
} from '@/features/sales/api/proposal-actions';
import { ProposalHero } from '@/features/sales/ui/public/ProposalHero';
import { LineItemGrid } from '@/features/sales/ui/public/LineItemGrid';
import { ProposalSummaryBlock } from '@/features/sales/ui/public/ProposalSummaryBlock';
import { SectionTrim } from '@/features/sales/ui/public/SectionTrim';
import type {
  PublicProposalDTO,
  PublicProposalItem,
} from '@/features/sales/model/public-proposal';
import {
  buildTalentRolePredicate,
  resolveTalentForItem,
} from '@/features/sales/lib/resolve-talent-from-deal-crew';
import {
  resolvePortalTheme,
  type PortalThemePreset,
  type PortalThemeConfig,
} from '@/shared/lib/portal-theme';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { cn } from '@/shared/lib/utils';
import type { DealDetail } from '../../actions/get-deal';
import type { DealCrewRow } from '../../actions/deal-crew';
import type { ProposalWithItems } from '@/features/sales/model/types';
import type { DemoBlock } from './types';
import { formatMoney } from './helpers';

// ---------------------------------------------------------------------------
// Edit-mode top bar
// ---------------------------------------------------------------------------

export function EditTopBar({
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

export function DocumentBody({
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

export function EmptyStateHero({ dealId }: { dealId: string }) {
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
