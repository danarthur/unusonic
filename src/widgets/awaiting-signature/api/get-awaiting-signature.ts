'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { daysSince } from '@/shared/lib/days-since';

export type AwaitingItem = {
  id: string;
  kind: 'unsigned' | 'deposit_overdue';
  dealId: string;
  dealTitle: string;
  clientName: string | null;
  amount: number | null;
  daysWaiting: number;
  dealHref: string;
};

export type AwaitingSignatureData = {
  unsigned: AwaitingItem[];
  depositOverdue: AwaitingItem[];
};

type DealRow = { id: string; title: string | null };

function buildDealMap(deals: DealRow[]): Map<string, string> {
  return new Map(deals.map((d) => [d.id, d.title ?? 'Untitled deal']));
}

async function fetchUnsigned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<AwaitingItem[]> {
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, accepted_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'accepted')
    .is('signed_at', null)
    .order('accepted_at', { ascending: true })
    .limit(10);

  if (!proposals?.length) return [];
  type Row = { id: string; deal_id: string; accepted_at: string | null };
  const rows = proposals as Row[];

  const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])];
  const { data: deals } = await supabase.from('deals').select('id, title').in('id', dealIds).is('archived_at', null);
  const dealMap = buildDealMap((deals ?? []) as DealRow[]);

  return rows.map((r): AwaitingItem => ({
    id: `unsigned-${r.id}`,
    kind: 'unsigned',
    dealId: r.deal_id,
    dealTitle: dealMap.get(r.deal_id) ?? 'Untitled deal',
    clientName: null,
    amount: null,
    daysWaiting: r.accepted_at ? (daysSince(r.accepted_at) ?? 0) : 0,
    dealHref: `/productions/deal/${r.deal_id}`,
  }));
}

async function fetchDepositOverdue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<AwaitingItem[]> {
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, signed_at, accepted_at, deposit_percent, deposit_paid_at, deposit_deadline_days')
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'viewed', 'accepted'])
    .gt('deposit_percent', 0)
    .is('deposit_paid_at', null)
    .limit(10);

  if (!proposals?.length) return [];

  type Row = {
    id: string; deal_id: string; signed_at: string | null;
    accepted_at: string | null; deposit_deadline_days: number | null;
  };
  const rows = proposals as Row[];
  const now = Date.now();

  const { data: ws } = await supabase
    .from('workspaces')
    .select('default_deposit_deadline_days')
    .eq('id', workspaceId)
    .maybeSingle();
  const wsDefault = (ws as { default_deposit_deadline_days?: number } | null)?.default_deposit_deadline_days ?? 7;

  const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])];
  const { data: deals } = await supabase.from('deals').select('id, title').in('id', dealIds).is('archived_at', null);
  const dealMap = buildDealMap((deals ?? []) as DealRow[]);

  const items: AwaitingItem[] = [];
  for (const r of rows) {
    const signDate = r.signed_at ?? r.accepted_at;
    if (!signDate) continue;
    const deadline = r.deposit_deadline_days ?? wsDefault;
    const dueMs = new Date(signDate).getTime() + deadline * 86_400_000;
    if (now <= dueMs) continue;
    items.push({
      id: `deposit-${r.id}`,
      kind: 'deposit_overdue',
      dealId: r.deal_id,
      dealTitle: dealMap.get(r.deal_id) ?? 'Untitled deal',
      clientName: null,
      amount: null,
      daysWaiting: Math.floor((now - dueMs) / 86_400_000),
      dealHref: `/productions/deal/${r.deal_id}`,
    });
  }
  return items;
}

export async function getAwaitingSignature(): Promise<AwaitingSignatureData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { unsigned: [], depositOverdue: [] };

  const supabase = await createClient();

  try {
    const [unsigned, depositOverdue] = await Promise.all([
      fetchUnsigned(supabase, workspaceId),
      fetchDepositOverdue(supabase, workspaceId),
    ]);
    return { unsigned, depositOverdue };
  } catch (err) {
    console.error('[AwaitingSignature] fetch error:', err);
    Sentry.captureException(err, { tags: { module: 'awaiting-signature' } });
    return { unsigned: [], depositOverdue: [] };
  }
}
