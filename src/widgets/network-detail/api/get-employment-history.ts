/**
 * getEmploymentHistory — where a person works now, and where they worked before.
 *
 * Reads the dated affiliation edges from migration 20260903193000. Before those
 * columns existed a job change meant DELETING the old edge, so "worked at Pure
 * Lavish until March" was not a fact the database could state and a past deal
 * could not explain itself. This is the surface that makes the dating visible.
 *
 * Deliberately the opposite of the frozen stamps on deals and referrals: those
 * answer "where were they then", this answers "where are they now".
 *
 * @module widgets/network-detail/api/get-employment-history
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { AFFILIATION_RELATIONSHIP_TYPES } from '@/entities/network/model/affiliation';
import { collapseStints, type EmploymentStint, type EdgeRow } from './employment-stints';

export type { EmploymentStint };

export type EmploymentHistory = {
  current: EmploymentStint[];
  former: EmploymentStint[];
};

export type GetEmploymentHistoryResult =
  | { ok: true; history: EmploymentHistory }
  | { ok: false; error: string };

const EMPTY: EmploymentHistory = { current: [], former: [] };

export async function getEmploymentHistory(
  workspaceId: string,
  entityId: string,
): Promise<GetEmploymentHistoryResult> {
  if (!workspaceId || !entityId) return { ok: true, history: EMPTY };

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id, relationship_type, context_data, started_at, ended_at')
    .eq('source_entity_id', entityId)
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES);

  if (error) return { ok: false, error: (error as { message: string }).message };

  const edges = (data ?? []) as EdgeRow[];
  if (edges.length === 0) return { ok: true, history: EMPTY };

  const companyIds = [...new Set(edges.map((e) => e.target_entity_id))];
  const { data: companies } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .in('id', companyIds)
    .in('type', ['company', 'venue']);

  const nameByCompanyId = new Map(
    ((companies ?? []) as { id: string; display_name: string | null }[])
      .filter((c) => Boolean(c.display_name))
      .map((c) => [c.id, c.display_name as string]),
  );

  const stints = collapseStints(edges, nameByCompanyId);

  return {
    ok: true,
    history: {
      current: stints
        .filter((s) => s.endedAt === null)
        .sort((a, b) => a.companyName.localeCompare(b.companyName)),
      // Most recently ended first — the last place they worked is the one
      // you're most likely to be asking about.
      former: stints
        .filter((s) => s.endedAt !== null)
        .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')),
    },
  };
}
