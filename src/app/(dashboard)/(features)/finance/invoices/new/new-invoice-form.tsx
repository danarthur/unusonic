/**
 * New Invoice Form — client component for blank invoice authoring
 *
 * Dark theme (Stage Engineering). Line items editor with add/remove rows.
 * Uses useActionState (React 19) for form submission.
 *
 * @module app/(features)/finance/invoices/new/new-invoice-form
 */

'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { createBlankInvoice } from '@/features/finance/api/create-blank-invoice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityOption {
  id: string;
  display_name: string;
  type: string;
}

interface EventOption {
  id: string;
  title: string;
  deal_id: string | null;
}

interface LineItemDraft {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  itemKind: string;
}

interface FormState {
  error: string | null;
  success: boolean;
}

export interface NewInvoiceFormProps {
  workspaceId: string;
  entities: EntityOption[];
  events: EventOption[];
}

const ITEM_KINDS = [
  { value: 'service', label: 'Service' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'labor', label: 'Labor' },
  { value: 'travel', label: 'Travel' },
  { value: 'materials', label: 'Materials' },
  { value: 'other', label: 'Other' },
];

function newLineItem(): LineItemDraft {
  return {
    key: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    itemKind: 'service',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewInvoiceForm({
  workspaceId,
  entities,
  events,
}: NewInvoiceFormProps) {
  const router = useRouter();

  // Form fields
  const [billToId, setBillToId] = useState('');
  const [entitySearch, setEntitySearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([newLineItem()]);
  const [sendAfterSave, setSendAfterSave] = useState(false);

  // Filtered entities for search
  const filteredEntities = entitySearch.trim()
    ? entities.filter((e) =>
        e.display_name.toLowerCase().includes(entitySearch.toLowerCase()),
      )
    : entities;

  // Compute subtotal
  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPrice,
    0,
  );

  // Line item handlers
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, newLineItem()]);
  }, []);

  const removeLineItem = useCallback((key: string) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((li) => li.key !== key);
    });
  }, []);

  const updateLineItem = useCallback(
    (key: string, field: keyof LineItemDraft, value: string | number) => {
      setLineItems((prev) =>
        prev.map((li) => (li.key === key ? { ...li, [field]: value } : li)),
      );
    },
    [],
  );

  // Form action
  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState): Promise<FormState> => {
      if (!billToId) {
        return { error: 'Select a client to bill', success: false };
      }

      const validItems = lineItems.filter(
        (li) => li.description.trim() && li.unitPrice > 0,
      );
      if (validItems.length === 0) {
        return {
          error: 'Add at least one line item with a description and price',
          success: false,
        };
      }

      const selectedEvent = eventId
        ? events.find((e) => e.id === eventId)
        : null;

      const result = await createBlankInvoice({
        workspaceId,
        billToEntityId: billToId,
        eventId: eventId || null,
        dealId: selectedEvent?.deal_id ?? null,
        poNumber: poNumber || null,
        notesToClient: notes || null,
        terms: terms || null,
        lineItems: validItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          itemKind: li.itemKind,
        })),
      });

      if (result.error) {
        return { error: result.error, success: false };
      }

      // Optionally send immediately
      if (sendAfterSave && result.invoiceId) {
        try {
          const { sendInvoice } = await import(
            '@/features/finance/api/invoice-actions'
          );
          const sendResult = await sendInvoice(result.invoiceId);
          if (sendResult.error) {
            // Invoice saved but send failed — still success for the save
            return {
              error: `Invoice saved but send failed: ${sendResult.error}`,
              success: true,
            };
          }
        } catch {
          return {
            error: 'Invoice saved but send is not yet available',
            success: true,
          };
        }
      }

      return { error: null, success: true };
    },
    { error: null, success: false },
  );

  // Navigate on success
  const navigated = useRef(false);
  useEffect(() => {
    if (state.success && !navigated.current) {
      navigated.current = true;
      router.push('/finance');
    }
  }, [state.success, router]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);

  const inputStyle = {
    backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-medium text-[var(--stage-text-primary)]">
          New invoice
        </h1>
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        {/* ── Bill-to + details ──────────────────────────────────── */}
        <StagePanel>
          <div className="flex flex-col gap-4">
            {/* Bill-to entity */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                Bill to
              </span>
              <input
                type="text"
                value={entitySearch}
                onChange={(e) => {
                  setEntitySearch(e.target.value);
                  // Clear selection if user starts typing again
                  if (billToId) setBillToId('');
                }}
                placeholder="Search clients..."
                className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none"
                style={inputStyle}
              />
              {/* Selected entity display */}
              {billToId && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-[var(--stage-text-primary)]">
                    {entities.find((e) => e.id === billToId)?.display_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBillToId('');
                      setEntitySearch('');
                    }}
                    className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
                  >
                    Change
                  </button>
                </div>
              )}
              {/* Entity results dropdown */}
              {!billToId && entitySearch.trim() && filteredEntities.length > 0 && (
                <div
                  className="rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-1"
                  style={{ backgroundColor: 'var(--stage-surface-elevated)' }}
                >
                  {filteredEntities.slice(0, 20).map((ent) => (
                    <button
                      key={ent.id}
                      type="button"
                      onClick={() => {
                        setBillToId(ent.id);
                        setEntitySearch(ent.display_name);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] flex items-center justify-between"
                    >
                      <span>{ent.display_name}</span>
                      <span className="text-xs text-[var(--stage-text-tertiary)] capitalize">
                        {ent.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!billToId && entitySearch.trim() && filteredEntities.length === 0 && (
                <p className="text-xs text-[var(--stage-text-tertiary)] mt-1">
                  No matching clients found
                </p>
              )}
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Event link */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                  Link to show (optional)
                </span>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] outline-none appearance-none"
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </label>

              {/* PO number */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                  PO number (optional)
                </span>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-001"
                  className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        </StagePanel>

        {/* ── Line items ─────────────────────────────────────────── */}
        <StagePanel>
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
            Line items
          </h3>

          <div className="flex flex-col gap-3">
            {lineItems.map((li, idx) => (
              <div
                key={li.key}
                className="rounded-lg p-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3"
                style={{
                  backgroundColor: 'var(--stage-surface-nested)',
                }}
              >
                {/* Description */}
                <div className="flex-1 flex flex-col gap-1">
                  {idx === 0 && (
                    <span className="text-xs text-[var(--stage-text-tertiary)]">
                      Description
                    </span>
                  )}
                  <input
                    type="text"
                    value={li.description}
                    onChange={(e) =>
                      updateLineItem(li.key, 'description', e.target.value)
                    }
                    placeholder="Sound system rental"
                    className="h-8 rounded-md px-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none bg-[oklch(1_0_0_/_0.04)]"
                  />
                </div>

                {/* Item kind */}
                <div className="w-full sm:w-28 flex flex-col gap-1">
                  {idx === 0 && (
                    <span className="text-xs text-[var(--stage-text-tertiary)]">
                      Type
                    </span>
                  )}
                  <select
                    value={li.itemKind}
                    onChange={(e) =>
                      updateLineItem(li.key, 'itemKind', e.target.value)
                    }
                    className="h-8 rounded-md px-2.5 text-sm text-[var(--stage-text-primary)] outline-none appearance-none bg-[oklch(1_0_0_/_0.04)]"
                  >
                    {ITEM_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div className="w-full sm:w-20 flex flex-col gap-1">
                  {idx === 0 && (
                    <span className="text-xs text-[var(--stage-text-tertiary)]">
                      Qty
                    </span>
                  )}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={li.quantity}
                    onChange={(e) =>
                      updateLineItem(
                        li.key,
                        'quantity',
                        Math.max(1, parseInt(e.target.value) || 1),
                      )
                    }
                    className="h-8 rounded-md px-2.5 text-sm tabular-nums text-[var(--stage-text-primary)] outline-none bg-[oklch(1_0_0_/_0.04)]"
                  />
                </div>

                {/* Unit price */}
                <div className="w-full sm:w-28 flex flex-col gap-1">
                  {idx === 0 && (
                    <span className="text-xs text-[var(--stage-text-tertiary)]">
                      Unit price
                    </span>
                  )}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.unitPrice || ''}
                    onChange={(e) =>
                      updateLineItem(
                        li.key,
                        'unitPrice',
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    placeholder="0.00"
                    className="h-8 rounded-md px-2.5 text-sm tabular-nums text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none bg-[oklch(1_0_0_/_0.04)]"
                  />
                </div>

                {/* Amount (computed) */}
                <div className="w-full sm:w-24 flex flex-col gap-1">
                  {idx === 0 && (
                    <span className="text-xs text-[var(--stage-text-tertiary)]">
                      Amount
                    </span>
                  )}
                  <div className="h-8 flex items-center px-2.5 text-sm tabular-nums font-medium text-[var(--stage-text-primary)]">
                    {formatCurrency(li.quantity * li.unitPrice)}
                  </div>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeLineItem(li.key)}
                  disabled={lineItems.length <= 1}
                  className="shrink-0 rounded-md p-1.5 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors self-end sm:mb-0.5"
                  aria-label="Remove line item"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLineItem}
            className="mt-3 flex items-center gap-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            <Plus className="size-3.5" />
            Add line item
          </button>

          {/* Subtotal */}
          <div className="mt-4 pt-4 border-t border-[oklch(1_0_0_/_0.08)] flex justify-end">
            <div className="flex items-baseline gap-4">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                Subtotal
              </span>
              <span className="font-mono text-lg font-medium text-[var(--stage-text-primary)] tabular-nums">
                {formatCurrency(subtotal)}
              </span>
            </div>
          </div>
        </StagePanel>

        {/* ── Notes and terms ────────────────────────────────────── */}
        <StagePanel>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                Notes to client (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional details for the client"
                className="rounded-lg px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none resize-none"
                style={inputStyle}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                Payment terms (optional)
              </span>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={2}
                placeholder="Net 30, payment due within 30 days of invoice date"
                className="rounded-lg px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none resize-none"
                style={inputStyle}
              />
            </label>
          </div>
        </StagePanel>

        {/* ── Error ──────────────────────────────────────────────── */}
        {state.error && (
          <p className="text-sm text-[var(--color-unusonic-error)]">
            {state.error}
          </p>
        )}

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending}
            onClick={() => setSendAfterSave(false)}
          >
            {isPending && !sendAfterSave ? 'Saving...' : 'Save as draft'}
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            onClick={() => setSendAfterSave(true)}
          >
            {isPending && sendAfterSave ? 'Saving and sending...' : 'Save and send'}
          </Button>
        </div>
      </form>
    </div>
  );
}
