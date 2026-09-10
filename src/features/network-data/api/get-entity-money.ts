/**
 * getEntityMoney — what is owed between us and one entity.
 *
 * THE CANONICAL READER for money on an entity. Three surfaces used to answer
 * this and all three gave different numbers:
 *
 *   • the contact card summed unpaid invoices  (receivable, correct)
 *   • the panel's ledger summed EVERY non-void invoice against every recorded
 *     expense -- lifetime billed, not outstanding -- and then labelled the
 *     direction backwards
 *   • the page listed outstanding invoices and never mentioned the payable side
 *
 * So a card reading "Owes $2,400" could sit beside a panel reading "We owe them
 * $18,000", describing the same relationship, with neither number wrong on its
 * own terms and no way to tell that from looking.
 *
 * Direction is never netted and never signed. Two positive numbers with
 * second-person labels is what Xero, Business Central and Zoho Books all ship,
 * and QuickBooks' inability to hold both is why it tells people to create the
 * same counterparty twice under slightly different names.
 *
 * @module features/network-data/api/get-entity-money
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type EntityInvoice = {
  id: string;
  status: string | null;
  total_amount: number;
  due_date: string | null;
};

export type EntityMoney = {
  /** Invoices we issued to them that are not yet settled. */
  theyOweUs: number;
  /** Expenses recorded against them that we have not paid out. */
  weOweThem: number;
  /** Everything ever billed to them, settled or not. Not a debt. */
  lifetimeBilled: number;
  /** Everything ever recorded as payable to them. Not a debt. */
  lifetimeCost: number;
  /** Every non-void invoice, soonest due date first. */
  invoices: EntityInvoice[];
  /** Just the unsettled ones — the invoices that make up `theyOweUs`. */
  openInvoices: EntityInvoice[];
};

const EMPTY: EntityMoney = {
  theyOweUs: 0,
  weOweThem: 0,
  lifetimeBilled: 0,
  lifetimeCost: 0,
  invoices: [],
  openInvoices: [],
};

/** A void invoice is a retraction — it was never owed and never billed. */
const VOID_STATUSES = new Set(['void']);
/** Settled: still part of lifetime billed, no longer part of the debt. */
const SETTLED_STATUSES = new Set(['paid', 'void']);

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export async function getEntityMoney(entityId: string): Promise<EntityMoney> {
  if (!entityId) return EMPTY;

  const supabase = await createClient();

  const [invoicesResult, expensesResult] = await Promise.all([
    supabase.schema('finance').from('invoices')
      .select('id, status, total_amount, due_date')
      .eq('bill_to_entity_id', entityId)
      .order('due_date', { ascending: true }),
    supabase.schema('ops').from('event_expenses')
      .select('amount, paid_at')
      .eq('vendor_entity_id', entityId),
  ]);

  const invoices = ((invoicesResult.data ?? []) as EntityInvoice[])
    .filter((inv) => !VOID_STATUSES.has(inv.status ?? ''));

  const expenses = (expensesResult.data ?? []) as { amount: number | null; paid_at: string | null }[];

  const openInvoices = invoices.filter((inv) => !SETTLED_STATUSES.has(inv.status ?? ''));

  return {
    theyOweUs: sum(openInvoices.map((inv) => Number(inv.total_amount ?? 0))),
    // An expense with no paid_at is money we still owe them.
    weOweThem: sum(
      expenses.filter((e) => !e.paid_at).map((e) => Number(e.amount ?? 0)),
    ),
    lifetimeBilled: sum(invoices.map((inv) => Number(inv.total_amount ?? 0))),
    lifetimeCost: sum(expenses.map((e) => Number(e.amount ?? 0))),
    invoices,
    openInvoices,
  };
}
