import { useEffect, useState } from 'react';
import { createClient } from '@/shared/api/supabase/client';

/**
 * Client-only CRM queue with realtime subscription.
 * The main CRM page (/crm) uses server fetch; use this hook for client-only or realtime views.
 */

/** Unified event row for CRM (lifecycle = lead/tentative/confirmed). */
export type Gig = {
  id: string;
  title: string;
  status: string;
  event_date: string;
  event_location: string;
  budget_estimated?: number;
  client: { name: string; type: string } | null;
};

export function useGigs() {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchGigs = async () => {
    try {
      const { data, error } = await supabase
        .schema('ops')
        .from('events')
        .select(
          `
          id,
          title,
          lifecycle_status,
          starts_at,
          location_name,
          crm_estimated_value,
          client_entity_id
        `
        )
        .in('lifecycle_status', ['lead', 'tentative', 'confirmed', 'production', 'live'])
        .order('starts_at', { ascending: true });

      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;

      // Batch-resolve client names from directory.entities
      const clientEntityIds = [...new Set(
        rows.map((e) => e.client_entity_id as string | null).filter((id): id is string => !!id)
      )];
      const clientMap = new Map<string, { name: string; type: string }>();
      if (clientEntityIds.length > 0) {
        const { data: dirEnts } = await supabase
          .schema('directory')
          .from('entities')
          .select('id, display_name, attributes')
          .in('id', clientEntityIds);
        for (const ent of dirEnts ?? []) {
          const attrs = (ent.attributes as Record<string, unknown>) ?? {};
          clientMap.set(ent.id, {
            name: ent.display_name ?? '',
            type: (attrs.category as string) ?? '',
          });
        }
      }

      setGigs(
        rows.map((e) => {
          const clientEntityId = e.client_entity_id as string | null;
          return {
            id: e.id as string,
            title: (e.title as string) ?? '',
            status: (e.lifecycle_status as string) ?? '',
            event_date: e.starts_at ? String((e.starts_at as string).slice(0, 10)) : '',
            event_location: (e.location_name as string) ?? '',
            budget_estimated: (e.crm_estimated_value as number) ?? undefined,
            client: clientEntityId ? (clientMap.get(clientEntityId) ?? null) : null,
          };
        })
      );
    } catch (error) {
      console.error('Error fetching events (CRM):', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGigs();

    const channel = supabase
      .channel('crm_realtime')
      .on('postgres_changes', { event: '*', schema: 'ops', table: 'events' }, () => {
        fetchGigs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { gigs, loading, refresh: fetchGigs };
}
