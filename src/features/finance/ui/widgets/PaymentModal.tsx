/**
 * Payment Modal — Record a manual payment (check, wire, cash, ACH)
 *
 * Dashboard dark theme. Portaled backdrop per CLAUDE.md section 10.
 * Uses useActionState (React 19) for form submission.
 *
 * @module features/finance/ui/widgets/PaymentModal
 */

'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { recordManualPayment } from '../../api/invoice-actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentModalProps {
  invoiceId: string;
  balanceDue: number;
  eventId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type PaymentMethodOption = {
  value: string;
  label: string;
  referenceLabel: string;
};

const METHODS: PaymentMethodOption[] = [
  { value: 'check', label: 'Check', referenceLabel: 'Check number' },
  { value: 'wire', label: 'Wire', referenceLabel: 'Wire reference' },
  { value: 'cash', label: 'Cash', referenceLabel: 'Receipt number' },
  { value: 'stripe_ach', label: 'ACH', referenceLabel: 'ACH reference' },
  { value: 'other', label: 'Other', referenceLabel: 'Reference' },
];

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  error: string | null;
  success: boolean;
}

const initialState: FormState = { error: null, success: false };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentModal({
  invoiceId,
  balanceDue,
  eventId,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [method, setMethod] = useState(METHODS[0]);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [receivedAt, setReceivedAt] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Focus trap: focus the dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Server action via useActionState
  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState, _formData: FormData): Promise<FormState> => {
      const rawAmount = parseFloat(amount);
      if (isNaN(rawAmount) || rawAmount <= 0) {
        return { error: 'Enter a valid amount', success: false };
      }
      // Reject more than two decimal places before rounding so an obvious typo
      // ($0.015) raises an error instead of silently snapping to $0.02 and
      // recording a payment the user didn't intend.
      if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
        return { error: 'Amount must have at most two decimal places', success: false };
      }
      const parsedAmount = Math.round(rawAmount * 100) / 100;

      const result = await recordManualPayment(
        {
          invoiceId,
          amount: parsedAmount,
          method: method.value as 'check' | 'wire' | 'cash' | 'stripe_ach' | 'other',
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
          reference: reference || null,
          notes: notes || null,
        },
        eventId,
      );

      if (result.error) {
        return { error: result.error, success: false };
      }

      return { error: null, success: true };
    },
    initialState,
  );

  // On success, call onSuccess and close
  const hasNotified = useRef(false);
  useEffect(() => {
    if (state.success && !hasNotified.current) {
      hasNotified.current = true;
      onSuccess();
      onClose();
    }
  }, [state.success, onSuccess, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);

  // Portaled to document.body per CLAUDE.md section 10
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0.06 0 0 / 0.75)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Record payment"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="stage-panel w-full max-w-md rounded-xl outline-none"
        style={{ padding: 'var(--stage-padding, 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium text-[var(--stage-text-primary)]">
            Record payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--stage-text-secondary)] transition-colors hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Balance context */}
        <p className="text-xs text-[var(--stage-text-secondary)] mb-4">
          Balance due: {formatCurrency(balanceDue)}
        </p>

        {/* Form */}
        <form action={formAction} className="flex flex-col gap-4">
          {/* Amount */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
              Amount
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 rounded-lg px-3 text-sm tabular-nums text-[var(--stage-text-primary)] outline-none transition-colors"
              style={{
                backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
              }}
            />
          </label>

          {/* Method */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
              Method
            </span>
            <select
              value={method.value}
              onChange={(e) => {
                const found = METHODS.find((m) => m.value === e.target.value);
                if (found) setMethod(found);
              }}
              className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] outline-none transition-colors appearance-none"
              style={{
                backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
              }}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {/* Received date */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
              Received date
            </span>
            <input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] outline-none transition-colors"
              style={{
                backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
              }}
            />
          </label>

          {/* Reference */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
              {method.referenceLabel}
            </span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="h-9 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none transition-colors"
              style={{
                backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
              }}
            />
          </label>

          {/* Notes */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="rounded-lg px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none transition-colors resize-none"
              style={{
                backgroundColor: 'var(--ctx-well, var(--stage-surface-nested))',
              }}
            />
          </label>

          {/* Error */}
          {state.error && (
            <p className="text-xs text-[var(--color-unusonic-error)]">
              {state.error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Recording...' : 'Record payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
