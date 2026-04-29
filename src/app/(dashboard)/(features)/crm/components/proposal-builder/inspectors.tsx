'use client';

/**
 * Inspector cluster for the proposal-builder studio.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 * The studio file was 3,303 LOC after the team-picker extraction; this
 * pulls another ~927 LOC into a focused module so the main studio file
 * stays under a typecheck-friendly size and Vercel can drop
 * `ignoreBuildErrors: true` once all sub-trees are split.
 *
 * Owns:
 *   - LineInspector — right-rail panel for the selected scope row.
 *     Editable price/qty/note/cost/multiplier with on-blur saves.
 *   - FinancialInspector — proposal-level overview when nothing is
 *     selected. Subtotal/tax/total/cost/margin + per-block margin rows.
 *   - TermsEditor — payment terms + scope notes, on-blur saves to
 *     updateProposal.
 *   - InspectorRow — small primitive shared inside the inspectors.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { toast } from 'sonner';

import {
  updateProposalItem,
  updateProposal,
  deleteProposalItem,
  deleteProposalItemsByPackageInstanceId,
  unpackPackageInstance,
} from '@/features/sales/api/proposal-actions';
import {
  removeDealCrew,
  type DealCrewRow,
} from '../../actions/deal-crew';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { DemoBlock } from './types';
import { formatMoney } from './helpers';

// ---------------------------------------------------------------------------
// Line inspector — right-rail panel for the currently-selected scope row.
// ---------------------------------------------------------------------------

export function LineInspector({
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

export function FinancialInspector({
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
