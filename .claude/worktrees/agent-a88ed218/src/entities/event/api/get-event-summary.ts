/**
 * Event entity – lightweight summary for Run of Show header.
 * Reads from ops.events; workspace-scoped via project join.
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';

/** run_of_show_data from ops.events (JSONB). Used by Plan lens flight checks and conflict detection. */
export type RunOfShowData = {
  crew_roles?: string[] | null;
  crew_items?: {
    role: string;
    status: 'requested' | 'confirmed' | 'dispatched';
    entity_id?: string | null;
    assignee_name?: string | null;
  }[] | null;
  gear_requirements?: string | null;
  gear_items?: { id: string; name: string; status: 'pending' | 'pulled' | 'loaded' }[] | null;
  venue_restrictions?: string | null;
  logistics?: { venue_access_confirmed?: boolean; truck_loaded?: boolean; crew_confirmed?: boolean } | null;
  [key: string]: unknown;
};

export type EventSummary = {
  title: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  location_address: string | null;
  run_of_show_data: RunOfShowData | null;
};

export async function getEventSummary(eventId: string): Promise<EventSummary | null> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return null;

  let row: Record<string, unknown> | null = null;
  try {
    const res = await supabase
      .schema('ops')
      .from('events')
      .select('name, start_at, end_at, run_of_show_data, project:projects!inner(workspace_id)')
      .eq('id', eventId)
      .eq('projects.workspace_id', workspaceId)
      .maybeSingle();
    if (res.error) {
      console.error('[event] getEventSummary:', res.error.message);
      return null;
    }
    row = res.data as Record<string, unknown> | null;
  } catch (e) {
    console.error('[event] getEventSummary:', e);
    return null;
  }

  if (!row) return null;

  const r = row;
  return {
    title: (r.name as string) ?? null,
    client_name: null,
    starts_at: (r.start_at as string) ?? '',
    ends_at: (r.end_at as string) ?? null,
    location_name: null,
    location_address: null,
    run_of_show_data: (r.run_of_show_data as RunOfShowData) ?? null,
  };
}
