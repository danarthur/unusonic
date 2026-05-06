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
 * Overdue invoices: rows in `finance.invoices` past `due_date` by 30+ days
 * with an outstanding balance. Pre-invoice deal/proposal expectations
 * (deposits conceptually due, balance windows derived from event date) are
 * follow-ups, not AR — they don't belong in the urgency strip.
 */
async function fetchOverdueInvoiceAlerts(
  supabase: SupaClient,
  workspaceId: string,
  now: Date,
): Promise<UrgencyAlert[]> {
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

  const { data: invoiceRows, error } = await supabase
    .schema('finance')
    .from('invoices')
    .select(
      'id, invoice_kind, status, total_amount, paid_amount, due_date, deal_id, bill_to_snapshot',
    )
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'overdue', 'partial'])
    .not('due_date', 'is', null);

  if (error || !invoiceRows?.length) return [];

  // YYYY-MM-DD in UTC. `due_date` is a Postgres `date` — string compare works.
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const todayParts = today.split('-').map(Number);
  const todayMs = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);

  const aged = (invoiceRows as InvoiceRow[]).flatMap((inv) => {
    const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
    if (balance <= 0) return [];
    if (!inv.due_date || inv.due_date >= today) return [];
    const dueParts = inv.due_date.split('-').map(Number);
    const dueMs = Date.UTC(dueParts[0], dueParts[1] - 1, dueParts[2]);
    const daysOverdue = Math.floor((todayMs - dueMs) / 86_400_000);
    if (daysOverdue < 30) return [];
    return [{ inv, daysOverdue }];
  });

  if (aged.length === 0) return [];

  // Resolve deal titles (fallback to bill_to_snapshot.display_name).
  const dealIds = [
    ...new Set(aged.map(({ inv }) => inv.deal_id).filter(Boolean) as string[]),
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

  return aged.map(({ inv, daysOverdue }) => {
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
      title: `${kindLabel} ${daysOverdue}d overdue`,
      detail,
      actionUrl,
      severity: 'critical' as const,
    };
  });
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
      actionUrl: `/events/deal/${p.deal_id}`,
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
