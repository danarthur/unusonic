'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActivityItem = {
  id: string;
  type:
    | 'deal_created'
    | 'proposal_sent'
    | 'proposal_signed'
    | 'crew_confirmed'
    | 'invoice_paid'
    | 'event_completed';
  title: string;
  timestamp: string;
  linkUrl: string;
};

const EMPTY: ActivityItem[] = [];

// ── Action ─────────────────────────────────────────────────────────────────

export async function getActivityFeed(): Promise<ActivityItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();

  // Fire all queries in parallel
  const [dealsRes, proposalsSentRes, proposalsSignedRes, crewRes] = await Promise.all([
    // Recent deals created
    supabase
      .from('deals')
      .select('id, title, created_at')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(10),

    // Recent proposals sent
    supabase
      .from('proposals')
      .select('id, deal_id, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'sent')
      .order('updated_at', { ascending: false })
      .limit(10),

    // Recent proposals signed/accepted
    supabase
      .from('proposals')
      .select('id, deal_id, signed_at, accepted_at, updated_at')
      .eq('workspace_id', workspaceId)
      .in('status', ['accepted'])
      .order('updated_at', { ascending: false })
      .limit(10),

    // Recent crew confirmations (ops schema, not in generated types)
    // deal_crew has no `status` column — confirmed crew have confirmed_at IS NOT NULL.
    // deal_crew has no `updated_at` — use confirmed_at as the activity timestamp.
    supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, entity_id, confirmed_at')
      .eq('workspace_id', workspaceId)
      .not('confirmed_at', 'is', null)
      .order('confirmed_at', { ascending: false })
      .limit(10),
  ]);

  const activities: ActivityItem[] = [];

  // Collect deal IDs referenced by proposals/crew for title resolution
  const dealIdSet = new Set<string>();
  for (const p of proposalsSentRes.data ?? []) dealIdSet.add(p.deal_id);
  for (const p of proposalsSignedRes.data ?? []) dealIdSet.add(p.deal_id);
  for (const c of (crewRes.data ?? []) as { deal_id: string }[]) {
    if (c.deal_id) dealIdSet.add(c.deal_id);
  }

  // Resolve deal titles in one batch
  let dealTitleMap = new Map<string, string>();
  const dealIdsToResolve = [...dealIdSet];
  if (dealIdsToResolve.length > 0) {
    const { data: dealRows } = await supabase
      .from('deals')
      .select('id, title')
      .in('id', dealIdsToResolve);
    dealTitleMap = new Map(
      (dealRows ?? []).map((d) => [d.id, (d.title as string) ?? 'Untitled deal']),
    );
  }

  // ── Deal created ─────────────────────────────────────────────────────
  for (const d of dealsRes.data ?? []) {
    activities.push({
      id: `deal-${d.id}`,
      type: 'deal_created',
      title: (d.title as string) ?? 'Untitled deal',
      timestamp: d.created_at,
      linkUrl: `/crm/deal/${d.id}`,
    });
  }

  // ── Proposal sent ────────────────────────────────────────────────────
  for (const p of proposalsSentRes.data ?? []) {
    const dealTitle = dealTitleMap.get(p.deal_id) ?? 'Untitled deal';
    activities.push({
      id: `prop-sent-${p.id}`,
      type: 'proposal_sent',
      title: `Proposal sent for ${dealTitle}`,
      timestamp: p.updated_at,
      linkUrl: `/crm/deal/${p.deal_id}`,
    });
  }

  // ── Proposal signed ──────────────────────────────────────────────────
  for (const p of proposalsSignedRes.data ?? []) {
    const dealTitle = dealTitleMap.get(p.deal_id) ?? 'Untitled deal';
    activities.push({
      id: `prop-signed-${p.id}`,
      type: 'proposal_signed',
      title: `Proposal signed for ${dealTitle}`,
      timestamp: p.signed_at ?? p.accepted_at ?? p.updated_at,
      linkUrl: `/crm/deal/${p.deal_id}`,
    });
  }

  // ── Crew confirmed ───────────────────────────────────────────────────
  // TODO(Pass 3 Phase 1 follow-up): this feed reads deal_crew.confirmed_at
  // directly, so portal-confirmed crew (which respondToCrewAssignment
  // mirrors into deal_crew via the Phase 1 trigger) will appear here, but
  // any direct writes to crew_assignments that bypass the mirror would be
  // invisible. The overlay in getDealCrew is the canonical per-deal path;
  // this feed is cross-workspace aggregation and needs a resolver variant
  // that queries both tables and merges by timestamp.
  type CrewRow = { id: string; deal_id: string; entity_id: string; confirmed_at: string };
  for (const c of (crewRes.data ?? []) as CrewRow[]) {
    const dealTitle = dealTitleMap.get(c.deal_id) ?? 'Untitled deal';
    activities.push({
      id: `crew-${c.id}`,
      type: 'crew_confirmed',
      title: `Crew confirmed for ${dealTitle}`,
      timestamp: c.confirmed_at,
      linkUrl: `/crm/deal/${c.deal_id}`,
    });
  }

  // Sort all by timestamp descending and take top 20
  activities.sort((a, b) => {
    const ta = a.timestamp ?? '';
    const tb = b.timestamp ?? '';
    return tb.localeCompare(ta);
  });

  return activities.slice(0, 20);
}
