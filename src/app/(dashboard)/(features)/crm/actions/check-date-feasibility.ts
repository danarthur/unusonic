'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type FeasibilityStatus = 'clear' | 'caution' | 'critical';

export type CheckDateFeasibilityResult = {
  status: FeasibilityStatus;
  message: string;
  confirmedCount?: number;
  dealsCount?: number;
};

/** Per-date feasibility row. `date` is the input (yyyy-MM-dd) for chip correlation. */
export type DatedFeasibilityResult = CheckDateFeasibilityResult & { date: string };

const BADGE_MESSAGES: Record<FeasibilityStatus, string> = {
  clear: 'Prime Availability. Top 3 Leads Available.',
  caution: 'Date Congested. 2+ Inquiries Pending. Staffing Tight.',
  critical: 'Date Fully Booked. No Capacity Available.',
};

/**
 * Read-only feasibility check for a proposed date.
 * Queries ops.events (hard block: schedule) and Deals (soft demand: inquiries).
 * Returns Green/Yellow/Red status for the intake badge. No write.
 */
export async function checkDateFeasibility(
  date: string,
  workspaceIdOverride?: string
): Promise<CheckDateFeasibilityResult> {
  try {
    const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
    if (!workspaceId) {
      return {
        status: 'clear',
        message: BADGE_MESSAGES.clear,
        confirmedCount: 0,
        dealsCount: 0,
      };
    }

    const dateStr = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return {
        status: 'clear',
        message: 'Select a date to check availability.',
        confirmedCount: 0,
        dealsCount: 0,
      };
    }

    const baseStart = new Date(`${dateStr}T00:00:00.000Z`);
    const baseEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const dayStart = new Date(baseStart.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const dayEnd = new Date(baseEnd.getTime() + 12 * 60 * 60 * 1000).toISOString();

    const supabase = await createClient();

    // Phase 3i: "tentative / pending" stages (pre-contract) resolved by tag
    // rather than literal status slugs, which all collapsed to 'working'.
    // Query the workspace's default pipeline's stages tagged with
    // initial_contact or proposal_sent, then count deals in those stages.
    const { data: tentativePipeline } = await supabase
      .schema('ops')
      .from('pipelines')
      .select('id, pipeline_stages(id, tags, is_archived)')
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
      .eq('is_archived', false)
      .maybeSingle();

    const tentativeStageIds = ((tentativePipeline?.pipeline_stages ?? []) as Array<{ id: string; tags: string[] | null; is_archived: boolean }>)
      .filter((s) => !s.is_archived && (s.tags ?? []).some((t) => t === 'initial_contact' || t === 'proposal_sent'))
      .map((s) => s.id);

    const dealsQuery = tentativeStageIds.length > 0
      ? supabase
          .from('deals')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .is('archived_at', null)
          .eq('proposed_date', dateStr)
          .in('stage_id', tentativeStageIds)
      : Promise.resolve({ count: 0 } as { count: number | null });

    const [eventsRes, dealsRes] = await Promise.all([
      supabase
            .schema('ops')
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .lte('starts_at', dayEnd)
            .gte('ends_at', dayStart),
      dealsQuery,
    ]);

    const confirmedCount = eventsRes.count ?? 0;
    const dealsCount = dealsRes.count ?? 0;

    let status: FeasibilityStatus = 'clear';
    let message = BADGE_MESSAGES.clear;

    if (confirmedCount > 0 && dealsCount > 0) {
      status = 'caution';
      message = `${confirmedCount} event${confirmedCount > 1 ? 's' : ''} booked · ${dealsCount} inquiri${dealsCount > 1 ? 'es' : 'y'} pending.`;
    } else if (confirmedCount > 0) {
      status = 'caution';
      message = `${confirmedCount} event${confirmedCount > 1 ? 's' : ''} already booked on this date.`;
    } else if (dealsCount > 2) {
      status = 'caution';
      message = `Date congested — ${dealsCount} inquiries pending.`;
    }

    return {
      status,
      message,
      confirmedCount,
      dealsCount,
    };
  } catch (err) {
    console.error('[CRM] checkDateFeasibility error:', err);
    return {
      status: 'clear',
      message: BADGE_MESSAGES.clear,
      confirmedCount: 0,
      dealsCount: 0,
    };
  }
}

/**
 * Batch feasibility check for a series (multiple dates) or multi-day range.
 *
 * - Pass an array of `yyyy-MM-dd` strings for series dates (returns one result per date).
 * - Pass `{ start, end }` for a multi-day range (returns one aggregated result).
 *
 * Returns a parallel array of {date, status, message, ...}. Callers render each
 * entry as a colored chip (clear/caution/critical) in the Stage 1 chip strip.
 *
 * Implementation is a single round-trip per date — for long tours (30+ shows)
 * we can batch-query in the future, but P0 correctness beats premature batching.
 */
export async function checkDatesFeasibility(
  input: string[] | { start: string; end: string },
  workspaceIdOverride?: string
): Promise<DatedFeasibilityResult[]> {
  const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
  if (!workspaceId) return [];

  const dates = Array.isArray(input)
    ? input
    : expandDateRangeToList(input.start, input.end);

  // Run one query per date concurrently. The server action is cheap (head+count).
  const results = await Promise.all(
    dates.map(async (d): Promise<DatedFeasibilityResult> => {
      const r = await checkDateFeasibility(d, workspaceId);
      return { ...r, date: d };
    })
  );
  return results;
}

/** Internal: expand a yyyy-MM-dd inclusive range to a list of all days. */
function expandDateRangeToList(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
