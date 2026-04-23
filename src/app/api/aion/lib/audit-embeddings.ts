/**
 * Fill audit for cortex.memory — Phase 3 Sprint 1 Week 1 exit-gate helper.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.1.
 *
 * Returns per-source-type row counts in cortex.memory for a workspace,
 * alongside the corresponding source-table row counts (the "expected min"
 * for a fully-populated workspace). The Sprint 1 exit gate is:
 *     notes / follow-ups / proposals >80% fill on two pilot workspaces.
 *
 * How fill is measured:
 *   • deal_note  → cortex.memory count vs ops.deal_notes count
 *   • follow_up  → cortex.memory count vs ops.follow_up_log count
 *                  (logs without `content` or `summary` are counted in the
 *                   denominator because they still represent intent;
 *                   treat <80% with empty-content skew as PASS.)
 *   • proposal   → cortex.memory count vs public.proposals count
 *                  (S0-2: most have null scope_notes — expected until the
 *                   Week 3 proposal-embedding content shape lands.)
 *   • catalog    → cortex.memory count vs public.packages WHERE is_active.
 *
 * `capture`, `message`, `narrative`, `event_note`, `activity_log` are
 * included in the response but have no "expected_min" yet — their source
 * tables either don't exist (narrative lives in cortex.memory itself), are
 * still untouched by live writes (message — Week 2), or haven't been
 * scoped yet (event_note, activity_log — Week 3).
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';

const AUDITED_SOURCE_TYPES = [
  'deal_note',
  'follow_up',
  'proposal',
  'event_note',
  'capture',
  'message',
  'narrative',
  'activity_log',
  'catalog',
] as const;

type AuditedSource = (typeof AUDITED_SOURCE_TYPES)[number];

export type FillAuditRow = {
  sourceType: AuditedSource;
  rowCount: number;
  expectedMin: number | null;
  fillRatio: number | null;
};

export type FillAuditResult = {
  workspaceId: string;
  auditedAt: string;
  rows: FillAuditRow[];
};

/**
 * Run the fill audit. Caller must already have been membership-verified
 * (route layer does it before calling this).
 */
export async function auditWorkspaceContentFill(workspaceId: string): Promise<FillAuditResult> {
  const supabase = await createClient();

  // Per-source-type cortex.memory counts — one round-trip per source_type
  // via `head: true, count: 'exact'`. RLS handles workspace isolation.
  const memoryCounts = await Promise.all(
    AUDITED_SOURCE_TYPES.map(async (sourceType) => {
      const { count } = await supabase
        .schema('cortex')
        .from('memory')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('source_type', sourceType);
      return [sourceType, count ?? 0] as const;
    }),
  );
  const memoryByType = new Map<AuditedSource, number>(memoryCounts);

  // Source-table expected-min counts. Parallel so the audit stays snappy.
  const [notesRes, followRes, proposalsRes, catalogRes, messagesRes, activitySummary] = await Promise.all([
    supabase
      .schema('ops')
      .from('deal_notes')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .schema('ops')
      .from('follow_up_log')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('packages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_active', true),
    // Only messages with body_text are embeddable, so that's the right
    // denominator. Null-body messages skip the embed path.
    supabase
      .schema('ops')
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .not('body_text', 'is', null),
    // Activity-chunk expected-min is the count of distinct (deal, YYYYMM)
    // pairs. PostgREST can't aggregate that directly — fetch ids +
    // created_at for deals in the workspace and compute client-side.
    supabase
      .schema('ops')
      .from('deal_activity_log')
      .select('deal_id, created_at')
      .eq('workspace_id', workspaceId),
  ]);

  type ActivityRow = { deal_id: string; created_at: string };
  const activityChunkKeys = new Set<string>();
  for (const r of ((activitySummary.data ?? []) as unknown) as ActivityRow[]) {
    const month = r.created_at.slice(0, 7); // YYYY-MM
    activityChunkKeys.add(`${r.deal_id}::${month}`);
  }

  const expectedByType = new Map<AuditedSource, number | null>([
    ['deal_note', notesRes.count ?? 0],
    ['follow_up', followRes.count ?? 0],
    ['proposal', proposalsRes.count ?? 0],
    ['catalog', catalogRes.count ?? 0],
    ['message', messagesRes.count ?? 0],
    ['activity_log', activityChunkKeys.size],
    // No expected_min yet — see module comment.
    ['event_note', null],
    ['capture', null],
    ['narrative', null],
  ]);

  const rows: FillAuditRow[] = AUDITED_SOURCE_TYPES.map((sourceType) => {
    const rowCount = memoryByType.get(sourceType) ?? 0;
    const expectedMin = expectedByType.get(sourceType) ?? null;
    const fillRatio =
      expectedMin && expectedMin > 0 ? Math.min(rowCount / expectedMin, 1) : null;
    return { sourceType, rowCount, expectedMin, fillRatio };
  });

  return {
    workspaceId,
    auditedAt: new Date().toISOString(),
    rows,
  };
}
