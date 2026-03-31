/**
 * Event entity – fetch full Event Genome for Event Studio.
 * Reads from ops.events (project-scoped); workspace via project join.
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { EventCommandDTO, EventLifecycleStatus } from '../model/types';

export async function getEventCommand(eventId: string): Promise<EventCommandDTO | null> {
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

  const { data: row, error } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project_id, title, starts_at, ends_at, venue_entity_id, workspace_id, lifecycle_status, status, location_name, client_entity_id, producer_id, pm_id, crm_probability, crm_estimated_value, lead_source, notes, created_at, updated_at, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (error || !row) {
    if (error) console.error('[event] getEventCommand:', error.message);
    return null;
  }

  const r = row as Record<string, unknown>;
  const project = (r.project as { workspace_id?: string } | null) ?? null;
  const wsId = project?.workspace_id ?? workspaceId;

  // Resolve display names for linked entities
  const entityIdsToResolve = [
    r.client_entity_id as string | null,
    r.venue_entity_id as string | null,
    r.producer_id as string | null,
    r.pm_id as string | null,
  ].filter((id): id is string => !!id);

  const entityNameMap = new Map<string, string>();
  if (entityIdsToResolve.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', entityIdsToResolve);
    for (const e of entities ?? []) {
      if (e.display_name) entityNameMap.set(e.id, e.display_name);
    }
  }

  const clientEntityId = (r.client_entity_id as string) ?? null;
  const venueEntityId = (r.venue_entity_id as string) ?? null;
  const producerId = (r.producer_id as string) ?? null;
  const pmId = (r.pm_id as string) ?? null;

  const dto: EventCommandDTO = {
    id: r.id as string,
    workspace_id: wsId,
    title: (r.title as string) ?? null,
    internal_code: null,
    status: (r.status as string) ?? null,
    lifecycle_status: (r.lifecycle_status as EventLifecycleStatus | null) ?? null,
    confidentiality_level: null,
    slug: null,
    starts_at: (r.starts_at as string) ?? '',
    ends_at: (r.ends_at as string) ?? '',
    dates_load_in: null,
    dates_load_out: null,
    venue_entity_id: venueEntityId,
    venue_name: venueEntityId ? entityNameMap.get(venueEntityId) ?? null : null,
    venue_address: null,
    venue_google_maps_id: null,
    location_name: (r.location_name as string) ?? null,
    location_address: null,
    logistics_dock_info: null,
    logistics_power_info: null,
    client_entity_id: clientEntityId,
    producer_id: producerId,
    pm_id: pmId,
    guest_count_expected: null,
    guest_count_actual: null,
    tech_requirements: null,
    compliance_docs: null,
    project_id: (r.project_id as string) ?? null,
    crm_probability: (r.crm_probability as number) ?? null,
    crm_estimated_value: (r.crm_estimated_value as number) ?? null,
    lead_source: (r.lead_source as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: (r.created_at as string) ?? '',
    updated_at: (r.updated_at as string) ?? (r.created_at as string) ?? '',
    client_name: clientEntityId ? entityNameMap.get(clientEntityId) ?? null : null,
    producer_name: producerId ? entityNameMap.get(producerId) ?? null : null,
    pm_name: pmId ? entityNameMap.get(pmId) ?? null : null,
  };

  return dto;
}
