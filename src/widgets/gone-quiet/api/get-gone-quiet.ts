'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type GoneQuietItem = {
  id: string;
  kind: 'stalled_deal' | 'dormant_client';
  name: string;
  lastContactDate: string | null;
  lastDealValue: number | null;
  dealId: string | null;
  entityId: string | null;
  href: string;
};

const CAP = 5;

async function fetchStalledDeals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<GoneQuietItem[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data } = await supabase
    .schema('ops')
    .from('follow_up_queue')
    .select('id, deal_id, reason, created_at, context_snapshot')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .is('superseded_at', null)
    .eq('reason_type', 'stall')
    .lt('created_at', fourteenDaysAgo)
    .order('priority_score', { ascending: false })
    .limit(CAP);

  if (!data?.length) return [];

  type Row = { id: string; deal_id: string; reason: string; created_at: string; context_snapshot: Record<string, unknown> | null };
  return (data as Row[]).map((r): GoneQuietItem => ({
    id: `stall-${r.id}`,
    kind: 'stalled_deal',
    name: String(r.context_snapshot?.client_name ?? r.context_snapshot?.deal_title ?? 'Unnamed'),
    lastContactDate: r.created_at,
    lastDealValue: null,
    dealId: r.deal_id,
    entityId: null,
    href: `/events/deal/${r.deal_id}`,
  }));
}

type OrgInfo = { value: number | null; wonAt: string | null };

function buildOrgMap(deals: { organization_id: string | null; budget_estimated: number | null; won_at: string | null }[]): Map<string, OrgInfo> {
  const map = new Map<string, OrgInfo>();
  for (const d of deals) {
    if (!d.organization_id || map.has(d.organization_id)) continue;
    map.set(d.organization_id, { value: d.budget_estimated, wonAt: d.won_at });
  }
  return map;
}

function buildDormantItems(orgMap: Map<string, OrgInfo>, nameMap: Map<string, string>): GoneQuietItem[] {
  const items: GoneQuietItem[] = [];
  for (const [orgId, info] of orgMap) {
    if (items.length >= CAP) break;
    const name = nameMap.get(orgId);
    if (!name) continue;
    items.push({
      id: `dormant-${orgId}`, kind: 'dormant_client', name,
      lastContactDate: info.wonAt, lastDealValue: info.value,
      dealId: null, entityId: orgId, href: `/network/entity/${orgId}`,
    });
  }
  return items;
}

async function fetchDormantClients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<GoneQuietItem[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { data: recentDeals } = await supabase
    .from('deals')
    .select('organization_id, budget_estimated, won_at')
    .eq('workspace_id', workspaceId).eq('status', 'won')
    .lt('won_at', ninetyDaysAgo)
    .order('won_at', { ascending: false }).limit(20);

  if (!recentDeals?.length) return [];
  type DealRow = { organization_id: string | null; budget_estimated: number | null; won_at: string | null };
  const orgMap = buildOrgMap(recentDeals as DealRow[]);
  if (orgMap.size === 0) return [];

  const orgIds = [...orgMap.keys()];
  const { data: entities } = await supabase.schema('directory')
    .from('entities').select('id, display_name').in('id', orgIds);

  const nameMap = new Map<string, string>();
  for (const e of (entities ?? []) as { id: string; display_name: string | null }[]) {
    if (e.display_name) nameMap.set(e.id, e.display_name);
  }
  return buildDormantItems(orgMap, nameMap);
}

export async function getGoneQuiet(): Promise<GoneQuietItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  try {
    const stalled = await fetchStalledDeals(supabase, workspaceId);
    const remaining = CAP - stalled.length;
    if (remaining <= 0) return stalled.slice(0, CAP);

    const dormant = await fetchDormantClients(supabase, workspaceId);
    return [...stalled, ...dormant].slice(0, CAP);
  } catch (err) {
    console.error('[GoneQuiet] fetch error:', err);
    Sentry.captureException(err, { tags: { module: 'gone-quiet' } });
    return [];
  }
}
