/**
 * Public Invoice Page — `/i/[token]`
 *
 * The page clients see when they click the pay link in their email.
 * Light theme, clean document aesthetic, mobile responsive.
 * No auth required — reads via the anon-accessible get_public_invoice RPC.
 *
 * @module app/i/[token]/page
 */

import 'server-only';

import type { Metadata } from 'next';
import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import { PayNowButton } from './PayNowButton';

// ---------------------------------------------------------------------------
// Types for the RPC response
// ---------------------------------------------------------------------------

interface LineItem {
  position: number;
  item_kind: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface AddressSnapshot {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface BillToSnapshot {
  v: number;
  display_name: string;
  entity_type?: string;
  email?: string | null;
  phone?: string | null;
  address?: AddressSnapshot | null;
  contact_name?: string | null;
}

interface FromSnapshot {
  v: number;
  workspace_name: string;
  logo_url?: string | null;
  address?: AddressSnapshot | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface PublicInvoiceData {
  invoice_id: string;
  invoice_number: string;
  invoice_kind: string;
  status: string;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  issue_date: string;
  due_date: string;
  issued_at: string;
  notes_to_client: string | null;
  po_number: string | null;
  terms: string | null;
  bill_to_snapshot: BillToSnapshot;
  from_snapshot: FromSnapshot;
  line_items: LineItem[];
  workspace_id: string;
  accept_online_payments: boolean;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchInvoice(token);

  if (!data) {
    return { title: 'Invoice | Unusonic' };
  }

  return {
    title: `Invoice ${data.invoice_number} | ${data.from_snapshot.workspace_name}`,
    robots: { index: false, follow: false },
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchInvoice(token: string): Promise<PublicInvoiceData | null> {
  const system = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
  const { data, error } = await (system as any)
    .schema('finance')
    .rpc('get_public_invoice', { p_token: token });

  if (error) {
    // Previously swallowed silently — a 404 hid RPC permission drift, schema
    // drift, or connectivity failures. Route to Sentry with structured context
    // so we can tell "invalid token" apart from "service broken".
    Sentry.captureMessage('public-invoice: get_public_invoice RPC failed', {
      level: 'warning',
      extra: {
        tokenPresent: !!token,
        tokenLength: token?.length ?? 0,
        code: error.code,
        message: error.message,
      },
      tags: { area: 'public-invoice', rpc: 'get_public_invoice' },
    });
    return null;
  }

  if (!data) return null;

  // RPC returns a single row or an array with one element
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatAddress(addr: AddressSnapshot | null | undefined): string | null {
  if (!addr) return null;
  const parts = [
    addr.street,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

function StatusChip({ status, dueDate, paidAmount, totalAmount }: {
  status: string;
  dueDate: string;
  paidAmount: number;
  totalAmount: number;
}) {
  if (status === 'paid' || paidAmount >= totalAmount) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Paid
      </span>
    );
  }

  if (paidAmount > 0 && paidAmount < totalAmount) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Partially paid
      </span>
    );
  }

  if (status === 'void') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500">
        Void
      </span>
    );
  }

  // Default: show due date
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
      Due {formatDate(dueDate)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await fetchInvoice(token);

  if (!invoice) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-lg font-medium text-gray-900">
            This invoice isn&rsquo;t available
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            The link may have expired or the invoice may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const {
    invoice_number,
    status,
    currency,
    subtotal_amount,
    discount_amount,
    tax_amount,
    total_amount,
    paid_amount,
    issue_date,
    due_date,
    notes_to_client,
    po_number,
    terms,
    bill_to_snapshot: billTo,
    from_snapshot: from,
    line_items: lineItems,
  } = invoice;

  const balanceDue = total_amount - paid_amount;
  const isPaid = status === 'paid' || balanceDue <= 0;
  const billToAddress = formatAddress(billTo.address);
  const fromAddress = formatAddress(from.address);
  const showQtyColumn = lineItems.some((li) => li.quantity > 1);

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* ── Main card ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {from.workspace_name}
                </h1>
                {fromAddress && (
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-500">
                    {fromAddress}
                  </p>
                )}
                {from.phone && (
                  <p className="mt-0.5 text-sm text-gray-500">{from.phone}</p>
                )}
                {from.email && (
                  <p className="mt-0.5 text-sm text-gray-500">{from.email}</p>
                )}
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-400">
                  Invoice
                </p>
                <p className="mt-0.5 text-lg font-semibold text-gray-900">
                  {invoice_number}
                </p>
              </div>
            </div>
          </div>

          {/* ── Meta row ────────────────────────────────────────── */}
          <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {/* Bill to */}
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Bill to
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {billTo.display_name}
                </p>
                {billTo.contact_name && billTo.contact_name !== billTo.display_name && (
                  <p className="text-sm text-gray-500">{billTo.contact_name}</p>
                )}
                {billToAddress && (
                  <p className="mt-0.5 whitespace-pre-line text-sm text-gray-500">
                    {billToAddress}
                  </p>
                )}
              </div>

              {/* Issue date */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Issued
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(issue_date)}
                </p>
              </div>

              {/* Due date */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Due
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(due_date)}
                </p>
              </div>

              {/* PO number */}
              {po_number && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    PO number
                  </p>
                  <p className="mt-1 text-sm text-gray-900">{po_number}</p>
                </div>
              )}
            </div>

            {/* Status chip */}
            <div className="mt-4">
              <StatusChip
                status={status}
                dueDate={due_date}
                paidAmount={paid_amount}
                totalAmount={total_amount}
              />
            </div>
          </div>

          {/* ── Line items ──────────────────────────────────────── */}
          <div className="px-6 py-5 sm:px-8">
            <div className="overflow-x-auto -mx-6 px-6 sm:-mx-8 sm:px-8">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 pr-4 font-medium text-gray-400 text-xs uppercase tracking-wide">
                      Description
                    </th>
                    {showQtyColumn && (
                      <>
                        <th className="pb-3 pr-4 text-right font-medium text-gray-400 text-xs uppercase tracking-wide whitespace-nowrap">
                          Qty
                        </th>
                        <th className="pb-3 pr-4 text-right font-medium text-gray-400 text-xs uppercase tracking-wide whitespace-nowrap">
                          Rate
                        </th>
                      </>
                    )}
                    <th className="pb-3 text-right font-medium text-gray-400 text-xs uppercase tracking-wide whitespace-nowrap">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems
                    .sort((a, b) => a.position - b.position)
                    .map((li, idx) => (
                      <tr
                        key={`${li.position}-${idx}`}
                        className="border-b border-gray-50 last:border-b-0"
                      >
                        <td className="py-3 pr-4 text-gray-900">
                          {li.description}
                        </td>
                        {showQtyColumn && (
                          <>
                            <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                              {li.quantity}
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                              {formatCurrency(li.unit_price, currency)}
                            </td>
                          </>
                        )}
                        <td className="py-3 text-right tabular-nums font-medium text-gray-900">
                          {formatCurrency(li.amount, currency)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Totals ──────────────────────────────────────────── */}
          <div className="border-t border-gray-100 px-6 py-5 sm:px-8">
            <div className="flex flex-col items-end gap-2">
              <div className="flex w-full max-w-xs justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums text-gray-900">
                  {formatCurrency(subtotal_amount, currency)}
                </span>
              </div>

              {discount_amount > 0 && (
                <div className="flex w-full max-w-xs justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="tabular-nums text-gray-900">
                    &minus;{formatCurrency(discount_amount, currency)}
                  </span>
                </div>
              )}

              {tax_amount > 0 && (
                <div className="flex w-full max-w-xs justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="tabular-nums text-gray-900">
                    {formatCurrency(tax_amount, currency)}
                  </span>
                </div>
              )}

              {paid_amount > 0 && !isPaid && (
                <div className="flex w-full max-w-xs justify-between text-sm">
                  <span className="text-gray-500">Paid</span>
                  <span className="tabular-nums text-gray-900">
                    &minus;{formatCurrency(paid_amount, currency)}
                  </span>
                </div>
              )}

              <div className="mt-1 flex w-full max-w-xs justify-between border-t border-gray-200 pt-3">
                <span className="text-base font-semibold text-gray-900">
                  {isPaid ? 'Total' : 'Amount due'}
                </span>
                <span className="text-xl font-semibold tabular-nums text-gray-900">
                  {formatCurrency(isPaid ? total_amount : balanceDue, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Pay now (Stripe Checkout) ─────────────────────── */}
          {!isPaid && (
            <div className="border-t border-gray-100 px-6 py-5 sm:px-8">
              <PayNowButton
                token={token}
                acceptOnlinePayments={invoice.accept_online_payments}
              />
            </div>
          )}

          {/* ── Notes ───────────────────────────────────────────── */}
          {notes_to_client && (
            <div className="border-t border-gray-100 px-6 py-5 sm:px-8">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                Notes
              </p>
              <p className="whitespace-pre-line text-sm text-gray-600">
                {notes_to_client}
              </p>
            </div>
          )}

          {/* ── Terms ───────────────────────────────────────────── */}
          {terms && (
            <div className="border-t border-gray-100 px-6 py-5 sm:px-8">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                Terms
              </p>
              <p className="whitespace-pre-line text-sm text-gray-600">
                {terms}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer attribution ──────────────────────────────── */}
        <p className="mt-8 text-center text-xs text-gray-400">
          Powered by Unusonic
        </p>
      </div>
    </div>
  );
}
