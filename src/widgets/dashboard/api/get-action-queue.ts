'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type ActionItem = {
  id: string;
  type:
    | 'follow_up'
    | 'unsigned_proposal'
    | 'overdue_invoice'
    | 'pending_crew'
    | 'logistics';
  priority: 'overdue' | 'today' | 'this_week';
  title: string;
  detail: string;
  actionUrl: string;
  actionLabel: string;
};

// =============================================================================
// Server Action
// =============================================================================

export async function getActionQueue(): Promise<ActionItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const now = new Date();

  try {
    const [followUps, unsignedProposals, overdueInvoices, pendingCrew] =
      await Promise.all([
        fetchFollowUpItems(supabase, workspaceId, now),
        fetchUnsignedProposalItems(supabase, workspaceId),
        fetchOverdueInvoiceItems(supabase, workspaceId, now),
        fetchPendingCrewItems(supabase, workspaceId, now),
      ]);

    const all = [
      ...followUps,
      ...unsignedProposals,
      ...overdueInvoices,
      ...pendingCrew,
    ];

    // Sort: overdue first, then today, then this_week. Within each group, by title asc.
    const priorityOrder: Record<string, number> = {
      overdue: 0,
      today: 1,
      this_week: 2,
    };
    all.sort(
      (a, b) =>
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
        a.title.localeCompare(b.title),
    );

    return all;
  } catch (err) {
    console.error('[dashboard] getActionQueue unexpected error:', err);
    Sentry.captureException(err, { tags: { module: 'dashboard', action: 'getActionQueue' } });
    return [];
  }
}

// =============================================================================
// Query helpers
// =============================================================================

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Follow-ups due within the next 7 days from ops.follow_up_queue.
 */
async function fetchFollowUpItems(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<ActionItem[]> {
  const db = supabase;
  const todayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  );

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_queue')
    .select('id, deal_id, reason, priority_score, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .is('superseded_at', null)
    .order('priority_score', { ascending: false })
    .limit(20);

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    deal_id: string;
    reason: string;
    priority_score: number;
    created_at: string;
  }[];

  // Resolve deal titles
  const dealIds = [...new Set(rows.map((r) => r.deal_id))];
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .in('id', dealIds)
    .is('archived_at', null);

  const dealMap = new Map<string, string>(
    (deals ?? []).map((d) => [d.id, d.title ?? 'Untitled deal']),
  );

  return rows.map((r) => {
    const createdAt = new Date(r.created_at);
    let priority: ActionItem['priority'];
    if (createdAt < now) {
      priority = 'overdue';
    } else if (createdAt < todayEnd) {
      priority = 'today';
    } else {
      priority = 'this_week';
    }

    return {
      id: `follow-up-${r.id}`,
      type: 'follow_up' as const,
      priority,
      title: r.reason,
      detail: dealMap.get(r.deal_id) ?? 'Untitled deal',
      actionUrl: `/events/deal/${r.deal_id}`,
      actionLabel: 'Follow up',
    };
  });
}

/**
 * Unsigned proposals (status = 'sent'), oldest first.
 */
async function fetchUnsignedProposalItems(
  supabase: SupaClient,
  workspaceId: string,
): Promise<ActionItem[]> {
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, created_at, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'sent')
    .order('created_at', { ascending: true })
    .limit(20);

  if (!proposals?.length) return [];

  const dealIds = [
    ...new Set(proposals.map((p) => p.deal_id).filter(Boolean) as string[]),
  ];

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .in('id', dealIds)
    .is('archived_at', null);

  const dealMap = new Map<string, string>(
    (deals ?? []).map((d) => [d.id, d.title ?? 'Untitled deal']),
  );

  const now = Date.now();

  return proposals.map((p) => {
    const daysSinceSent = Math.floor(
      (now - new Date(p.created_at).getTime()) / 86_400_000,
    );
    let priority: ActionItem['priority'];
    if (daysSinceSent >= 7) {
      priority = 'overdue';
    } else if (daysSinceSent >= 3) {
      priority = 'today';
    } else {
      priority = 'this_week';
    }

    return {
      id: `unsigned-${p.id}`,
      type: 'unsigned_proposal' as const,
      priority,
      title: `Proposal awaiting signature (${daysSinceSent}d)`,
      detail: dealMap.get(p.deal_id) ?? 'Untitled deal',
      actionUrl: `/events/deal/${p.deal_id}`,
      actionLabel: 'View proposal',
    };
  });
}

/**
 * Overdue invoices: rows in `finance.invoices` that are actually past their
 * `due_date` with an outstanding balance. Pre-invoice deal/proposal expectations
 * (deposits conceptually due, balance windows derived from event date) are
 * sales follow-ups, not AR — they're surfaced via `fetchFollowUpItems`, not here.
 */
async function fetchOverdueInvoiceItems(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<ActionItem[]> {
  type InvoiceRow = {
    id: string;
    invoice_kind: string | null;
    status: string;
    total_amount: number | string;
    paid_amount: number | string;
    due_date: string;
    deal_id: string | null;
    bill_to_snapshot: { display_name?: string | null } | null;
  };

  const { data: invoiceRows, error: invErr } = await supabase
    .schema('finance')
    .from('invoices')
    .select(
      'id, invoice_kind, status, total_amount, paid_amount, due_date, deal_id, bill_to_snapshot',
    )
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'overdue', 'partial'])
    .not('due_date', 'is', null);

  if (invErr || !invoiceRows?.length) return [];

  // Today as YYYY-MM-DD (UTC). Compared lexicographically against `due_date`
  // which is a Postgres `date` (YYYY-MM-DD). The `finance.invoice_balances`
  // view computes `days_overdue` against `CURRENT_DATE` in DB session TZ; we
  // stay consistent with that — rounding to a workspace TZ here would
  // duplicate logic and drift from the view.
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const overdueInvoices = (invoiceRows as InvoiceRow[]).filter((inv) => {
    const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
    return balance > 0 && inv.due_date < today;
  });

  if (overdueInvoices.length === 0) return [];

  // Resolve deal titles for display (fall back to bill_to_snapshot.display_name).
  const dealIds = [
    ...new Set(overdueInvoices.map((i) => i.deal_id).filter(Boolean) as string[]),
  ];
  const dealTitleMap = new Map<string, string>();
  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title')
      .in('id', dealIds)
      .is('archived_at', null);
    for (const d of (deals ?? []) as { id: string; title: string | null }[]) {
      if (d.title) dealTitleMap.set(d.id, d.title);
    }
  }

  return overdueInvoices.map((inv) => {
    // Days overdue computed from YYYY-MM-DD strings — matches the view's
    // CURRENT_DATE - due_date semantics.
    const dueParts = inv.due_date.split('-').map(Number);
    const dueMs = Date.UTC(dueParts[0], dueParts[1] - 1, dueParts[2]);
    const todayParts = today.split('-').map(Number);
    const todayMs = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
    const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000));

    const titleFromDeal = inv.deal_id ? dealTitleMap.get(inv.deal_id) : undefined;
    const titleFromSnapshot = inv.bill_to_snapshot?.display_name ?? null;
    const detail = titleFromDeal ?? titleFromSnapshot ?? 'Untitled invoice';

    const kindLabel = inv.invoice_kind === 'deposit' ? 'Deposit' : 'Balance';
    const actionUrl = inv.deal_id
      ? `/events/deal/${inv.deal_id}`
      : `/finance/invoices/${inv.id}`;

    return {
      id: `overdue-inv-${inv.id}`,
      type: 'overdue_invoice' as const,
      // Anything actually past due_date is "overdue" priority. Anything not
      // past due_date didn't make it into this list.
      priority: 'overdue' as const,
      title: `${kindLabel} ${daysOverdue}d overdue`,
      detail,
      actionUrl,
      actionLabel: 'Send reminder',
    };
  });
}

/**
 * Crew assigned but not confirmed for upcoming events.
 */
async function fetchPendingCrewItems(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<ActionItem[]> {
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const todayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  );

  const { data: eventRows, error: evtErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, deal_id')
    .eq('workspace_id', workspaceId)
    .in('lifecycle_status', ['confirmed', 'production'])
    .gte('starts_at', now.toISOString())
    .lt('starts_at', weekAhead.toISOString());

  if (evtErr || !eventRows?.length) return [];

  const rows = eventRows as {
    id: string;
    title: string | null;
    starts_at: string;
    deal_id: string | null;
  }[];

  const dealIds = [
    ...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[]),
  ];
  if (dealIds.length === 0) return [];

  const { data: crewRows } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('deal_id, entity_id, confirmed_at')
    .in('deal_id', dealIds)
    .not('entity_id', 'is', null)
    .is('confirmed_at', null);

  if (!crewRows?.length) return [];

  // Group unconfirmed count by deal_id
  const unconfirmedByDeal = new Map<string, number>();
  for (const row of crewRows as { deal_id: string }[]) {
    unconfirmedByDeal.set(
      row.deal_id,
      (unconfirmedByDeal.get(row.deal_id) ?? 0) + 1,
    );
  }

  const dealToEvent = new Map<string, (typeof rows)[0]>();
  for (const evt of rows) {
    if (evt.deal_id) dealToEvent.set(evt.deal_id, evt);
  }

  const items: ActionItem[] = [];
  for (const [dealId, count] of unconfirmedByDeal) {
    const evt = dealToEvent.get(dealId);
    if (!evt) continue;

    const startsMs = new Date(evt.starts_at).getTime();
    let priority: ActionItem['priority'];
    if (startsMs < todayEnd.getTime()) {
      priority = 'overdue';
    } else if (startsMs < todayEnd.getTime() + 86_400_000) {
      priority = 'today';
    } else {
      priority = 'this_week';
    }

    items.push({
      id: `pending-crew-${evt.id}`,
      type: 'pending_crew',
      priority,
      title: `${count} crew unconfirmed`,
      detail: evt.title ?? 'Untitled event',
      actionUrl: `/events/g/${evt.id}`,
      actionLabel: 'Send reminder',
    });
  }

  return items;
}
