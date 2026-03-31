'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, MapPin, Building2, Plus, Loader2, Pencil, X } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import { searchNetworkOrgs } from '@/features/network-data';
import { toast } from 'sonner';
import {
  addDealStakeholder,
  removeDealStakeholder,
  type DealStakeholderDisplay,
} from '../actions/deal-stakeholders';
import { createGhostVendorEntity } from '../actions/lookup';
import {
  getNodeForSheet,
  getCoupleEntityForEdit,
  getIndividualEntityForEdit,
  type CoupleEntityForEdit,
  type IndividualEntityForEdit,
} from '../actions/get-node-for-sheet';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';
import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';
import { getLeadSourceLabel } from '@/features/lead-sources';
import { getEntityDisplayName } from '../actions/lookup';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { formatRelTime } from '@/shared/lib/format-currency';
import { LeadSourceSheet } from './lead-source-sheet';

// =============================================================================
// Helpers
// =============================================================================

function EntityIcon({ entityType, className }: { entityType: string | null | undefined; className?: string }) {
  const cls = cn('shrink-0', className ?? 'size-4');
  if (entityType === 'person' || entityType === 'couple') return <User className={cls} />;
  if (entityType === 'venue') return <MapPin className={cls} />;
  return <Building2 className={cls} />;
}

const budgetFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// =============================================================================
// VendorSlotPicker — inline search for partners/vendors
// =============================================================================

function VendorSlotPicker({
  sourceOrgId,
  onSelect,
  onGhostCreate,
  onClose,
}: {
  sourceOrgId: string;
  onSelect: (org: NetworkSearchOrg) => void;
  onGhostCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NetworkSearchOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await searchNetworkOrgs(sourceOrgId, q);
      setResults(r);
      setLoading(false);
    }, 250);
  }, [sourceOrgId]);

  const handleGhostCreate = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    await onGhostCreate(name);
    setCreating(false);
  };

  return (
    <div
      className="absolute left-0 top-full mt-1.5 z-30 w-64 overflow-hidden"
      style={{
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search network…"
        className="w-full bg-transparent px-4 py-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] border-b border-[oklch(1_0_0_/_0.06)]"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {loading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      )}
      {!loading && results.map((r) => (
        <button
          key={r.entity_uuid ?? r.id}
          type="button"
          onClick={() => onSelect(r)}
          className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)] transition-colors flex items-center gap-2.5"
        >
          <EntityIcon entityType={r.entity_type} />
          <span className="truncate">{r.name}</span>
        </button>
      ))}
      {!loading && query.trim().length >= 2 && (
        <button
          type="button"
          disabled={creating}
          onClick={handleGhostCreate}
          className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors flex items-center gap-2 border-t border-[oklch(1_0_0_/_0.06)] disabled:opacity-45"
        >
          {creating ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <Plus size={14} className="shrink-0" />}
          Add as vendor &ldquo;{query.trim()}&rdquo;
        </button>
      )}
    </div>
  );
}

// =============================================================================
// DealDetailsCard
// =============================================================================

export type DealDetailsCardProps = {
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  client: DealClientContext | null;
  sourceOrgId: string | null;
  onStakeholdersChange: () => void;
  /** undefined = still loading, null = fetched but no proposal exists */
  initialProposal?: ProposalWithItems | null;
};

export function DealDetailsCard({
  deal,
  stakeholders,
  client,
  sourceOrgId,
  onStakeholdersChange,
  initialProposal,
}: DealDetailsCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const vendors = stakeholders.filter((s) => s.role === 'vendor');

  // Vendor slot picker
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);

  const handleVendorSelect = useCallback(async (org: NetworkSearchOrg) => {
    setVendorPickerOpen(false);
    const result = await addDealStakeholder(deal.id, 'vendor', {
      organizationId: org.entity_uuid ?? org.id,
      isPrimary: false,
    });
    if (result.success) {
      toast.success(`${org.name} added.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }, [deal.id, onStakeholdersChange, router]);

  const handleVendorGhostCreate = useCallback(async (name: string) => {
    const entityId = await createGhostVendorEntity(name);
    if (!entityId) { toast.error('Failed to create entity'); return; }
    setVendorPickerOpen(false);
    const result = await addDealStakeholder(deal.id, 'vendor', { organizationId: entityId, isPrimary: false });
    if (result.success) {
      toast.success(`${name} added.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }, [deal.id, onStakeholdersChange, router]);

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(deal.id, stakeholderId);
    if (result.success) {
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  // Edit sheets (for vendor editing)
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const [loadingRelId, setLoadingRelId] = useState<string | null>(null);
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId ? `/crm?selected=${selectedId}&stream=${streamMode}` : '/crm';

  const handleEditClick = async (relationshipId: string) => {
    setLoadingRelId(relationshipId);
    const details = await getNodeForSheet(relationshipId);
    setLoadingRelId(null);
    if (details) setSheetDetails(details);
  };

  const [coupleEdit, setCoupleEdit] = useState<{ open: boolean; entityId: string; initialValues: CoupleEntityForEdit } | null>(null);
  const [loadingCoupleId, setLoadingCoupleId] = useState<string | null>(null);

  const handleCoupleEditClick = async (entityId: string) => {
    setLoadingCoupleId(entityId);
    const data = await getCoupleEntityForEdit(entityId);
    setLoadingCoupleId(null);
    if (data) setCoupleEdit({ open: true, entityId, initialValues: data });
    else toast.error('Could not load couple details.');
  };

  const [individualEdit, setIndividualEdit] = useState<{ open: boolean; entityId: string; initialValues: IndividualEntityForEdit } | null>(null);
  const [loadingIndividualId, setLoadingIndividualId] = useState<string | null>(null);

  const handleIndividualEditClick = async (entityId: string) => {
    setLoadingIndividualId(entityId);
    const data = await getIndividualEntityForEdit(entityId);
    setLoadingIndividualId(null);
    if (data) setIndividualEdit({ open: true, entityId, initialValues: data });
    else toast.error('Could not load vendor details.');
  };

  // ── Lead source / referrer display (read-only on this card; editing in LeadSourceSheet) ──
  // Initialize from the deal's denormalized lead_source text to avoid async flash on mount
  const [resolvedLeadSourceLabel, setResolvedLeadSourceLabel] = useState<string | null>(
    deal.lead_source ? deal.lead_source.replace(/_/g, ' ') : null,
  );
  const [referrerDisplayName, setReferrerDisplayName] = useState<string | null>(null);
  const [leadSourceSheetOpen, setLeadSourceSheetOpen] = useState(false);

  // Resolve structured label + referrer name (upgrades the initial denormalized value)
  useEffect(() => {
    let cancelled = false;
    if (deal.lead_source_id) {
      getLeadSourceLabel(deal.lead_source_id).then((label) => {
        if (!cancelled && label) setResolvedLeadSourceLabel(label);
      });
    }
    if (deal.referrer_entity_id) {
      getEntityDisplayName(deal.referrer_entity_id).then((name) => {
        if (!cancelled) setReferrerDisplayName(name);
      });
    } else {
      setReferrerDisplayName(null);
    }
    return () => { cancelled = true; };
  }, [deal.lead_source_id, deal.referrer_entity_id]);

  const handleLeadSourceSaved = useCallback((sourceLabel?: string | null, referrerName?: string | null) => {
    if (sourceLabel !== undefined) setResolvedLeadSourceLabel(sourceLabel);
    if (referrerName !== undefined) setReferrerDisplayName(referrerName);
    router.refresh();
  }, [router]);

  // Dismiss vendor picker on outside click
  useEffect(() => {
    if (!vendorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-vendor-picker]')) setVendorPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vendorPickerOpen]);

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderEditBtn = (s: DealStakeholderDisplay) => {
    const orgId = s.organization_id;
    if (s.relationship_id) {
      return (
        <button
          type="button"
          onClick={() => handleEditClick(s.relationship_id!)}
          disabled={loadingRelId === s.relationship_id}
          className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
          aria-label="Edit"
        >
          {loadingRelId === s.relationship_id ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
        </button>
      );
    }
    const type = s.entity_type ?? 'company';
    if (type === 'couple' && orgId) {
      return (
        <button type="button" onClick={() => handleCoupleEditClick(orgId)} disabled={loadingCoupleId === orgId}
          className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }} aria-label="Edit">
          {loadingCoupleId === orgId ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
        </button>
      );
    }
    if (type === 'person' && orgId) {
      return (
        <button type="button" onClick={() => handleIndividualEditClick(orgId)} disabled={loadingIndividualId === orgId}
          className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }} aria-label="Edit">
          {loadingIndividualId === orgId ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
        </button>
      );
    }
    return null;
  };

  const renderVendorValue = (s: DealStakeholderDisplay) => (
    <div className="flex items-center gap-2 min-w-0">
      <EntityIcon entityType={s.entity_type} className="size-3.5 text-[var(--stage-text-tertiary)]" />
      <span className="text-sm text-[var(--stage-text-primary)] tracking-tight truncate">{s.name}</span>
      {renderEditBtn(s)}
      <button
        type="button"
        onClick={() => handleRemove(s.id)}
        className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/70 transition-colors focus:outline-none ml-auto"
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        aria-label="Remove"
      >
        <X className="size-3" />
      </button>
    </div>
  );

  // ============================================================================
  // Signals computation
  // ============================================================================

  const daysOut = deal.proposed_date
    ? Math.ceil((new Date(deal.proposed_date + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null;
  const viewCount = initialProposal?.view_count ?? 0;
  const depositPercent = initialProposal?.deposit_percent ?? 0;
  const depositPaidAt = initialProposal?.deposit_paid_at;
  const pastDealsCount = client?.pastDealsCount ?? 0;
  const mainContact = client?.mainContact;
  const winProbability = (deal as DealDetail & { win_probability?: number | null }).win_probability ?? null;

  type StatItem = {
    label: string;
    value: string | null;   // null → show empty state
    empty?: string;         // placeholder text when value is null
    color?: string;
    onClick?: () => void;   // when set, the cell is clickable
  };

  // ── Core fields: always shown, empty state when no data ──
  const coreStats: StatItem[] = [
    {
      label: 'Days out',
      value: daysOut !== null
        ? (daysOut > 0 ? `${daysOut}` : 'Passed')
        : null,
      empty: 'No date set',
      color: daysOut !== null && daysOut > 0
        ? daysOut <= 14
          ? 'var(--color-unusonic-error)'
          : daysOut <= 60
            ? 'var(--color-unusonic-warning)'
            : undefined
        : daysOut === 0 || (daysOut !== null && daysOut < 0)
          ? 'var(--stage-text-secondary)'
          : undefined,
    },
    {
      label: 'Budget',
      value: deal.budget_estimated != null ? budgetFormatter.format(deal.budget_estimated) : null,
      empty: 'Not set',
    },
    {
      label: 'Lead source',
      value: resolvedLeadSourceLabel ?? (deal.lead_source ? deal.lead_source.replace(/_/g, ' ') : null),
      empty: 'Add source',
      onClick: () => setLeadSourceSheetOpen(true),
    },
    // Referred by — always in the grid when referrer exists (prevents layout shift)
    ...(deal.referrer_entity_id ? [{
      label: 'Referred by',
      value: referrerDisplayName ?? 'Loading…',
      onClick: () => setLeadSourceSheetOpen(true),
    }] : []),
    {
      label: 'Win probability',
      value: winProbability != null ? `${winProbability}%` : null,
      empty: '—',
      color: winProbability != null
        ? winProbability >= 70
          ? 'var(--color-unusonic-success)'
          : winProbability >= 40
            ? 'var(--color-unusonic-warning)'
            : 'var(--color-unusonic-error)'
        : undefined,
    },
  ];

  // ── Conditional fields: only shown when data exists ──
  const conditionalStats: StatItem[] = [];

  // "Referred by" is always shown when deal has a referrer — never added/removed dynamically
  // to prevent layout shift. It's in coreStats, not conditionalStats.

  if (deal.lead_source_detail) {
    conditionalStats.push({
      label: 'Source detail',
      value: deal.lead_source_detail,
    });
  }

  if (pastDealsCount > 0) {
    conditionalStats.push({
      label: 'Client history',
      value: pastDealsCount === 1 ? 'First event' : `${pastDealsCount - 1} prior event${pastDealsCount > 2 ? 's' : ''}`,
    });
  }

  if (initialProposal != null && viewCount > 0) {
    conditionalStats.push({
      label: 'Proposal opens',
      value: `${viewCount}×${initialProposal.last_viewed_at ? ` · ${formatRelTime(initialProposal.last_viewed_at)}` : ''}`,
    });
  }

  if (initialProposal != null && depositPercent > 0) {
    const signedAt = initialProposal.signed_at ?? initialProposal.accepted_at;
    const daysSinceSigned = signedAt
      ? Math.floor((Date.now() - new Date(signedAt).getTime()) / 86400000)
      : null;
    // Deposit overdue: signed > deadline days ago, no payment
    const depositDeadlineDays = (initialProposal as { deposit_deadline_days?: number | null }).deposit_deadline_days ?? 7;
    const depositOverdue = !depositPaidAt && daysSinceSigned !== null && daysSinceSigned > depositDeadlineDays;

    conditionalStats.push({
      label: 'Deposit',
      value: depositPaidAt
        ? 'Received'
        : depositOverdue
          ? `${depositPercent}% overdue · ${daysSinceSigned}d`
          : `${depositPercent}% pending`,
      color: depositPaidAt
        ? 'var(--color-unusonic-success)'
        : depositOverdue
          ? 'var(--color-unusonic-error)'
          : 'var(--color-unusonic-warning)',
    });
  }

  // Payment due warning: event approaching and balance not fully paid
  if (initialProposal != null && daysOut !== null && daysOut > 0) {
    const paymentDueDays = initialProposal.payment_due_days ?? 14;
    const daysUntilPaymentDue = daysOut - paymentDueDays;
    // Show warning when payment due date is within 14 days or already passed
    if (daysUntilPaymentDue <= 14) {
      conditionalStats.push({
        label: 'Balance due',
        value: daysUntilPaymentDue <= 0
          ? `Overdue · was due ${Math.abs(daysUntilPaymentDue)}d ago`
          : `Due in ${daysUntilPaymentDue}d`,
        color: daysUntilPaymentDue <= 0
          ? 'var(--color-unusonic-error)'
          : daysUntilPaymentDue <= 7
            ? 'var(--color-unusonic-warning)'
            : undefined,
      });
    }
  }

  if (mainContact?.email) {
    conditionalStats.push({
      label: 'Signing contact',
      value: [mainContact.first_name, mainContact.last_name].filter(Boolean).join(' ') || mainContact.email,
    });
  }

  const allStats = [...coreStats, ...conditionalStats];
  const hasVendors = vendors.length > 0 || !!sourceOrgId;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <StagePanel elevated className="p-5 shrink-0">
        <p className="stage-label text-[var(--stage-text-secondary)] mb-4">
          Signals
        </p>

        {/* Stat grid — core fields always shown, conditional fields appended */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-1">
          {allStats.map((stat) => {
            const isEmpty = stat.value === null;
            const isClickable = !!stat.onClick;
            const Wrapper = isClickable ? 'button' : 'div';
            return (
              <div
                key={stat.label}
                className="flex flex-col gap-0.5 min-w-0"
              >
                <Wrapper
                  {...(isClickable ? { type: 'button' as const, onClick: stat.onClick } : {})}
                  className={cn(
                    'flex flex-col gap-0.5 min-w-0 text-left',
                    isClickable && 'cursor-pointer -mx-1.5 px-1.5 py-1 [border-radius:var(--stage-radius-input,6px)] transition-colors hover:bg-[var(--stage-accent-muted)] hover:border-[oklch(1_0_0_/_0.08)]',
                    isClickable && isEmpty && 'border border-dashed border-[oklch(1_0_0_/_0.06)]',
                  )}
                >
                  <span className="stage-label text-[var(--stage-text-tertiary)] truncate">
                    {stat.label}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium tracking-tight truncate tabular-nums',
                      isEmpty && !isClickable && 'text-[var(--stage-text-tertiary)] font-normal',
                      isEmpty && isClickable && 'text-[var(--stage-text-tertiary)] font-normal flex items-center gap-1',
                    )}
                    style={!isEmpty && stat.color ? { color: stat.color } : undefined}
                  >
                    {isEmpty && isClickable && <Plus size={9} />}
                    {stat.value ?? stat.empty ?? '—'}
                  </span>
                </Wrapper>
              </div>
            );
          })}
        </div>

        {/* Partners / vendors */}
        {hasVendors && (
          <>
            <div className="border-t border-[oklch(1_0_0_/_0.06)] my-4" />
            <p className="stage-label text-[var(--stage-text-tertiary)] mb-3">
              Partners
            </p>
            <div className="flex flex-col gap-2">
              {vendors.map((v) => (
                <div key={v.id}>{renderVendorValue(v)}</div>
              ))}
              {sourceOrgId && (
                <div className="relative" data-vendor-picker>
                  <button
                    type="button"
                    onClick={() => setVendorPickerOpen((p) => !p)}
                    className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
                  >
                    <Plus size={13} />
                    <span>Add partner</span>
                  </button>
                  <AnimatePresence>
                    {vendorPickerOpen && (
                      <motion.div
                        key="vendor-picker"
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={STAGE_LIGHT}
                      >
                        <VendorSlotPicker
                          sourceOrgId={sourceOrgId}
                          onSelect={handleVendorSelect}
                          onGhostCreate={handleVendorGhostCreate}
                          onClose={() => setVendorPickerOpen(false)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        )}
      </StagePanel>

      {/* NetworkDetailSheet */}
      {sheetDetails && sourceOrgId && (
        <NetworkDetailSheet
          details={sheetDetails}
          sourceOrgId={sourceOrgId}
          onClose={() => setSheetDetails(null)}
          returnPath={crmReturnPath}
        />
      )}

      {/* CoupleEditSheet */}
      {coupleEdit && (
        <CoupleEditSheet
          open={coupleEdit.open}
          onOpenChange={(v) => !v && setCoupleEdit(null)}
          entityId={coupleEdit.entityId}
          initialValues={coupleEdit.initialValues}
          onSaved={() => {
            setCoupleEdit(null);
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}

      {/* IndividualEditSheet */}
      {individualEdit && (
        <IndividualEditSheet
          open={individualEdit.open}
          onOpenChange={(v) => !v && setIndividualEdit(null)}
          entityId={individualEdit.entityId}
          initialValues={individualEdit.initialValues}
          onSaved={() => {
            setIndividualEdit(null);
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}

      {/* Lead source + referrer editing sheet (portal-based) */}
      <LeadSourceSheet
        open={leadSourceSheetOpen}
        dealId={deal.id}
        currentLeadSourceId={deal.lead_source_id ?? null}
        currentReferrerEntityId={deal.referrer_entity_id ?? null}
        sourceOrgId={sourceOrgId}
        onSaved={handleLeadSourceSaved}
        onClose={() => setLeadSourceSheetOpen(false)}
      />
    </>
  );
}
