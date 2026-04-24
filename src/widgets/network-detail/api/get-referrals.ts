/**
 * getReferralsForEntity — the reciprocity ledger for one person / company.
 *
 * Returns two directional lists:
 *   • received — leads this counterparty referred TO us
 *   • sent     — leads we referred TO this counterparty
 *
 * Plus aggregate counts surfaced on the PromotedMetricsRow. See
 * docs/reference/network-page-ia-redesign.md §10.3 — referrals are the
 * reciprocity metric User Advocate flagged as load-bearing for long-term
 * vendor / planner relationships.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type ReferralDirection = 'received' | 'sent';

export type Referral = {
  id: string;
  direction: ReferralDirection;
  clientName: string | null;
  clientEntity: { id: string; name: string | null } | null;
  relatedDeal: { id: string; title: string | null } | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type EntityReferrals = {
  received: Referral[];
  sent: Referral[];
  receivedCount: number;
  sentCount: number;
};

export type GetReferralsResult =
  | { ok: true; referrals: EntityReferrals }
  | { ok: false; error: string };

type RawRow = {
  id: string;
  direction: string;
  client_name: string | null;
  client_entity_id: string | null;
  related_deal_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

const EMPTY: EntityReferrals = {
  received: [],
  sent: [],
  receivedCount: 0,
  sentCount: 0,
};

export async function getReferralsForEntity(
  workspaceId: string,
  entityId: string,
): Promise<GetReferralsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('cortex')
    .from('referrals')
    .select(
      'id, direction, client_name, client_entity_id, related_deal_id, note, created_at, created_by',
    )
    .eq('workspace_id', workspaceId)
    .eq('counterparty_entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: (error as { message: string }).message };

  const rows: RawRow[] = (data ?? []) as RawRow[];
  if (rows.length === 0) return { ok: true, referrals: EMPTY };

  // Join: client entity names + deal titles + user display names.
  const clientEntityIds = Array.from(new Set(rows.map((r) => r.client_entity_id).filter((x): x is string => !!x)));
  const dealIds = Array.from(new Set(rows.map((r) => r.related_deal_id).filter((x): x is string => !!x)));
  const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)));

  const [clientEnts, deals, profiles] = await Promise.all([
    clientEntityIds.length > 0
      ? supabase.schema('directory').from('entities').select('id, display_name').in('id', clientEntityIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    dealIds.length > 0
      ? supabase.from('deals').select('id, title').in('id', dealIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const nameByEntityId = new Map<string, string | null>();
  for (const e of (clientEnts.data ?? []) as { id: string; display_name: string | null }[]) {
    nameByEntityId.set(e.id, e.display_name);
  }
  const titleByDealId = new Map<string, string | null>();
  for (const d of (deals.data ?? []) as { id: string; title: string | null }[]) {
    titleByDealId.set(d.id, d.title);
  }
  const nameByUserId = new Map<string, string | null>();
  for (const p of (profiles.data ?? []) as { id: string; full_name: string | null }[]) {
    nameByUserId.set(p.id, p.full_name);
  }

  const received: Referral[] = [];
  const sent: Referral[] = [];

  for (const r of rows) {
    const ref: Referral = {
      id: r.id,
      direction: r.direction as ReferralDirection,
      clientName: r.client_name,
      clientEntity: r.client_entity_id
        ? { id: r.client_entity_id, name: nameByEntityId.get(r.client_entity_id) ?? null }
        : null,
      relatedDeal: r.related_deal_id
        ? { id: r.related_deal_id, title: titleByDealId.get(r.related_deal_id) ?? null }
        : null,
      note: r.note,
      createdAt: r.created_at,
      createdByName: r.created_by ? (nameByUserId.get(r.created_by) ?? null) : null,
    };
    if (ref.direction === 'received') received.push(ref);
    else if (ref.direction === 'sent') sent.push(ref);
  }

  return {
    ok: true,
    referrals: {
      received,
      sent,
      receivedCount: received.length,
      sentCount: sent.length,
    },
  };
}
