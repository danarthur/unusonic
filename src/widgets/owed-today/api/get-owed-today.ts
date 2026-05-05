'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

export type OwedTodayItem = {
  queueItemId: string;
  dealId: string;
  dealTitle: string;
  clientName: string | null;
  dealValue: number | null;
  reasonType: string;
  reasonString: string;
  suggestedChannel: 'call' | 'sms' | 'email' | 'manual' | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  snoozeCount: number;
  isSnoozed: boolean;
  snoozedUntil: string | null;
  dealHref: string;
};

type QueueRow = {
  id: string;
  deal_id: string;
  reason: string;
  reason_type: string;
  priority_score: number;
  suggested_channel: string | null;
  status: string;
  snoozed_until: string | null;
};

type DealRow = {
  id: string;
  title: string | null;
  budget_estimated: number | null;
  organization_id: string | null;
  main_contact_id: string | null;
};

type EntityRow = {
  id: string;
  display_name: string | null;
  type: string;
  attributes: unknown;
};

function resolveEntity(id: string | null | undefined, map: Map<string, EntityRow>): EntityRow | undefined {
  return id ? map.get(id) : undefined;
}

function extractContact(entity: EntityRow | undefined): { phone: string | null; email: string | null } {
  if (entity?.type !== 'person') return { phone: null, email: null };
  const attrs = readEntityAttrs(entity.attributes, 'person');
  return { phone: attrs.phone ?? null, email: attrs.email ?? null };
}

function mapRow(
  r: QueueRow,
  dealMap: Map<string, DealRow>,
  entityMap: Map<string, EntityRow>,
  snoozeCountMap: Map<string, number>,
): OwedTodayItem {
  const deal = dealMap.get(r.deal_id);
  const org = resolveEntity(deal?.organization_id, entityMap);
  const contact = resolveEntity(deal?.main_contact_id, entityMap);
  const { phone, email } = extractContact(contact);

  return {
    queueItemId: r.id,
    dealId: r.deal_id,
    dealTitle: deal?.title ?? 'Untitled deal',
    clientName: org?.display_name ?? null,
    dealValue: deal?.budget_estimated ?? null,
    reasonType: r.reason_type,
    reasonString: r.reason,
    suggestedChannel: r.suggested_channel as OwedTodayItem['suggestedChannel'],
    contactName: contact?.display_name ?? null,
    contactPhone: phone,
    contactEmail: email,
    snoozeCount: snoozeCountMap.get(r.id) ?? 0,
    isSnoozed: r.status === 'snoozed',
    snoozedUntil: r.snoozed_until,
    dealHref: `/events/deal/${r.deal_id}`,
  };
}

const HARD_LIMIT = 10;

type SupaClient = Awaited<ReturnType<typeof createClient>>;

function buildSnoozeCountMap(data: { queue_item_id: string | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const log of data) {
    if (log.queue_item_id) {
      map.set(log.queue_item_id, (map.get(log.queue_item_id) ?? 0) + 1);
    }
  }
  return map;
}

async function fetchEntities(db: SupaClient, dealMap: Map<string, DealRow>): Promise<Map<string, EntityRow>> {
  const ids = [...new Set(
    Array.from(dealMap.values()).flatMap((d) =>
      [d.organization_id, d.main_contact_id].filter((id): id is string => !!id),
    ),
  )];
  const map = new Map<string, EntityRow>();
  if (!ids.length) return map;
  const { data } = await db.schema('directory').from('entities')
    .select('id, display_name, type, attributes').in('id', ids);
  for (const e of (data ?? []) as EntityRow[]) map.set(e.id, e);
  return map;
}

export async function getOwedToday(): Promise<OwedTodayItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  try {
    const { data: queueRows, error: queueErr } = await supabase
      .schema('ops').from('follow_up_queue')
      .select('id, deal_id, reason, reason_type, priority_score, suggested_channel, status, snoozed_until')
      .eq('workspace_id', workspaceId).in('status', ['pending', 'snoozed'])
      .is('superseded_at', null)
      .or(`status.eq.pending,snoozed_until.lte.${nowIso}`)
      .order('priority_score', { ascending: false }).limit(HARD_LIMIT);

    if (queueErr || !queueRows?.length) return [];
    const rows = queueRows as QueueRow[];
    const dealIds = [...new Set(rows.map((r) => r.deal_id))];

    const [dealsResult, snoozeResult] = await Promise.all([
      supabase.from('deals').select('id, title, budget_estimated, organization_id, main_contact_id')
        .in('id', dealIds).is('archived_at', null),
      supabase.schema('ops').from('follow_up_log').select('queue_item_id')
        .in('queue_item_id', rows.map((r) => r.id)).eq('action_type', 'snoozed'),
    ]);

    const dealMap = new Map(((dealsResult.data ?? []) as DealRow[]).map((d) => [d.id, d]));
    const snoozeCountMap = buildSnoozeCountMap((snoozeResult.data ?? []) as { queue_item_id: string | null }[]);
    const entityMap = await fetchEntities(supabase, dealMap);

    return rows.map((r) => mapRow(r, dealMap, entityMap, snoozeCountMap));
  } catch (err) {
    console.error('[OwedToday] fetch error:', err);
    Sentry.captureException(err, { tags: { module: 'owed-today', action: 'getOwedToday' } });
    return [];
  }
}
