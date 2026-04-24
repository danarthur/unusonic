/**
 * Workspace state line — optional second sentence in the pull-mode greeting
 * (Phase 3 post-Sprint-2, design doc §3.2).
 *
 * Q1 resolution: gated on activity. Renders only when the workspace has
 * ≥1 active deal. Quiet workspaces read as quiet without needing to be told.
 *
 * Q4 resolution: zero-content facts only. No editorial framing. *"Three deals
 * live, one show this week"* — not *"quiet week so far"*, not *"busy today"*.
 *
 * Disc discipline (UA research): facts, not asks. Never *"want me to..."*,
 * never a chip follow-up. This line exists to prove vigilance without
 * nudging; the moment it tips into advice, it becomes the drumbeat it's
 * supposed to replace.
 *
 * Rendered as a separate text block below the warm greeting — not
 * concatenated onto the greeting line, so the warm greeting stays
 * conversationally minimal.
 */

import { createClient } from '@/shared/api/supabase/server';

export type WorkspaceStateLine = {
  text: string;
};

/**
 * Resolve the state line for a workspace. Returns null when:
 *   • Workspace has zero active deals (quiet — say nothing)
 *   • Supabase is unavailable (fail closed, no speculation)
 *   • No figures cross the threshold of being worth saying
 */
export async function resolveWorkspaceStateLine(
  workspaceId: string,
): Promise<WorkspaceStateLine | null> {
  if (!workspaceId) return null;

  try {
    const supabase = await createClient();

    // Two cheap counts, parallel. RLS filters to caller's workspace.
    const [activeDealsRes, upcomingShowsRes] = await Promise.all([
      // Active = not won/lost/archived. Use working statuses.
      supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['inquiry', 'proposal', 'contract_sent', 'negotiation']),
      // Upcoming shows in the next 14 days via ops.events.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema path
      supabase
        .schema('ops')
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .gte('starts_at', new Date().toISOString())
        .lt('starts_at', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const activeDeals = activeDealsRes.count ?? 0;
    const upcomingShows = upcomingShowsRes.count ?? 0;

    // Threshold — if there's no activity to acknowledge, say nothing.
    if (activeDeals === 0 && upcomingShows === 0) return null;

    return { text: composeStateLine(activeDeals, upcomingShows) };
  } catch {
    return null;
  }
}

/**
 * Compose the state line. Zero-content facts only. Grammar follows singular
 * / plural carefully — production owners will notice *"1 deals"*.
 */
export function composeStateLine(activeDeals: number, upcomingShows: number): string {
  const parts: string[] = [];

  if (activeDeals > 0) {
    parts.push(activeDeals === 1 ? '1 deal live' : `${activeDeals} deals live`);
  }

  if (upcomingShows > 0) {
    parts.push(
      upcomingShows === 1
        ? '1 show in the next two weeks'
        : `${upcomingShows} shows in the next two weeks`,
    );
  }

  // Join with comma; always ends in period, never exclamation.
  return parts.join(', ') + '.';
}
