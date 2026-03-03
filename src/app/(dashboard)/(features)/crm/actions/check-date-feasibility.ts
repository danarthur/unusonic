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

const BADGE_MESSAGES: Record<FeasibilityStatus, string> = {
  clear: 'Prime Availability. Top 3 Leads Available.',
  caution: 'Date Congested. 2+ Inquiries Pending. Staffing Tight.',
  critical: 'Venue Blackout / Exclusive Buyout in place.',
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

    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd = `${dateStr}T23:59:59.999Z`;

    const supabase = await createClient();

    const [eventsRes, dealsRes] = await Promise.all([
      supabase
        .schema('ops')
        .from('events')
        .select('id, project:projects!inner(workspace_id)', { count: 'exact', head: true })
        .eq('projects.workspace_id', workspaceId)
        .lte('starts_at', dayEnd)
        .gte('ends_at', dayStart),
      supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('proposed_date', dateStr)
        .in('status', ['inquiry', 'proposal']),
    ]);

    const confirmedCount = eventsRes.count ?? 0;
    const dealsCount = dealsRes.count ?? 0;

    let status: FeasibilityStatus = 'clear';
    if (confirmedCount > 0) {
      status = 'critical';
    } else if (dealsCount > 2) {
      status = 'caution';
    }

    return {
      status,
      message: BADGE_MESSAGES[status],
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
