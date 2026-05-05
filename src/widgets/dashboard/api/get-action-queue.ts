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
 * Any overdue invoice (deposit or balance past due, any amount of overdue).
 */
async function fetchOverdueInvoiceItems(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<ActionItem[]> {
  const { data: proposals } = await supabase
    .from('proposals')
    .select(
      'id, deal_id, status, signed_at, accepted_at, deposit_percent, deposit_paid_at, deposit_deadline_days, payment_due_days',
    )
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'viewed', 'accepted']);

  if (!proposals?.length) return [];

  const dealIds = [
    ...new Set(proposals.map((p) => p.deal_id).filter(Boolean) as string[]),
  ];

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, proposed_date')
    .in('id', dealIds)
    .is('archived_at', null);

  type DealRow = { id: string; title: string | null; proposed_date: string | null };
  const dealMap = new Map<string, DealRow>(
    (deals ?? []).map((d) => [d.id, d as DealRow]),
  );

  // Workspace defaults
  const { data: ws } = await supabase
    .from('workspaces')
    .select(
      'default_deposit_deadline_days, default_balance_due_days_before_event',
    )
    .eq('id', workspaceId)
    .maybeSingle();

  const wsDepositDeadline =
    (ws as { default_deposit_deadline_days?: number } | null)
      ?.default_deposit_deadline_days ?? 7;
  const wsBalanceDueBefore =
    (ws as { default_balance_due_days_before_event?: number } | null)
      ?.default_balance_due_days_before_event ?? 14;

  const nowMs = now.getTime();
  const todayEndMs = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).getTime();

  const items: ActionItem[] = [];

  for (const p of proposals) {
    const deal = dealMap.get(p.deal_id);
    if (!deal) continue;

    const signDate = p.signed_at ?? p.accepted_at;
    const depositPercent = p.deposit_percent ?? 0;
    const deadlineDays = p.deposit_deadline_days ?? wsDepositDeadline;
    const balanceDueDaysBefore = p.payment_due_days ?? wsBalanceDueBefore;

    // Deposit overdue
    if (depositPercent > 0 && !p.deposit_paid_at && signDate) {
      const dueMs =
        new Date(signDate).getTime() + deadlineDays * 86_400_000;
      if (nowMs > dueMs) {
        const daysOverdue = Math.floor((nowMs - dueMs) / 86_400_000);
        items.push({
          id: `overdue-dep-${p.id}`,
          type: 'overdue_invoice',
          priority:
            daysOverdue >= 7
              ? 'overdue'
              : dueMs >= todayEndMs - 86_400_000
                ? 'today'
                : 'this_week',
          title: `Deposit ${daysOverdue}d overdue`,
          detail: deal.title ?? 'Untitled deal',
          actionUrl: `/events/deal/${p.deal_id}`,
          actionLabel: 'Send reminder',
        });
      }
    }

    // Balance overdue
    const depositOk = depositPercent === 0 || !!p.deposit_paid_at;
    if (depositOk && deal.proposed_date) {
      const eventDate = new Date(deal.proposed_date);
      const dueMs =
        eventDate.getTime() - balanceDueDaysBefore * 86_400_000;
      if (nowMs > dueMs) {
        const daysOverdue = Math.floor((nowMs - dueMs) / 86_400_000);
        items.push({
          id: `overdue-bal-${p.id}`,
          type: 'overdue_invoice',
          priority:
            daysOverdue >= 7
              ? 'overdue'
              : dueMs >= todayEndMs - 86_400_000
                ? 'today'
                : 'this_week',
          title: `Balance ${daysOverdue}d overdue`,
          detail: deal.title ?? 'Untitled deal',
          actionUrl: `/events/deal/${p.deal_id}`,
          actionLabel: 'Send reminder',
        });
      }
    }
  }

  return items;
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
