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
    .select(
      'id, project_id, title, starts_at, ends_at, venue_entity_id, workspace_id, lifecycle_status, status, ' +
      'internal_code, confidentiality_level, slug, dates_load_in, dates_load_out, venue_address, venue_google_maps_id, ' +
      'location_name, location_address, logistics_dock_info, logistics_power_info, ' +
      'client_entity_id, guest_count_expected, guest_count_actual, tech_requirements, compliance_docs, ' +
      'crm_probability, crm_estimated_value, lead_source, notes, created_at, updated_at, ' +
      'project:projects!inner(workspace_id)'
    )
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (error || !row) {
    if (error) console.error('[event] getEventCommand:', error.message);
    return null;
  }

  const r = row as unknown as Record<string, unknown>;
  const project = (r.project as { workspace_id?: string } | null) ?? null;
  const wsId = project?.workspace_id ?? workspaceId;

  const entityIdsToResolve = [
    r.client_entity_id as string | null,
    r.venue_entity_id as string | null,
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

  const dto: EventCommandDTO = {
    id: r.id as string,
    workspace_id: wsId,
    title: (r.title as string) ?? null,
    internal_code: (r.internal_code as string) ?? null,
    status: (r.status as string) ?? null,
    lifecycle_status: (r.lifecycle_status as EventLifecycleStatus | null) ?? null,
    confidentiality_level: (r.confidentiality_level as 'public' | 'private' | 'secret' | null) ?? null,
    slug: (r.slug as string) ?? null,
    starts_at: (r.starts_at as string) ?? '',
    ends_at: (r.ends_at as string) ?? '',
    dates_load_in: (r.dates_load_in as string) ?? null,
    dates_load_out: (r.dates_load_out as string) ?? null,
    venue_entity_id: venueEntityId,
    venue_name: venueEntityId ? entityNameMap.get(venueEntityId) ?? null : null,
    venue_address: (r.venue_address as string) ?? null,
    venue_google_maps_id: (r.venue_google_maps_id as string) ?? null,
    location_name: (r.location_name as string) ?? null,
    location_address: (r.location_address as string) ?? null,
    logistics_dock_info: (r.logistics_dock_info as string) ?? null,
    logistics_power_info: (r.logistics_power_info as string) ?? null,
    client_entity_id: clientEntityId,
    // producer_id and pm_id were dropped from ops.events (migration 20260309082105).
    // Personnel assignments now live in cortex.relationships ROSTER_MEMBER edges; resolve there if needed.
    producer_id: null,
    pm_id: null,
    guest_count_expected: (r.guest_count_expected as number) ?? null,
    guest_count_actual: (r.guest_count_actual as number) ?? null,
    tech_requirements: (r.tech_requirements as EventCommandDTO['tech_requirements']) ?? null,
    compliance_docs: (r.compliance_docs as EventCommandDTO['compliance_docs']) ?? null,
    project_id: (r.project_id as string) ?? null,
    crm_probability: (r.crm_probability as number) ?? null,
    crm_estimated_value: (r.crm_estimated_value as number) ?? null,
    lead_source: (r.lead_source as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: (r.created_at as string) ?? '',
    updated_at: (r.updated_at as string) ?? (r.created_at as string) ?? '',
    client_name: clientEntityId ? entityNameMap.get(clientEntityId) ?? null : null,
    producer_name: null,
    pm_name: null,
  };

  return dto;
}
