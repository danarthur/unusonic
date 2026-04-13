'use server';

import { createClient } from '@/shared/api/supabase/server';

export type SearchResultItem =
  | { type: 'event'; id: string; title: string; subtitle?: string }
  | { type: 'invoice'; id: string; invoice_number: string | null; event_id: string; subtitle?: string };

export type SearchGlobalResult = {
  events: Array<{ id: string; title: string; client_name: string | null }>;
  invoices: Array<{
    id: string;
    invoice_number: string | null;
    event_id: string;
    status: string;
  }>;
};

export async function searchGlobal(
  query: string
): Promise<SearchGlobalResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { events: [], invoices: [] };
  }

  const supabase = await createClient();
  const pattern = `%${trimmed}%`;

  const [eventsRes, invoicesRes] = await Promise.all([
    supabase
      .schema('ops')
      .from('events')
      .select('id, title, client_entity_id')
      .or(`title.ilike.${pattern}`)
      .in('lifecycle_status', ['lead', 'tentative', 'confirmed', 'production', 'live'])
      .order('starts_at', { ascending: true })
      .limit(8),
    supabase
      .schema('finance')
      .from('invoices')
      .select('id, invoice_number, event_id, status')
      .ilike('invoice_number', pattern)
      .limit(6),
  ]);

  // Batch-resolve client names from directory.entities
  const eventRows = (eventsRes.data ?? []) as Array<Record<string, unknown>>;
  const clientEntityIds = [...new Set(
    eventRows.map((e) => e.client_entity_id as string | null).filter((id): id is string => !!id)
  )];
  const clientNameMap = new Map<string, string>();
  if (clientEntityIds.length > 0) {
    const { data: dirEnts } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', clientEntityIds);
    for (const ent of dirEnts ?? []) {
      clientNameMap.set(ent.id, ent.display_name ?? '');
    }
  }

  const events = eventRows.map((e) => ({
    id: e.id as string,
    title: (e.title as string) ?? '',
    client_name: (e.client_entity_id as string | null)
      ? clientNameMap.get(e.client_entity_id as string) ?? null
      : null,
  }));

  return {
    events,
    invoices: (invoicesRes.data ?? []) as SearchGlobalResult['invoices'],
  };
}
