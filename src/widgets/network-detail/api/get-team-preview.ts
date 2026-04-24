/**
 * getTeamPreview — top-N affiliated people for a company/venue with a
 * last-capture snippet per row.
 *
 * Replaces the separate "Team preview" + "Recent activity" cards with a
 * single surface that answers both questions in one scan:
 *   "Who's on the team here, and what's the latest I've captured about them?"
 *
 * Visibility filter: captures with visibility='user' owned by OTHER users
 * are excluded from the snippet (matches the RLS policy). If the latest
 * capture is private to someone else, we fall back to the most recent
 * workspace-visible one, or null.
 *
 * Design: docs/reference/network-page-ia-redesign.md §5.1.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { CaptureVisibility } from '@/widgets/lobby-capture/api/confirm-capture';

/**
 * Edge types that mean "person is affiliated with this org/venue." Kept broad
 * to tolerate historical data — non-existent types (MEMBER, WORKS_FOR) just
 * match nothing.
 */
const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

export type TeamMemberPreview = {
  entityId: string;
  name: string | null;
  /** job_title from the relationship context_data when present. */
  role: string | null;
  /** The latest workspace-visible-or-own capture about this person, if any. */
  lastCaptureSnippet: string | null;
  lastCaptureAt: string | null;
  /** Capture id so the click-through can deep-link to it. */
  lastCaptureId: string | null;
  /** Whether this person is flagged as DNR (surfaced subtly in the UI). */
  dnrFlagged: boolean;
};

export type GetTeamPreviewResult =
  | { ok: true; members: TeamMemberPreview[]; totalCount: number }
  | { ok: false; error: string };

export async function getTeamPreview(
  workspaceId: string,
  companyEntityId: string,
  options?: { limit?: number },
): Promise<GetTeamPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const limit = options?.limit ?? 5;

  // 1. Pull affiliation edges both directions. Either source or target can be
  //    the company; the other side is the candidate person.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: edgeRows, error: edgeErr } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id, relationship_type, context_data')
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
    .or(`source_entity_id.eq.${companyEntityId},target_entity_id.eq.${companyEntityId}`);

  if (edgeErr) return { ok: false, error: (edgeErr as { message: string }).message };

  type EdgeRow = {
    source_entity_id: string;
    target_entity_id: string;
    relationship_type: string;
    context_data: Record<string, unknown> | null;
  };

  const roleByEntityId = new Map<string, string | null>();
  const personIdSet = new Set<string>();
  for (const e of ((edgeRows ?? []) as EdgeRow[])) {
    const other = e.source_entity_id === companyEntityId
      ? e.target_entity_id
      : e.source_entity_id;
    if (other === companyEntityId) continue;
    personIdSet.add(other);
    const ctx = (e.context_data ?? {}) as { job_title?: string; role?: string };
    const role = ctx.job_title ?? ctx.role ?? null;
    if (role && !roleByEntityId.has(other)) {
      roleByEntityId.set(other, role);
    }
  }

  const personIds = Array.from(personIdSet);
  if (personIds.length === 0) {
    return { ok: true, members: [], totalCount: 0 };
  }

  // 2. Resolve names + types. Only keep entities that are actually people or
  //    couples (the affiliation edge list may surface other orgs on rare edges).
  const { data: entityRows } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .in('id', personIds);

  type EntityRow = { id: string; display_name: string | null; type: string | null };
  const people = ((entityRows ?? []) as EntityRow[]).filter(
    (e) => e.type === 'person' || e.type === 'couple',
  );
  if (people.length === 0) {
    return { ok: true, members: [], totalCount: 0 };
  }

  const personDisplayIds = people.map((p) => p.id);

  // 3. Latest workspace-visible capture per person — RLS takes care of the
  //    user/workspace filter, we just order and deduplicate client-side.
  type CaptureRow = {
    id: string;
    resolved_entity_id: string | null;
    parsed_note: string | null;
    transcript: string | null;
    created_at: string;
    visibility: CaptureVisibility;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: captureRows } = await supabase
    .schema('cortex')
    .from('capture_events')
    .select('id, resolved_entity_id, parsed_note, transcript, created_at, visibility')
    .eq('workspace_id', workspaceId)
    .eq('status', 'confirmed')
    .in('resolved_entity_id', personDisplayIds)
    .order('created_at', { ascending: false })
    .limit(500);

  const latestByEntity = new Map<string, CaptureRow>();
  for (const c of ((captureRows ?? []) as CaptureRow[])) {
    if (!c.resolved_entity_id) continue;
    if (!latestByEntity.has(c.resolved_entity_id)) {
      latestByEntity.set(c.resolved_entity_id, c);
    }
  }

  // 4. DNR flags per person from entity_working_notes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wnRows } = await supabase
    .schema('cortex')
    .from('entity_working_notes')
    .select('entity_id, dnr_flagged')
    .eq('workspace_id', workspaceId)
    .in('entity_id', personDisplayIds);

  const dnrByEntity = new Map<string, boolean>();
  for (const w of ((wnRows ?? []) as { entity_id: string; dnr_flagged: boolean }[])) {
    dnrByEntity.set(w.entity_id, w.dnr_flagged);
  }

  // 5. Build the member list; sort by last-capture recency descending, those
  //    without captures fall to the bottom but stay alphabetical within.
  const members: TeamMemberPreview[] = people.map((p) => {
    const capture = latestByEntity.get(p.id);
    const snippet = (capture?.parsed_note ?? capture?.transcript ?? null)?.trim() || null;
    return {
      entityId: p.id,
      name: p.display_name,
      role: roleByEntityId.get(p.id) ?? null,
      lastCaptureSnippet: snippet,
      lastCaptureAt: capture?.created_at ?? null,
      lastCaptureId: capture?.id ?? null,
      dnrFlagged: dnrByEntity.get(p.id) ?? false,
    };
  });

  members.sort((a, b) => {
    const ta = a.lastCaptureAt ? new Date(a.lastCaptureAt).getTime() : 0;
    const tb = b.lastCaptureAt ? new Date(b.lastCaptureAt).getTime() : 0;
    if (ta !== tb) return tb - ta;
    const na = a.name ?? '';
    const nb = b.name ?? '';
    return na.localeCompare(nb);
  });

  return {
    ok: true,
    members: members.slice(0, limit),
    totalCount: members.length,
  };
}
