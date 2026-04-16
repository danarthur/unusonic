'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type UrgencyAlert = {
  id: string;
  type: 'crew_gap' | 'overdue_invoice' | 'expiring_proposal' | 'unconfirmed_crew';
  title: string;
  detail: string;
  actionUrl: string;
  severity: 'critical' | 'warning';
};

// =============================================================================
// Server Action
// =============================================================================

export async function getUrgencyAlerts(): Promise<UrgencyAlert[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const now = new Date();

  try {
    const [crewGapAlerts, overdueAlerts, expiringAlerts, unconfirmedAlerts] =
      await Promise.all([
        fetchCrewGapAlerts(supabase, workspaceId, now),
        fetchOverdueInvoiceAlerts(supabase, workspaceId, now),
        fetchExpiringProposalAlerts(supabase, workspaceId, now),
        fetchUnconfirmedCrewAlerts(supabase, workspaceId, now),
      ]);

    // Dedup by (type, detail). Data in the wild often has multiple active
    // proposals on the same deal (revisions, stale drafts), and each generates
    // its own alert — from the user's POV they read as a single "this deal
    // needs attention" item. Keep the first occurrence; the generator order
    // above surfaces the most urgent per type.
    const seen = new Set<string>();
    const merged = [
      ...crewGapAlerts,
      ...overdueAlerts,
      ...expiringAlerts,
      ...unconfirmedAlerts,
    ].filter((a) => {
      const key = `${a.type}::${a.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return merged;
  } catch (err) {
    console.error('[dashboard] getUrgencyAlerts unexpected error:', err);
    Sentry.captureException(err, { tags: { module: 'dashboard', action: 'getUrgencyAlerts' } });
    return [];
  }
}

// =============================================================================
// Query helpers
// =============================================================================

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Events in the next 48h that have fewer crew assigned than needed.
 * Since there's no explicit "crew_needed" column yet, we flag events with
 * zero crew assigned as a gap (any confirmed/production event should have crew).
 */
async function fetchCrewGapAlerts(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<UrgencyAlert[]> {
  const horizon = new Date(now.getTime() + 48 * 3_600_000);

  const { data: eventRows, error: evtErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, deal_id')
    .eq('workspace_id', workspaceId)
    .in('lifecycle_status', ['confirmed', 'production'])
    .gte('starts_at', now.toISOString())
    .lt('starts_at', horizon.toISOString());

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

  const crewCountMap = new Map<string, number>();
  if (dealIds.length > 0) {
    const { data: crewRows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('deal_id, entity_id')
      .in('deal_id', dealIds)
      .not('entity_id', 'is', null);

    for (const row of (crewRows ?? []) as { deal_id: string }[]) {
      crewCountMap.set(row.deal_id, (crewCountMap.get(row.deal_id) ?? 0) + 1);
    }
  }

  const alerts: UrgencyAlert[] = [];
  for (const evt of rows) {
    const crewFilled = evt.deal_id ? (crewCountMap.get(evt.deal_id) ?? 0) : 0;
    if (crewFilled === 0) {
      const eventDate = new Date(evt.starts_at);
      const hoursAway = Math.round(
        (eventDate.getTime() - now.getTime()) / 3_600_000,
      );
      alerts.push({
        id: `crew-gap-${evt.id}`,
        type: 'crew_gap',
        title: `No crew assigned`,
        detail: `${evt.title ?? 'Untitled event'} starts in ${hoursAway}h with no crew`,
        actionUrl: `/events/g/${evt.id}`,
        severity: 'critical',
      });
    }
  }

  return alerts;
}

/**
 * Overdue invoices: signed proposals where deposit or balance is 30+ days past due.
 * Reuses the calculation logic from get-payment-health.ts.
 */
async function fetchOverdueInvoiceAlerts(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<UrgencyAlert[]> {
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

  const dealMap = new Map(
    (deals ?? []).map((d) => [
      d.id,
      d as { id: string; title: string | null; proposed_date: string | null },
    ]),
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

  const THIRTY_DAYS_MS = 30 * 86_400_000;
  const alerts: UrgencyAlert[] = [];
  const nowMs = now.getTime();

  for (const p of proposals) {
    const deal = dealMap.get(p.deal_id);
    if (!deal) continue;

    const signDate = p.signed_at ?? p.accepted_at;
    const depositPercent = p.deposit_percent ?? 0;
    const deadlineDays = p.deposit_deadline_days ?? wsDepositDeadline;
    const balanceDueDaysBefore = p.payment_due_days ?? wsBalanceDueBefore;

    // Deposit overdue 30+ days
    if (depositPercent > 0 && !p.deposit_paid_at && signDate) {
      const dueDate = new Date(
        new Date(signDate).getTime() + deadlineDays * 86_400_000,
      );
      const daysOverdue = Math.floor(
        (nowMs - dueDate.getTime()) / 86_400_000,
      );
      if (daysOverdue >= 30) {
        alerts.push({
          id: `overdue-deposit-${p.id}`,
          type: 'overdue_invoice',
          title: `Deposit ${daysOverdue}d overdue`,
          detail: deal.title ?? 'Untitled deal',
          actionUrl: `/crm/deal/${p.deal_id}`,
          severity: 'critical',
        });
      }
    }

    // Balance overdue 30+ days
    const depositOk = depositPercent === 0 || !!p.deposit_paid_at;
    if (depositOk && deal.proposed_date) {
      const eventDate = new Date(deal.proposed_date);
      const dueDate = new Date(
        eventDate.getTime() - balanceDueDaysBefore * 86_400_000,
      );
      if (nowMs - dueDate.getTime() >= THIRTY_DAYS_MS) {
        const daysOverdue = Math.floor(
          (nowMs - dueDate.getTime()) / 86_400_000,
        );
        alerts.push({
          id: `overdue-balance-${p.id}`,
          type: 'overdue_invoice',
          title: `Balance ${daysOverdue}d overdue`,
          detail: deal.title ?? 'Untitled deal',
          actionUrl: `/crm/deal/${p.deal_id}`,
          severity: 'critical',
        });
      }
    }
  }

  return alerts;
}

/**
 * Proposals expiring within 48h: status = 'sent' with expires_at approaching.
 */
async function fetchExpiringProposalAlerts(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<UrgencyAlert[]> {
  const horizon = new Date(now.getTime() + 48 * 3_600_000);

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'sent')
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', horizon.toISOString());

  if (!proposals?.length) return [];

  const dealIds = [
    ...new Set(proposals.map((p) => p.deal_id).filter(Boolean) as string[]),
  ];

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .in('id', dealIds)
    .is('archived_at', null);

  const dealMap = new Map(
    (deals ?? []).map((d) => [d.id, d.title ?? 'Untitled deal']),
  );

  return proposals.map((p) => {
    const hoursLeft = Math.round(
      (new Date(p.expires_at!).getTime() - now.getTime()) / 3_600_000,
    );
    return {
      id: `expiring-${p.id}`,
      type: 'expiring_proposal' as const,
      title: `Proposal expires in ${hoursLeft}h`,
      detail: dealMap.get(p.deal_id) ?? 'Untitled deal',
      actionUrl: `/crm/deal/${p.deal_id}`,
      severity: hoursLeft <= 12 ? ('critical' as const) : ('warning' as const),
    };
  });
}

/**
 * Events in the next 72h with crew that hasn't confirmed.
 */
async function fetchUnconfirmedCrewAlerts(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<UrgencyAlert[]> {
  const horizon = new Date(now.getTime() + 72 * 3_600_000);

  const { data: eventRows, error: evtErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, deal_id')
    .eq('workspace_id', workspaceId)
    .in('lifecycle_status', ['confirmed', 'production'])
    .gte('starts_at', now.toISOString())
    .lt('starts_at', horizon.toISOString());

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

  // Crew with entity_id assigned but not confirmed
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

  // Map deal_id → event for display
  const dealToEvent = new Map<string, (typeof rows)[0]>();
  for (const evt of rows) {
    if (evt.deal_id) dealToEvent.set(evt.deal_id, evt);
  }

  const alerts: UrgencyAlert[] = [];
  for (const [dealId, count] of unconfirmedByDeal) {
    const evt = dealToEvent.get(dealId);
    if (!evt) continue;

    const hoursAway = Math.round(
      (new Date(evt.starts_at).getTime() - now.getTime()) / 3_600_000,
    );
    alerts.push({
      id: `unconfirmed-${evt.id}`,
      type: 'unconfirmed_crew',
      title: `${count} unconfirmed crew`,
      detail: `${evt.title ?? 'Untitled event'} in ${hoursAway}h`,
      actionUrl: `/events/g/${evt.id}`,
      severity: hoursAway <= 24 ? 'critical' : 'warning',
    });
  }

  return alerts;
}
