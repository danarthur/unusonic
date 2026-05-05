'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ThisWeekEntry = {
  id: string;
  kind: 'confirmed' | 'tentative';
  title: string;
  venueName: string | null;
  startIso: string;
  href: string;
  dealId: string | null;
};

export type ThisWeekDay = {
  date: string;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  entries: ThisWeekEntry[];
};

const DAYS_AHEAD = 5;
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDaysGrid(): { days: ThisWeekDay[]; today: Date; windowEnd: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + DAYS_AHEAD);

  const days: ThisWeekDay[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push({ date: isoDate(d), weekday: WEEKDAY_FMT.format(d), dayOfMonth: d.getDate(), isToday: i === 0, entries: [] });
  }
  return { days, today, windowEnd };
}

type EventRow = { id: string; title: string | null; starts_at: string; venue_name: string | null; deal_id: string | null };
type DealRow = { id: string; title: string | null; proposed_date: string };

function placeEvents(rows: EventRow[], dayIndex: Map<string, ThisWeekDay>) {
  for (const e of rows) {
    const day = dayIndex.get(e.starts_at.slice(0, 10));
    if (!day) continue;
    day.entries.push({
      id: e.id, kind: 'confirmed', title: e.title ?? 'Untitled show',
      venueName: e.venue_name, startIso: e.starts_at, href: `/events/g/${e.id}`, dealId: e.deal_id,
    });
  }
}

function placeDeals(rows: DealRow[], dayIndex: Map<string, ThisWeekDay>) {
  for (const d of rows) {
    const day = dayIndex.get(d.proposed_date);
    if (!day) continue;
    day.entries.push({
      id: d.id, kind: 'tentative', title: d.title ?? 'Untitled deal',
      venueName: null, startIso: `${d.proposed_date}T00:00:00`, href: `/events/deal/${d.id}`, dealId: d.id,
    });
  }
}

/**
 * Phase 3h: "tentative" deal stages are resolved via pipeline tags instead of
 * literal status slugs. A deal is tentative when its current stage carries
 * initial_contact, proposal_sent, OR contract_out. This keeps the widget
 * rename-resilient for workspaces with custom pipelines.
 *
 * Stock workspaces (initial_contact→`inquiry`, proposal_sent→`proposal`,
 * contract_out→`contract_sent`) produce the same deal set as the legacy
 * literal-slug filter.
 */
const TENTATIVE_STAGE_TAGS = ['initial_contact', 'proposal_sent', 'contract_out'];

export async function getThisWeek(): Promise<ThisWeekDay[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { days, today, windowEnd } = buildDaysGrid();
  const dayIndex = new Map(days.map((d) => [d.date, d]));

  try {
    // Resolve stage_ids for the workspace's tentative stages. Two-step lookup
    // (default pipeline first, then its stages with the tentative tags) — more
    // straightforward than a join filter on PostgREST and keeps the query
    // shape identical to other pipeline-reading surfaces.
    const { data: defaultPipeline } = await supabase
      .schema('ops')
      .from('pipelines')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
      .eq('is_archived', false)
      .maybeSingle();

    let tentativeStageIds: string[] = [];
    if (defaultPipeline) {
      const { data: tentativeStages } = await supabase
        .schema('ops')
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', (defaultPipeline as { id: string }).id)
        .eq('is_archived', false)
        .overlaps('tags', TENTATIVE_STAGE_TAGS);
      tentativeStageIds = (tentativeStages ?? []).map((s: { id: string }) => s.id);
    }

    const [eventsResult, dealsResult] = await Promise.all([
      supabase.schema('ops').from('events')
        .select('id, title, starts_at, venue_name, deal_id, lifecycle_status, status')
        .eq('workspace_id', workspaceId)
        .or('lifecycle_status.in.(confirmed,production,live),and(lifecycle_status.is.null,status.eq.confirmed)')
        .gte('starts_at', today.toISOString()).lt('starts_at', windowEnd.toISOString())
        .order('starts_at', { ascending: true }),
      // Tag-based filter: tentative deals are those whose stage carries one of
      // the pre-sale tags. Empty stage list means no tentative stages configured
      // (shouldn't happen post-Phase-1); .in('stage_id', []) evaluates false.
      tentativeStageIds.length > 0
        ? supabase.from('deals')
            .select('id, title, proposed_date, status')
            .eq('workspace_id', workspaceId)
            .in('stage_id', tentativeStageIds)
            .gte('proposed_date', isoDate(today)).lt('proposed_date', isoDate(windowEnd))
            .is('archived_at', null).order('proposed_date', { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    placeEvents((eventsResult.data ?? []) as EventRow[], dayIndex);
    placeDeals((dealsResult.data ?? []) as DealRow[], dayIndex);
    return days;
  } catch (err) {
    console.error('[ThisWeek] fetch error:', err);
    Sentry.captureException(err, { tags: { module: 'this-week', action: 'getThisWeek' } });
    return days;
  }
}
