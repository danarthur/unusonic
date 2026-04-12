/**
 * Billing page client component — subscription invoices, payment method, audit trail.
 * @module app/(dashboard)/settings/billing/billing-page-client
 */

'use client';

import { useState } from 'react';

interface SubscriptionInvoice {
  stripe_invoice_id: string;
  amount_paid: number | null;
  currency: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
}

interface SubscriptionEvent {
  id: string;
  event_kind: string;
  from_state: Record<string, unknown> | null;
  to_state: Record<string, unknown> | null;
  created_at: string;
}

interface WorkspaceData {
  name: string;
  subscription_tier: string;
  billing_status: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  extra_seats: number;
  aion_actions_used: number;
}

interface Props {
  workspaceId: string;
  workspace: WorkspaceData | null;
  invoices: SubscriptionInvoice[];
  events: SubscriptionEvent[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtCurrency(cents: number | null, currency: string | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency ?? 'usd' }).format(cents);
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Subscription created',
  tier_changed: 'Plan changed',
  seats_changed: 'Seats updated',
  payment_failed: 'Payment failed',
  payment_succeeded: 'Payment succeeded',
  canceled: 'Subscription canceled',
  reactivated: 'Subscription reactivated',
  trial_started: 'Trial started',
  trial_ended: 'Trial ending soon',
};

export function BillingPageClient({ workspaceId, workspace, invoices, events }: Props) {
  const [portalLoading, setPortalLoading] = useState(false);

  async function openCustomerPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fallback: just reload
    } finally {
      setPortalLoading(false);
    }
  }

  const tier = workspace?.subscription_tier ?? 'foundation';
  const status = workspace?.billing_status ?? 'active';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium text-[var(--stage-text-primary)]">Billing</h1>
        <p className="text-sm text-[var(--stage-text-secondary)] mt-1">
          Manage your payment method, view past invoices, and review subscription history.
        </p>
      </div>

      {/* Status banner */}
      {status === 'past_due' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-200">
            Your payment is past due. Update your payment method to avoid losing access to premium features.
          </p>
        </div>
      )}
      {status === 'canceling' && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <p className="text-sm text-blue-200">
            Your subscription ends on {fmtDate(workspace?.current_period_end ?? null)}. You will revert to the Foundation plan.
          </p>
        </div>
      )}

      {/* Current plan summary */}
      <div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-surface)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--stage-text-tertiary)]">Current plan</p>
            <p className="text-lg font-medium text-[var(--stage-text-primary)] mt-1 capitalize">{tier}</p>
            {workspace?.current_period_end && (
              <p className="text-xs text-[var(--stage-text-secondary)] mt-1">
                Next invoice on {fmtDate(workspace.current_period_end)}
              </p>
            )}
          </div>
          <button
            onClick={openCustomerPortal}
            disabled={portalLoading || !workspace?.stripe_customer_id}
            className="rounded-md bg-[var(--stage-elevated)] px-4 py-2 text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-raised)] transition-colors disabled:opacity-50"
          >
            {portalLoading ? 'Opening...' : 'Manage payment method'}
          </button>
        </div>
      </div>

      {/* Past invoices */}
      <div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-surface)] p-5">
        <h2 className="text-xs uppercase tracking-widest text-[var(--stage-text-tertiary)] mb-4">Past invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--stage-text-secondary)]">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.stripe_invoice_id} className="flex items-center justify-between py-2 border-b border-[var(--stage-border)] last:border-0">
                <div>
                  <p className="text-sm text-[var(--stage-text-primary)]">
                    {fmtDate(inv.period_start)} — {fmtDate(inv.period_end)}
                  </p>
                  <p className="text-xs text-[var(--stage-text-tertiary)] capitalize">{inv.status}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[var(--stage-text-primary)]">
                    {fmtCurrency(inv.amount_paid, inv.currency)}
                  </span>
                  {inv.invoice_pdf_url && (
                    <a
                      href={inv.invoice_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                    >
                      PDF
                    </a>
                  )}
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription history */}
      <div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-surface)] p-5">
        <h2 className="text-xs uppercase tracking-widest text-[var(--stage-text-tertiary)] mb-4">Subscription history</h2>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--stage-text-secondary)]">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between py-2 border-b border-[var(--stage-border)] last:border-0">
                <p className="text-sm text-[var(--stage-text-primary)]">
                  {EVENT_LABELS[evt.event_kind] ?? evt.event_kind}
                </p>
                <p className="text-xs text-[var(--stage-text-tertiary)]">
                  {fmtDate(evt.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
