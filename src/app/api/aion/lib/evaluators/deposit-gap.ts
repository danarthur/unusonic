/**
 * deposit_gap — deposits owed but not received.
 *
 * Reads from `finance.invoices` where `invoice_kind = 'deposit'`, status is
 * not paid/voided, and due_date has passed. This is the v2 replacement for
 * the old `proposals.deposit_paid_at` flag-based check — authoritative
 * because payment truth lives in `finance.payments` (via `invoice.paid_amount`).
 *
 * Gracefully empty when the finance layer is not populated for a workspace
 * — evaluator returns zero candidates rather than falling back to the
 * proposal flag (prevents duplicated signals when both layers exist).
 *
 * See sales-brief-v2-design.md §4 + §18 pass 1 resolution 3.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { daysSince, type InsightCandidate } from '../insight-evaluators';

type InvoiceRow = {
  id: string;
  deal_id: string | null;
  total_amount: number | string;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string;
  bill_to_entity_id: string | null;
};

type OrgRow = { id: string; display_name: string | null };

export async function evaluateDepositGap(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data } = await (system as unknown as {
    schema(s: string): {
      from(t: string): {
        select(cols: string): {
          eq(c: string, v: string): {
            eq(c: string, v: string): {
              not(c: string, op: string, v: string[]): {
                lt(c: string, v: string): Promise<{ data: InvoiceRow[] | null; error: unknown }>;
              };
            };
          };
        };
      };
    };
  })
    .schema('finance')
    .from('invoices')
    .select('id, deal_id, total_amount, paid_amount, due_date, status, bill_to_entity_id')
    .eq('workspace_id', workspaceId)
    .eq('invoice_kind', 'deposit')
    .not('status', 'in', ['paid', 'voided'])
    .lt('due_date', today);

  if (!data?.length) return [];

  // Narrow: only invoices where paid_amount < total_amount (guards against
  // partial-payment scenarios where `status` hasn't been updated yet).
  const rows = data.filter((r) => {
    const total = Number(r.total_amount ?? 0);
    const paid = Number(r.paid_amount ?? 0);
    return total > 0 && paid < total && r.due_date != null;
  });

  if (rows.length === 0) return [];

  // Batch-fetch client names for invoices that have a bill-to entity.
  const entityIds = [
    ...new Set(rows.map((r) => r.bill_to_entity_id).filter((x): x is string => Boolean(x))),
  ];
  let clientNames: Record<string, string> = {};
  if (entityIds.length > 0) {
    const { data: ents } = await system
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', entityIds);
    clientNames = Object.fromEntries(
      ((ents ?? []) as OrgRow[]).map((e) => [e.id, e.display_name ?? 'Unnamed client']),
    );
  }

  return rows.map((inv) => {
    const clientName = inv.bill_to_entity_id
      ? clientNames[inv.bill_to_entity_id] ?? null
      : null;
    const amountOwed = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
    const daysLate = daysSince(inv.due_date as string);

    // Priority: base 32, +2 per week late (cap at 48), +5 if amount > $5k.
    const priority = Math.min(
      48,
      32 + Math.floor(daysLate / 7) * 2 + (amountOwed > 5000 ? 5 : 0),
    );

    const urgency: InsightCandidate['urgency'] =
      daysLate >= 14 ? 'high' : daysLate >= 7 ? 'medium' : 'low';

    const amountStr = `$${Math.round(amountOwed).toLocaleString('en-US')}`;
    const dayStr = daysLate === 1 ? 'day' : 'days';
    const who = clientName ?? 'a client';
    const title = `${who} — deposit ${daysLate} ${dayStr} late · ${amountStr}`;

    return {
      triggerType: 'deposit_gap',
      entityType: 'invoice',
      entityId: inv.id,
      title,
      context: {
        invoiceId: inv.id,
        dealId: inv.deal_id,
        clientName,
        amountOwed,
        daysLate,
        dueDate: inv.due_date,
      },
      priority,
      suggestedAction: 'Nudge the client on the deposit',
      // Deep-link to the deal if we have one, otherwise the invoice page.
      href: inv.deal_id ? `/crm/deal/${inv.deal_id}` : `/finance/invoices/${inv.id}`,
      urgency,
    };
  });
}
