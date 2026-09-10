/**
 * Pure grouping for employment history. Split out of get-employment-history.ts
 * because a `'use server'` module may only export async functions — a sync
 * export there fails the build rather than the type check.
 *
 * @module widgets/network-detail/api/employment-stints
 */

export type EmploymentStint = {
  /** Company entity id — the link target, and the dedupe key. */
  companyId: string;
  companyName: string;
  jobTitle: string | null;
  startedAt: string | null;
  /** Null means current. */
  endedAt: string | null;
};

export type EdgeRow = {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  context_data: Record<string, unknown> | null;
  started_at: string | null;
  ended_at: string | null;
};

/**
 * Collapse edges into one stint per company per period.
 *
 * A person routinely holds two affiliation edges to the same company at once —
 * MEMBER *and* ROSTER_MEMBER is the norm in current data — which would
 * otherwise render as two identical rows. Keyed on (company, ended_at) so a
 * genuine second stint at a former employer still shows separately, which is
 * the whole reason the unique constraint was relaxed.
 *
 * Called by getEmploymentHistory.
 */
export function collapseStints(
  edges: EdgeRow[],
  nameByCompanyId: Map<string, string>,
): EmploymentStint[] {
  const byKey = new Map<string, EmploymentStint>();

  for (const e of edges) {
    const companyName = nameByCompanyId.get(e.target_entity_id);
    // A company the workspace cannot see has no name to render; skip rather
    // than print a blank row.
    if (!companyName) continue;

    const key = `${e.target_entity_id}::${e.ended_at ?? 'current'}`;
    const jobTitle = ((e.context_data ?? {}).job_title as string | null) ?? null;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        companyId: e.target_entity_id,
        companyName,
        jobTitle,
        startedAt: e.started_at,
        endedAt: e.ended_at,
      });
      continue;
    }
    // Merge duplicates: keep any job title we have, and the earliest known
    // start — two edges written at different times shouldn't shorten a stint.
    if (!existing.jobTitle && jobTitle) existing.jobTitle = jobTitle;
    if (e.started_at && (!existing.startedAt || e.started_at < existing.startedAt)) {
      existing.startedAt = e.started_at;
    }
  }

  return [...byKey.values()];
}

