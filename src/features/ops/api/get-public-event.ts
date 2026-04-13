/**
 * Ops feature – Fetch public event by client_portal_token.
 * Uses service-role client to bypass RLS; only returns data for matching token.
 * @module features/ops/api/get-public-event
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { ProgramTimeline, ClientDetails } from '@/features/ops/lib/dj-prep-schema';

export type PublicEventDTO = {
  event: {
    id: string;
    title: string | null;
    startsAt: string | null;
    endsAt: string | null;
    venueName: string | null;
    venueAddress: string | null;
    eventArchetype: string | null;
  };
  program: {
    timelines: ProgramTimeline[];
    clientDetails: ClientDetails | null;
    clientNotes: string;
  };
  workspace: {
    id: string;
    name: string;
    portalThemePreset: string | null;
    portalThemeConfig: unknown;
    logoUrl: string | null;
  };
};

export async function getPublicEvent(token: string): Promise<PublicEventDTO | null> {
  if (!token?.trim()) return null;

  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- system client types don't include ops schema
  const crossSchema = supabase;

  // 1. Event by client_portal_token
  const { data: event, error } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, event_archetype, run_of_show_data, workspace_id')
    .eq('client_portal_token', token.trim())
    .maybeSingle();

  if (error || !event || !event.workspace_id) return null;

  const rosData = (event.run_of_show_data ?? {}) as Record<string, unknown>;

  // 2. Workspace for branding
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, portal_theme_preset, portal_theme_config, logo_url')
    .eq('id', event.workspace_id)
    .maybeSingle();

  if (!workspace) return null;

  // 3. Extract program data
  const timelines = (rosData.dj_program_timelines as ProgramTimeline[]) ?? [];
  const clientDetails = (rosData.dj_client_details as ClientDetails) ?? null;
  const clientNotes = (rosData.dj_client_notes as string) ?? '';

  return {
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      venueName: event.venue_name,
      venueAddress: event.venue_address,
      eventArchetype: event.event_archetype,
    },
    program: {
      timelines,
      clientDetails,
      clientNotes,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      portalThemePreset: workspace.portal_theme_preset,
      portalThemeConfig: workspace.portal_theme_config,
      logoUrl: workspace.logo_url,
    },
  };
}
