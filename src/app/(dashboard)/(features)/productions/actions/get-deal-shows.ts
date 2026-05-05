'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { SeriesRuleSchema, type SeriesRule, type SeriesArchetype } from '@/shared/lib/series-rule';

export type DealShow = {
  id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  lifecycle_status: string | null;
  archived_at: string | null;
  diverged_from_series_at: string | null;
  crew_count: number;
  title: string;
};

export type GetDealShowsResult =
  | {
      success: true;
      isSeries: boolean;
      seriesRule: SeriesRule | null;
      seriesArchetype: SeriesArchetype | null;
      projectId: string | null;
      shows: DealShow[];
    }
  | { success: false; error: string };

/**
 * Load the ops.events list for a deal, along with its project's series
 * metadata. Powers the "Shows (N)" section on the deal detail page — visible
 * for series, collapses to one row for singletons/multi-day.
 *
 * Also counts event-scoped crew per show so the row strip can render
 * "Crew: 3/4" without a second round-trip.
 */
export async function getDealShows(dealId: string): Promise<GetDealShowsResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { data: dealRow } = await supabase
    .from('deals')
    .select('id, workspace_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!dealRow) return { success: false, error: 'Deal not found.' };

  const { data: project, error: projErr } = await supabase
    .schema('ops')
    .from('projects')
    .select('id, is_series, series_rule, series_archetype')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (projErr) return { success: false, error: projErr.message };

  const projectRow = project as
    | { id: string; is_series: boolean | null; series_rule: unknown; series_archetype: string | null }
    | null;

  const isSeries = Boolean(projectRow?.is_series);
  let seriesRule: SeriesRule | null = null;
  if (isSeries && projectRow?.series_rule) {
    const parsed = SeriesRuleSchema.safeParse(projectRow.series_rule);
    if (parsed.success) seriesRule = parsed.data;
  }
  const seriesArchetype = (projectRow?.series_archetype ?? null) as SeriesArchetype | null;

  const { data: events, error: eventsErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, timezone, status, lifecycle_status, archived_at, diverged_from_series_at')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .order('starts_at', { ascending: true });

  if (eventsErr) return { success: false, error: eventsErr.message };

  const eventRows = (events ?? []) as Array<{
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    status: string;
    lifecycle_status: string | null;
    archived_at: string | null;
    diverged_from_series_at: string | null;
  }>;

  // Per-event crew counts (single round-trip)
  const ids = eventRows.map((e) => e.id);
  const countsByEvent = new Map<string, number>();
  if (ids.length > 0) {
    const { data: crewRows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('event_id, status')
      .in('event_id', ids);
    const rows = (crewRows ?? []) as Array<{ event_id: string | null; status: string | null }>;
    for (const r of rows) {
      if (!r.event_id) continue;
      countsByEvent.set(r.event_id, (countsByEvent.get(r.event_id) ?? 0) + 1);
    }
  }

  const shows: DealShow[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: e.timezone,
    status: e.status,
    lifecycle_status: e.lifecycle_status,
    archived_at: e.archived_at,
    diverged_from_series_at: e.diverged_from_series_at,
    crew_count: countsByEvent.get(e.id) ?? 0,
  }));

  return {
    success: true,
    isSeries,
    seriesRule,
    seriesArchetype,
    projectId: projectRow?.id ?? null,
    shows,
  };
}
