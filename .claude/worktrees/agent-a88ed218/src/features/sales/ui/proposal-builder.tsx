'use client';

import React, { useEffect, useState, useCallback, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, X, FileText, Send, Mail, BookMarked, Calculator, Trash2, PackageOpen } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { upsertProposal, publishProposal, sendProposalLinkToRecipients, deleteProposalItemsByPackageInstanceId, unpackPackageInstance } from '../api/proposal-actions';
import { createPackage } from '../api/package-actions';
import { PackageSelectorPalette } from './package-selector-palette';
import { MarginProgressBar } from './MarginProgressBar';
import type { ProposalWithItems, ProposalBuilderLineItem, ProposalLineItemCategory, UnitType } from '../model/types';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

/** Contact with email (from deal stakeholders) for "Send to" picker. */
export type ProposalContact = { id: string; name: string; email: string };

export interface ProposalBuilderProps {
  /** Deal id (proposals belong to the deal during Liquid phase). */
  dealId: string;
  workspaceId: string;
  initialProposal?: ProposalWithItems | null;
  /** Client email to pre-fill "Send to" when proposal is sent (e.g. from event or CRM) */
  clientEmail?: string | null;
  /** Contacts from the deal (stakeholders with email) so user can select who to send the proposal to. */
  contacts?: ProposalContact[];
  /** When false, Send is blocked and an error is shown until a client is attached to the deal. */
  clientAttached?: boolean;
  onSaved?: (proposalId: string, total: number) => void;
  /** When true, show proposal as view-only (e.g. in Prism after handover). */
  readOnly?: boolean;
  /** Increment to refetch catalog (e.g. after creating/editing packages in Deal Room). */
  catalogRefreshTrigger?: number;
  /** Called after addPackageToProposal (palette "Apply"); parent should refetch and pass new initialProposal. */
  onProposalRefetch?: () => void;
  /** Shown in empty receipt when used in studio (e.g. "Drop catalog items here"). */
  emptyDropHint?: string;
  /** When true, show gold highlight on the empty drop zone only (studio drag-over). */
  isDragOver?: boolean;
  /** Deal title for proposal link email subject/body. */
  dealTitle?: string | null;
  className?: string;
}

function mapProposalItemsToLineItems(initialProposal: ProposalWithItems | null | undefined): ProposalBuilderLineItem[] {
  if (!initialProposal?.items?.length) return [];
  return initialProposal.items.map((item) => {
    const row = item as {
      id?: string;
      package_id?: string | null;
      origin_package_id?: string | null;
      package_instance_id?: string | null;
      display_group_name?: string | null;
      is_client_visible?: boolean | null;
      is_package_header?: boolean | null;
      original_base_price?: number | null;
      unit_type?: string | null;
      unit_multiplier?: number | null;
      override_price?: number | null;
      actual_cost?: number | null;
      unit_price?: number;
      name: string;
      description?: string | null;
      quantity: number;
      definition_snapshot?: { margin_meta?: { category?: string } } | null;
    };
    const category = row.definition_snapshot?.margin_meta?.category as ProposalBuilderLineItem['category'] | undefined;
    const unitType = (row.unit_type === 'hour' || row.unit_type === 'day' ? row.unit_type : 'flat') as ProposalBuilderLineItem['unitType'];
    return {
      id: row.id,
      packageId: row.package_id ?? null,
      originPackageId: row.origin_package_id ?? null,
      packageInstanceId: row.package_instance_id ?? null,
      displayGroupName: row.display_group_name ?? null,
      isClientVisible: row.is_client_visible ?? true,
      isPackageHeader: row.is_package_header ?? false,
      originalBasePrice: row.original_base_price != null && Number.isFinite(Number(row.original_base_price)) ? Number(row.original_base_price) : null,
      unitType: unitType ?? 'flat',
      unitMultiplier: row.unit_multiplier != null && Number.isFinite(Number(row.unit_multiplier)) ? Number(row.unit_multiplier) : 1,
      category: category ?? null,
      name: row.name,
      description: row.description ?? null,
      quantity: row.quantity,
      unitPrice: Number(row.unit_price ?? 0),
      overridePrice: row.override_price != null ? Number(row.override_price) : null,
      actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
    };
  });
}

/** Group flat line items by package_instance_id for display (Tagged Bursting). */
function groupLineItemsByPackageInstance(
  lineItems: ProposalBuilderLineItem[]
): { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }[] {
  const byKey = new Map<string, { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }>();
  lineItems.forEach((item, index) => {
    const key = item.packageInstanceId ?? `ungrouped-${index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        packageInstanceId: item.packageInstanceId ?? null,
        displayGroupName: item.displayGroupName ?? null,
        indices: [],
      });
    }
    byKey.get(key)!.indices.push(index);
  });
  return Array.from(byKey.values());
}

export function ProposalBuilder({
  dealId,
  workspaceId,
  initialProposal,
  clientEmail,
  contacts = [],
  clientAttached = true,
  onSaved,
  readOnly = false,
  catalogRefreshTrigger,
  onProposalRefetch,
  emptyDropHint,
  isDragOver = false,
  dealTitle = null,
  className,
}: ProposalBuilderProps) {
  const [lineItems, setLineItems] = useState<ProposalBuilderLineItem[]>(() =>
    mapProposalItemsToLineItems(initialProposal)
  );
  const [proposalId, setProposalId] = useState<string | null>(initialProposal?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [sendToEmail, setSendToEmail] = useState<string>(clientEmail ?? '');
  /** Selected contact ids for "Send to" (after send, used for mailto). */
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => {
    if (clientEmail?.trim() && contacts.length) {
      const match = contacts.find((c) => c.email.trim().toLowerCase() === clientEmail.trim().toLowerCase());
      return match ? new Set([match.id]) : new Set();
    }
    return new Set();
  });
  const [sendError, setSendError] = useState<string | null>(null);
  /** After send: result of sending proposal link email to recipients (if any). */
  const [sendEmailResult, setSendEmailResult] = useState<{ sent: number; failed: number; notConfigured?: boolean; firstError?: string } | null>(null);
  const [saveToCatalogPending, setSaveToCatalogPending] = useState(false);
  const [saveToCatalogMessage, setSaveToCatalogMessage] = useState<string | null>(null);
  const [showDraftSaved, setShowDraftSaved] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** When true, actual_cost is editable for Rental/Retail (sub-rental or custom order). */
  const [subRentalCostUnlocked, setSubRentalCostUnlocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sync line items when parent refetches proposal (e.g. after drop from catalog or "Apply to proposal" in palette).
  useEffect(() => {
    setLineItems(mapProposalItemsToLineItems(initialProposal));
    setProposalId(initialProposal?.id ?? null);
  }, [initialProposal]);

  // Pre-fill "Send to" when client email is available
  useEffect(() => {
    if (clientEmail?.trim() && !sendToEmail.trim()) setSendToEmail(clientEmail.trim());
  }, [clientEmail]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** All recipient emails: selected contacts + manual sendToEmail if different. */
  const recipientEmails = (() => {
    const fromContacts = contacts.filter((c) => selectedContactIds.has(c.id)).map((c) => c.email.trim()).filter(Boolean);
    const manual = sendToEmail.trim();
    if (manual && !fromContacts.includes(manual)) return [...fromContacts, manual];
    return fromContacts;
  })();

  // Clear "Draft saved" message after 3s
  useEffect(() => {
    if (!showDraftSaved) return;
    const t = setTimeout(() => setShowDraftSaved(false), 3000);
    return () => clearTimeout(t);
  }, [showDraftSaved]);

  const effectiveUnitPrice = (item: ProposalBuilderLineItem) =>
    item.overridePrice != null && Number.isFinite(item.overridePrice) ? item.overridePrice : item.unitPrice;
  const unitMultiplier = (item: ProposalBuilderLineItem) =>
    (item.unitType === 'hour' || item.unitType === 'day') ? Math.max(0, Number(item.unitMultiplier) || 1) : 1;
  const lineTotal = (item: ProposalBuilderLineItem) =>
    item.quantity * unitMultiplier(item) * effectiveUnitPrice(item);
  const total = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const addCustomLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        name: '',
        description: null,
        quantity: 1,
        unitPrice: 0,
        overridePrice: null,
        actualCost: null,
        category: null,
        packageId: null,
        originPackageId: null,
        isPackageHeader: false,
        originalBasePrice: null,
        unitType: 'flat' as UnitType,
        unitMultiplier: 1,
      },
    ]);
  }, []);

  const removeGroup = useCallback(
    (packageInstanceId: string) => {
      if (!proposalId) return;
      const next = lineItems.filter((item) => item.packageInstanceId !== packageInstanceId);
      setLineItems(next);
      setSelectedLineIndex(null);
      deleteProposalItemsByPackageInstanceId(proposalId, packageInstanceId).then(() => {
        onProposalRefetch?.();
      });
    },
    [proposalId, lineItems, onProposalRefetch]
  );

  const handleUnpack = useCallback(
    (packageInstanceId: string) => {
      if (!proposalId) return;
      unpackPackageInstance(proposalId, packageInstanceId).then(() => {
        onProposalRefetch?.();
      });
    },
    [proposalId, onProposalRefetch]
  );

  const removeItem = useCallback(
    (index: number) => {
      const next = lineItems.filter((_, i) => i !== index);
      setLineItems(next);
      setSelectedLineIndex((prev) => {
        if (prev == null) return null;
        if (prev === index) return null;
        return prev > index ? prev - 1 : prev;
      });
      // Persist delete to server after commit (avoid "Cannot call startTransition while rendering")
      const input = next.map((item) => ({
        packageId: item.packageId ?? null,
        originPackageId: item.originPackageId ?? item.packageId ?? null,
        packageInstanceId: item.packageInstanceId ?? null,
        displayGroupName: item.displayGroupName ?? null,
        isClientVisible: item.isClientVisible ?? true,
        isPackageHeader: item.isPackageHeader ?? false,
        originalBasePrice: item.originalBasePrice ?? null,
        unitType: item.unitType ?? 'flat',
        unitMultiplier: item.unitMultiplier ?? 1,
        category: item.category ?? null,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        overridePrice: item.overridePrice ?? null,
        actualCost: item.actualCost ?? null,
      }));
      setTimeout(() => {
        startTransition(async () => {
          const result = await upsertProposal(dealId, input);
          if (result.proposalId) {
            setProposalId(result.proposalId);
            onProposalRefetch?.();
          }
        });
      }, 0);
    },
    [dealId, lineItems, onProposalRefetch]
  );

  const updateQuantity = useCallback((index: number, quantity: number) => {
    const parsed = Number(quantity);
    const q = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: q } : item))
    );
  }, []);

  const updateLineItemOverridePrice = useCallback((index: number, value: number | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, overridePrice: value } : item))
    );
  }, []);

  const updateLineItemActualCost = useCallback((index: number, value: number | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, actualCost: value } : item))
    );
  }, []);

  const updateLineItemName = useCallback((index: number, name: string) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: name.trim() || item.name } : item))
    );
  }, []);

  const updateUnitMultiplier = useCallback((index: number, value: number) => {
    const v = Number.isFinite(value) ? Math.max(0.25, value) : 1;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitMultiplier: v } : item))
    );
  }, []);

  const updateUnitType = useCallback((index: number, value: UnitType) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, unitType: value, unitMultiplier: (value === 'flat' ? 1 : (item.unitMultiplier ?? 1)) }
          : item
      )
    );
  }, []);

  const updateLineItemUnitPrice = useCallback((index: number, value: number) => {
    const v = Number.isFinite(value) ? Math.max(0, value) : 0;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitPrice: v } : item))
    );
  }, []);

  const handleSaveDraft = useCallback(() => {
    setSaving(true);
    startTransition(async () => {
      const input = lineItems.map((item) => ({
        packageId: item.packageId ?? null,
        originPackageId: item.originPackageId ?? item.packageId ?? null,
        packageInstanceId: item.packageInstanceId ?? null,
        displayGroupName: item.displayGroupName ?? null,
        isClientVisible: item.isClientVisible ?? true,
        isPackageHeader: item.isPackageHeader ?? false,
        originalBasePrice: item.originalBasePrice ?? null,
        unitType: item.unitType ?? 'flat',
        unitMultiplier: item.unitMultiplier ?? 1,
        category: item.category ?? null,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        overridePrice: item.overridePrice ?? null,
        actualCost: item.actualCost ?? null,
      }));
      const result = await upsertProposal(dealId, input);
      setSaving(false);
      if (result.proposalId) {
        setProposalId(result.proposalId);
        onSaved?.(result.proposalId, result.total);
        setShowDraftSaved(true);
      }
    });
  }, [dealId, lineItems, onSaved]);

  const handleSend = useCallback(() => {
    setSendError(null);
    if (clientAttached === false) {
      setSendError('Attach a client to this deal before sending the proposal.');
      return;
    }
    setSending(true);
    startTransition(async () => {
      try {
        const input = lineItems.map((item) => ({
          packageId: item.packageId ?? null,
          originPackageId: item.originPackageId ?? item.packageId ?? null,
          packageInstanceId: item.packageInstanceId ?? null,
          displayGroupName: item.displayGroupName ?? null,
          isClientVisible: item.isClientVisible ?? true,
          isPackageHeader: item.isPackageHeader ?? false,
          originalBasePrice: item.originalBasePrice ?? null,
          unitType: item.unitType ?? 'flat',
          unitMultiplier: item.unitMultiplier ?? 1,
          category: item.category ?? null,
          name: item.name,
          description: item.description ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          overridePrice: item.overridePrice ?? null,
          actualCost: item.actualCost ?? null,
        }));
        const upsert = await upsertProposal(dealId, input);
        if (!upsert.proposalId) {
          setSendError(upsert.error ?? 'Failed to save proposal.');
          return;
        }
        setProposalId(upsert.proposalId);
        const pub = await publishProposal(upsert.proposalId);
        if (pub.publicUrl) {
          setSentUrl(pub.publicUrl);
          setSendError(null);
          const emails = (() => {
            const fromContacts = contacts.filter((c) => selectedContactIds.has(c.id)).map((c) => c.email.trim()).filter(Boolean);
            const manual = sendToEmail.trim();
            if (manual && !fromContacts.includes(manual)) return [...fromContacts, manual];
            return fromContacts;
          })();
          if (emails.length > 0) {
            const emailResult = await sendProposalLinkToRecipients(pub.publicUrl, emails, dealTitle);
            setSendEmailResult(emailResult);
          } else {
            setSendEmailResult(null);
          }
        } else {
          setSendError(pub.error ?? 'Failed to publish proposal.');
          setSendEmailResult(null);
        }
        onSaved?.(upsert.proposalId, upsert.total);
      } finally {
        setSending(false);
      }
    });
  }, [dealId, lineItems, onSaved, clientAttached, dealTitle, contacts, selectedContactIds, sendToEmail]);

  const handleSaveToCatalog = useCallback(() => {
    if (!workspaceId || lineItems.length === 0) return;
    setSaveToCatalogMessage(null);
    setSaveToCatalogPending(true);
    const name = `Custom bundle – ${new Date().toLocaleDateString()}`;
    const description = lineItems
      .map((i) => `${i.name} × ${i.quantity}${(i.unitType === 'hour' || i.unitType === 'day') ? ` × ${unitMultiplier(i)} ${i.unitType === 'hour' ? 'hrs' : 'days'}` : ''} = $${lineTotal(i).toLocaleString()}`)
      .join('\n');
    const total = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
    createPackage(workspaceId, {
      name,
      description,
      category: 'package',
      price: total,
    }).then((result) => {
      setSaveToCatalogPending(false);
      if (result.error) {
        setSaveToCatalogMessage(result.error);
      } else {
        setSaveToCatalogMessage('Saved to Catalog. You can add it to other proposals from Add from Catalog.');
      }
    });
  }, [workspaceId, lineItems]);

  if (readOnly) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <LiquidPanel className="p-6 rounded-[28px] border border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
            Proposal (locked)
          </h2>
          {lineItems.length === 0 ? (
            <p className="text-sm text-ink-muted">No line items.</p>
          ) : (
            <ul className="space-y-2">
              {lineItems.map((item, i) => (
                <li
                  key={item.id ?? i}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/10 last:border-0 text-sm"
                >
                  <span className="text-ink truncate">{item.name}</span>
                  <span className="text-ink-muted tabular-nums shrink-0">
                    {item.quantity} × ${effectiveUnitPrice(item).toLocaleString()} = $
                    {(item.quantity * effectiveUnitPrice(item)).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-white/10">
            <span className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Total</span>
            <span className="text-xl font-semibold text-ink tabular-nums">${total.toLocaleString()}</span>
          </div>
        </LiquidPanel>
      </div>
    );
  }

  const hasVariableUnits = lineItems.some((i) => i.unitType === 'hour' || i.unitType === 'day');
  const receiptRowClass = hasVariableUnits
    ? 'grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-4 rounded-xl bg-white/[0.03] border border-white/10 min-w-0'
    : 'grid grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-4 rounded-xl bg-white/[0.03] border border-white/10 min-w-0';
  const receiptHeaderClass = hasVariableUnits
    ? 'grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-2 px-4 mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted border-b border-white/10'
    : 'grid grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 items-center py-2 px-4 mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted border-b border-white/10';
  const qtyStepperClass =
    'flex flex-col items-center shrink-0 w-10 rounded-lg border border-white/10 bg-white/[0.04]';
  const qtyBtnClass =
    'p-1 w-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset';
  const qtyInputClass =
    'w-full py-0.5 px-0 text-center text-sm font-medium tabular-nums bg-transparent border-0 text-ink focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const renderReceiptRow = (index: number, showIncludedWhenZero: boolean) => {
    const item = lineItems[index];
    const isIncluded = showIncludedWhenZero && effectiveUnitPrice(item) === 0;
    return (
      <motion.li
        key={item.id ?? `row-${index}`}
        layout
        transition={spring}
        className={cn(
          receiptRowClass,
          'cursor-pointer transition-colors',
          selectedLineIndex === index && 'ring-2 ring-[var(--color-neon-amber)]/40 ring-offset-2 ring-offset-obsidian'
        )}
        onClick={() => {
          const next = selectedLineIndex === index ? null : index;
          setSelectedLineIndex(next);
          setSubRentalCostUnlocked(false);
        }}
      >
        <div className="min-w-0 pr-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <p className="font-medium text-ink truncate text-sm leading-snug">
            {item.name || 'Custom item'}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <select
              value={item.unitType ?? 'flat'}
              onChange={(e) => updateUnitType(index, e.target.value as UnitType)}
              className="text-xs bg-white/[0.06] border border-white/10 rounded-md px-1.5 py-0.5 text-ink-muted focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              aria-label="Billing unit type"
            >
              <option value="flat">Flat</option>
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
            </select>
            <span className="text-xs text-ink-muted tabular-nums">
              {isIncluded ? 'Included' : `$${effectiveUnitPrice(item).toLocaleString()}${item.unitType === 'hour' ? '/hr' : item.unitType === 'day' ? '/day' : ' each'}`}
            </span>
          </div>
        </div>
        <div className={qtyStepperClass} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              updateQuantity(index, item.quantity + 1);
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            className={qtyBtnClass}
            aria-label={`Increase quantity for ${item.name || 'item'}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => updateQuantity(index, e.target.valueAsNumber)}
            className={qtyInputClass}
            aria-label={`Quantity for ${item.name || 'item'}`}
          />
          <button
            type="button"
            onClick={(e) => {
              updateQuantity(index, item.quantity - 1);
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            disabled={item.quantity <= 1}
            className={qtyBtnClass}
            aria-label={`Decrease quantity for ${item.name || 'item'}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
        {hasVariableUnits && (
          <div className="w-12 shrink-0 flex justify-center" onClick={(e) => e.stopPropagation()}>
            {(item.unitType === 'hour' || item.unitType === 'day') ? (
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={item.unitMultiplier ?? 1}
                onChange={(e) => updateUnitMultiplier(index, e.target.valueAsNumber)}
                className="w-full text-center text-sm font-medium tabular-nums bg-white/[0.04] border border-white/10 rounded-lg py-1 px-1 text-ink [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label={item.unitType === 'hour' ? 'Hours' : 'Days'}
              />
            ) : (
              <span className="text-xs text-ink-muted">—</span>
            )}
          </div>
        )}
        <span className="text-sm font-semibold text-ink tabular-nums w-14 shrink-0 text-right">
          {isIncluded ? 'Included' : `$${lineTotal(item).toLocaleString()}`}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeItem(index);
            if (selectedLineIndex === index) setSelectedLineIndex(null);
          }}
          className="p-1.5 rounded-lg text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] w-9 h-9 flex items-center justify-center shrink-0"
          aria-label={`Remove ${item.name || 'item'}`}
        >
          <X className="w-4 h-4" />
        </button>
      </motion.li>
    );
  };

  const receiptListContent = (
    <div className="flex-1 overflow-auto min-h-[160px] min-w-0">
      {lineItems.length > 0 && (
        <div className={receiptHeaderClass}>
          <span>Item</span>
          <span className="text-center">Qty</span>
          {hasVariableUnits && <span className="text-center w-12 shrink-0">Hrs</span>}
          <span className="text-right w-14 shrink-0">Total</span>
          <span className="w-9 shrink-0" aria-hidden />
        </div>
      )}
      <ul className="space-y-3 mt-1">
        {lineItems.length === 0 ? (
          <li
            className={cn(
              'text-sm text-ink-muted py-12 px-6 text-center rounded-2xl border-2 border-dashed min-h-[160px] flex flex-col items-center justify-center gap-2 transition-colors duration-150',
              isDragOver
                ? 'border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10'
                : 'border-white/15 bg-white/[0.02]'
            )}
          >
            <span>{emptyDropHint ?? 'Add items from the catalog or create a custom line item.'}</span>
          </li>
        ) : (
          groupLineItemsByPackageInstance(lineItems).map((group) => {
            const headerIndex = group.indices.find((i) => lineItems[i].isPackageHeader);
            const childIndices = group.indices.filter((i) => !lineItems[i].isPackageHeader);
            const hasHeaderRow = headerIndex !== undefined && group.packageInstanceId;

            return (
              <li
                key={group.packageInstanceId ?? `ungrouped-${group.indices[0]}`}
                className="space-y-2 list-none"
              >
                {hasHeaderRow ? (
                  <>
                    {/* Package header row: bold name, editable bundle price, Unpack + Trash (div to avoid li > li) */}
                    {(() => {
                      const item = lineItems[headerIndex!];
                      const index = headerIndex!;
                      return (
                        <motion.div
                          layout
                          transition={spring}
                          role="row"
                          className={cn(
                            receiptRowClass,
                            'cursor-pointer transition-colors',
                            selectedLineIndex === index && 'ring-2 ring-[var(--color-neon-amber)]/40 ring-offset-2 ring-offset-obsidian'
                          )}
                          onClick={() => {
                            setSelectedLineIndex(selectedLineIndex === index ? null : index);
                            setSubRentalCostUnlocked(false);
                          }}
                        >
                          <div className="min-w-0 pr-2 overflow-hidden">
                            <p className="font-semibold text-ceramic truncate text-sm leading-snug">
                              {item.name || 'Package'}
                            </p>
                            <p className="text-xs text-ink-muted mt-0.5">Bundle price</p>
                          </div>
                          <div className={qtyStepperClass} onClick={(e) => e.stopPropagation()}>
                            <span className="text-sm font-medium text-ink-muted py-2">1</span>
                          </div>
                          {hasVariableUnits && (
                            <div className="w-12 shrink-0 flex justify-center">
                              <span className="text-xs text-ink-muted">—</span>
                            </div>
                          )}
                          <div className="w-14 shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <CurrencyInput
                              value={String(effectiveUnitPrice(item))}
                              onChange={(v) => updateLineItemUnitPrice(index, Number(v) || 0)}
                              className="text-sm font-semibold text-ink text-right w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 py-1"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnpack(group.packageInstanceId!);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/[0.06] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                              title="Unpack to line items: break the package into individual items at their standard catalog price."
                              aria-label="Unpack to line items"
                            >
                              <PackageOpen className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeGroup(group.packageInstanceId!);
                                if (selectedLineIndex === index) setSelectedLineIndex(null);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                              aria-label={`Remove ${item.name || 'package'}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })()}
                    {/* Child rows: indented, show "Included" when $0 */}
                    <ul className="pl-5 ml-1 border-l-2 border-white/10 space-y-3 list-none p-0 m-0">
                      {childIndices.map((index) => renderReceiptRow(index, true))}
                    </ul>
                  </>
                ) : (
                  <>
                    {group.displayGroupName && group.packageInstanceId && (
                      <div className="flex items-center justify-between gap-2 py-1.5 px-4 rounded-xl bg-white/[0.04] border border-white/10">
                        <span className="text-sm font-medium text-ceramic truncate">
                          {group.displayGroupName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGroup(group.packageInstanceId!)}
                          className="p-1.5 rounded-lg text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] shrink-0"
                          aria-label={`Remove ${group.displayGroupName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <ul
                      className={cn(
                        'space-y-3 list-none p-0 m-0',
                        group.displayGroupName && group.packageInstanceId && 'pl-5 ml-1 border-l-2 border-white/10'
                      )}
                    >
                      {group.indices.map((index) => renderReceiptRow(index, false))}
                    </ul>
                  </>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );

  const selectedItem = selectedLineIndex != null ? lineItems[selectedLineIndex] ?? null : null;
  const inspectorCategory: ProposalLineItemCategory | null = selectedItem?.category ?? null;
  const costFullyEditable = inspectorCategory === 'service' || inspectorCategory === 'talent';
  const costRentalRetail = inspectorCategory === 'rental' || inspectorCategory === 'retail_sale';
  const costEditable = costFullyEditable || (costRentalRetail && subRentalCostUnlocked) || inspectorCategory == null;
  const costHidden = inspectorCategory === 'package' || inspectorCategory === 'fee';
  const inspectorOverridePrice = selectedItem
    ? (selectedItem.overridePrice != null && Number.isFinite(selectedItem.overridePrice)
        ? selectedItem.overridePrice
        : selectedItem.unitPrice)
    : 0;
  const inspectorActualCost =
    selectedItem?.actualCost != null && Number.isFinite(selectedItem.actualCost)
      ? selectedItem.actualCost
      : 0;
  const inspectorMarginPercent =
    inspectorOverridePrice > 0
      ? ((inspectorOverridePrice - inspectorActualCost) / inspectorOverridePrice) * 100
      : 0;

  return (
    <div className={cn('flex flex-col gap-4', className)} style={{ overflow: 'visible' }}>
      <div
        className={cn(
          'grid gap-6 min-h-0 flex-1 w-full grid-rows-[minmax(0,1fr)]',
          selectedLineIndex != null ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        )}
      >
        {/* Receipt: card has max-height; inner div scrolls (liquid-card uses overflow-hidden so we need a separate scroll container) */}
        <div className="min-w-0 flex flex-col min-h-0 flex-1">
          <div className="liquid-card flex flex-col min-h-0 max-h-[calc(100vh-7rem)] overflow-hidden rounded-[28px] border border-white/10">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-5">
                Receipt
              </h2>
              <div className="min-w-0">
                {receiptListContent}
              </div>

            {/* + Add from Catalog — opens palette */}
            <div className="shrink-0 pt-4 mt-2 border-t border-white/10">
              {workspaceId && dealId && (
                <PackageSelectorPalette
                  workspaceId={workspaceId}
                  dealId={dealId}
                  open={paletteOpen}
                  onOpenChange={setPaletteOpen}
                  onApplied={onProposalRefetch}
                  onAddCustomLineItem={addCustomLineItem}
                  trigger={
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-white/15 text-ink-muted hover:text-ink hover:border-white/25 hover:bg-white/[0.04] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                    >
                      <Plus className="w-4 h-4" aria-hidden />
                      Add from catalog
                    </button>
                  }
                />
              )}
            </div>

            {/* Send to: select contacts (from deal stakeholders) */}
            {contacts.length > 0 && (
              <div className="shrink-0 pt-4 mt-2 border-t border-white/10">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
                  Send to
                </p>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c) => (
                    <label
                      key={c.id}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors text-sm',
                        selectedContactIds.has(c.id)
                          ? 'border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-ceramic'
                          : 'border-white/10 hover:bg-white/5 text-ink-muted'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.has(c.id)}
                        onChange={() => toggleContact(c.id)}
                        className="sr-only"
                      />
                      <span className="font-medium truncate max-w-[140px]">{c.name}</span>
                      <span className="text-xs truncate max-w-[120px] opacity-80">{c.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Total + actions */}
            <div className="shrink-0 pt-6 mt-6 border-t border-white/10">
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                  Total
                </span>
                <span className="text-xl font-semibold text-ink tabular-nums">
                  ${total.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveToCatalog}
                    disabled={lineItems.length === 0 || saveToCatalogPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-[var(--color-neon-amber)]/40 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:brightness-110 hover:bg-[var(--color-neon-amber)]/15 disabled:opacity-50 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                  >
                    <BookMarked className="w-4 h-4" />
                    {saveToCatalogPending ? 'Saving…' : 'Save to Catalog'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={lineItems.length === 0 || saving || isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] text-ceramic font-medium text-sm hover:bg-white/[0.08] disabled:opacity-50 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                  >
                    <FileText className="w-4 h-4" />
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={lineItems.length === 0 || sending || isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-ink text-obsidian font-medium text-sm hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {saveToCatalogMessage && (
                  <p className="mt-2 text-sm text-ink-muted" role="status">
                    {saveToCatalogMessage}
                  </p>
                )}
                {showDraftSaved && (
                  <p className="mt-2 text-sm text-[var(--color-neon)]" role="status">
                    Draft saved
                  </p>
                )}
                {sendError && (
                  <p className="mt-3 text-sm text-[var(--color-signal-error)]" role="alert">
                    {sendError}
                  </p>
                )}
                {sentUrl && (
                  <div className="mt-4 space-y-3">
                      <p className="text-sm text-ink-muted">
                        Proposal sent. Share link:{' '}
                        <a
                          href={sentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-neon-amber)] underline font-medium hover:brightness-110"
                        >
                          {sentUrl}
                        </a>
                      </p>
                      {sendEmailResult != null && (
                        <p className="text-sm text-ink-muted" role="status">
                          {sendEmailResult.notConfigured
                            ? typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/.test(window.location?.hostname ?? '')
                              ? 'Add RESEND_API_KEY in Vercel (Settings → Environment Variables) for Production, then redeploy. Until then, use Open in email to send the link.'
                              : 'Add RESEND_API_KEY to .env.local to send from the app. Until then, use Open in email to send the link.'
                            : sendEmailResult.sent > 0
                              ? `Email sent to ${sendEmailResult.sent} recipient${sendEmailResult.sent === 1 ? '' : 's'}.`
                              : sendEmailResult.failed > 0 && sendEmailResult.firstError
                                ? `Email failed: ${sendEmailResult.firstError}`
                                : null}
                        </p>
                      )}
                      <div className="flex flex-col gap-3">
                        {contacts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
                              Recipients
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {contacts.map((c) => (
                                <label
                                  key={c.id}
                                  className={cn(
                                    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors text-sm',
                                    selectedContactIds.has(c.id)
                                      ? 'border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-ceramic'
                                      : 'border-white/10 hover:bg-white/5 text-ink-muted'
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedContactIds.has(c.id)}
                                    onChange={() => toggleContact(c.id)}
                                    className="sr-only"
                                  />
                                  <span className="font-medium truncate max-w-[140px]">{c.name}</span>
                                  <span className="text-xs truncate max-w-[120px] opacity-80">{c.email}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <label htmlFor="send-to-email-mobile" className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                            {contacts.length > 0 ? 'Add another email' : 'Email link to'}
                          </label>
                          <input
                            id="send-to-email-mobile"
                            type="email"
                            value={sendToEmail}
                            onChange={(e) => setSendToEmail(e.target.value)}
                            placeholder="client@example.com"
                            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (recipientEmails.length === 0) return;
                            const to = recipientEmails.join(',');
                            const subject = encodeURIComponent('Your proposal');
                            const body = encodeURIComponent(`View your proposal: ${sentUrl}`);
                            window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
                          }}
                          disabled={recipientEmails.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] text-ink font-medium text-sm hover:bg-white/[0.08] disabled:opacity-50 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                        >
                          <Mail className="w-4 h-4" />
                          Open in email
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        {/* Financial Inspector — when a line item is selected */}
        {selectedLineIndex != null && selectedItem && (
          <div className="min-w-0 flex flex-col overflow-visible">
            <LiquidPanel className="flex flex-col p-6 min-h-[280px] flex-1 min-w-0 overflow-visible rounded-[28px] border border-white/10">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4 shrink-0 flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Financial Inspector
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="inspector-line-name" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                    Line item name
                  </label>
                  <input
                    id="inspector-line-name"
                    type="text"
                    value={selectedItem.name ?? ''}
                    onChange={(e) => updateLineItemName(selectedLineIndex, e.target.value)}
                    placeholder="e.g. Special confetti cannon"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-obsidian"
                  />
                </div>
                <div>
                  <label htmlFor="inspector-override-price" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                    Price (what client pays)
                  </label>
                  <CurrencyInput
                    id="inspector-override-price"
                    value={selectedItem.overridePrice != null ? String(selectedItem.overridePrice) : selectedItem.unitPrice != null ? String(selectedItem.unitPrice) : ''}
                    onChange={(v) => {
                      const n = v.trim() === '' ? null : Number(v);
                      updateLineItemOverridePrice(selectedLineIndex, Number.isFinite(n) ? n : null);
                    }}
                    placeholder="0.00"
                  />
                </div>
                {costHidden ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-ink-muted">
                    {inspectorCategory === 'package'
                      ? 'Cost is the sum of ingredients. Adjust costs inside the package.'
                      : 'Cost is set by third party (e.g. processor, permit).'}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="inspector-actual-cost" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                      Actual cost (what you pay)
                    </label>
                    <CurrencyInput
                      id="inspector-actual-cost"
                      value={inspectorActualCost != null ? String(inspectorActualCost) : ''}
                      onChange={(v) => {
                        if (!costEditable) return;
                        const n = v.trim() === '' ? null : Number(v);
                        updateLineItemActualCost(selectedLineIndex, Number.isFinite(n) ? n : null);
                      }}
                      placeholder="0.00"
                      disabled={!costEditable}
                      className={cn(!costEditable && 'opacity-80')}
                    />
                    {costRentalRetail && (
                      <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={subRentalCostUnlocked}
                          onChange={(e) => setSubRentalCostUnlocked(e.target.checked)}
                          className="rounded border-white/20 bg-white/[0.04] text-[var(--color-neon-amber)] focus:ring-[var(--ring)]"
                        />
                        Is this a Sub-Rental / Custom Order?
                      </label>
                    )}
                  </div>
                )}
                <MarginProgressBar marginPercent={inspectorMarginPercent} />
              </div>
            </LiquidPanel>
          </div>
        )}
      </div>
    </div>
  );
}
