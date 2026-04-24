/**
 * getEntityCaptures — read the capture timeline for one entity.
 *
 * RLS on cortex.capture_events already enforces:
 *   - workspace membership
 *   - visibility = 'workspace' OR (visibility = 'user' AND user_id = auth.uid())
 *
 * We also filter status='confirmed' (dismissed captures stay on the audit
 * table but shouldn't appear on any user-facing timeline) and scope by
 * resolved_entity_id.
 *
 * Design: docs/reference/capture-surfaces-design.md §5, §10.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { CaptureVisibility } from '@/widgets/lobby-capture/api/confirm-capture';

export type EntityCapture = {
  id: string;
  createdAt: string;
  userId: string;
  capturedByName: string | null;
  isOwnCapture: boolean;
  transcript: string | null;
  parsedNote: string | null;
  parsedFollowUp: {
    text?: string;
    suggested_channel?: string;
    suggested_when?: string | null;
  } | null;
  visibility: CaptureVisibility;
  resolvedEntityId: string | null;
  /**
   * The actual subject of the capture — populated whenever the capture's
   * resolved entity differs from the viewed entity (i.e. via the company→
   * affiliated-people inclusion path). UI uses this to render an "about X"
   * chip that deep-links to X's entity page.
   */
  aboutEntity: {
    id: string;
    name: string | null;
    type: 'person' | 'company' | 'venue' | 'couple' | null;
  } | null;
  /** Production this capture is linked to — deal OR event, never both. */
  linkedProduction: {
    kind: 'deal' | 'event';
    id: string;
    title: string | null;
  } | null;
  /**
   * Indicates an uncertain parse — surfaced on the timeline so the user
   * can quickly re-open the reassign picker. Derived from the parsed_entity
   * confidence and match_candidates length. Design §11.3.
   */
  uncertain: boolean;
};

export type GetEntityCapturesResult =
  | { ok: true; captures: EntityCapture[] }
  | { ok: false; error: string };

type RawCaptureRow = {
  id: string;
  created_at: string;
  user_id: string;
  transcript: string | null;
  parsed_note: string | null;
  parsed_follow_up: Record<string, unknown> | null;
  parsed_entity: {
    match_candidates?: unknown[];
  } | null;
  visibility: CaptureVisibility;
  resolved_entity_id: string | null;
  linked_deal_id: string | null;
  linked_event_id: string | null;
  confidence?: number | null;
};

function isUncertain(row: RawCaptureRow): boolean {
  const parsedEntity = row.parsed_entity;
  if (!parsedEntity) return false;
  const candidates = Array.isArray(parsedEntity.match_candidates)
    ? parsedEntity.match_candidates
    : [];
  // Multiple candidates → the parse was ambiguous at write time.
  if (candidates.length >= 2) return true;
  // Low confidence threshold per design §11.3.
  if (typeof row.confidence === 'number' && row.confidence < 0.5) return true;
  return false;
}

const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'WORKS_FOR',
  'EMPLOYED_AT',
];

/**
 * For company / venue entities, fetch the ids of people affiliated with them
 * so their captures surface on the organization's timeline. Returns the
 * caller's entityId plus every affiliated person id.
 *
 * Rationale: "met with Brandi about X" resolves to the person, not the org.
 * When the user opens Brandi Jane Events (company) expecting to find that
 * note, the company's timeline needs to include captures about its people.
 */
async function resolveAffiliatedEntityIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id')
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

  const ids = new Set<string>([entityId]);
  for (const r of ((data ?? []) as { source_entity_id: string; target_entity_id: string }[])) {
    if (r.source_entity_id !== entityId) ids.add(r.source_entity_id);
    if (r.target_entity_id !== entityId) ids.add(r.target_entity_id);
  }
  return Array.from(ids);
}

export async function getEntityCaptures(
  workspaceId: string,
  entityId: string,
  options?: {
    limit?: number;
    /**
     * When true, also include captures about entities affiliated with this
     * entity via cortex.relationships edges (MEMBER, ROSTER_MEMBER, PARTNER,
     * WORKS_FOR, EMPLOYED_AT). Intended for company / venue entity pages —
     * leave false for person entities where the inverse already holds (no
     * "include my company's captures" case).
     */
    includeAffiliated?: boolean;
  },
): Promise<GetEntityCapturesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // When including affiliated entities, expand the filter to a superset.
  const resolvedIdFilter: string[] = options?.includeAffiliated
    ? await resolveAffiliatedEntityIds(supabase, entityId)
    : [entityId];

  // cortex schema isn't in generated types (see CLAUDE.md schema note) —
  // cast through any for the query chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('cortex')
    .from('capture_events')
    .select(
      'id, created_at, user_id, transcript, parsed_note, parsed_follow_up, parsed_entity, visibility, resolved_entity_id, linked_deal_id, linked_event_id',
    )
    .eq('workspace_id', workspaceId)
    .in('resolved_entity_id', resolvedIdFilter)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 50);

  if (error) return { ok: false, error: (error as { message: string }).message };

  const rows: RawCaptureRow[] = (data ?? []) as RawCaptureRow[];
  if (rows.length === 0) {
    return { ok: true, captures: [] };
  }

  // Look up display names via profiles so the UI can show who captured.
  // profiles.id == auth.users.id. Only load unique ids.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const nameByUserId = new Map<string, string | null>();
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
    nameByUserId.set(p.id, p.full_name ?? null);
  }

  // When includeAffiliated is on, some rows resolve to other entities than
  // the viewed one. Look up their display_name + type so the UI can show an
  // "about X" chip on each such row.
  const otherEntityIds = Array.from(
    new Set(
      rows
        .map((r) => r.resolved_entity_id)
        .filter((id): id is string => !!id && id !== entityId),
    ),
  );
  const { data: otherEntityRows } = otherEntityIds.length > 0
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, type')
        .in('id', otherEntityIds)
    : { data: [] as { id: string; display_name: string | null; type: string | null }[] };

  type EntityType = NonNullable<EntityCapture['aboutEntity']>['type'];
  const otherEntityById = new Map<string, { name: string | null; type: EntityType }>();
  for (const e of (otherEntityRows ?? []) as {
    id: string;
    display_name: string | null;
    type: string | null;
  }[]) {
    otherEntityById.set(e.id, {
      name: e.display_name,
      type: (e.type as EntityType) ?? null,
    });
  }

  // Look up titles for linked deals + events so the UI can show production
  // names. Two separate queries (different schemas) — do them in parallel.
  const dealIds = Array.from(
    new Set(rows.map((r) => r.linked_deal_id).filter((x): x is string => !!x)),
  );
  const eventIds = Array.from(
    new Set(rows.map((r) => r.linked_event_id).filter((x): x is string => !!x)),
  );

  const [dealsRes, eventsRes] = await Promise.all([
    dealIds.length > 0
      ? supabase.from('deals').select('id, title').in('id', dealIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    eventIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? supabase
          .schema('ops')
          .from('events')
          .select('id, title')
          .in('id', eventIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
  ]);

  const dealTitleById = new Map<string, string | null>();
  for (const d of (dealsRes.data ?? []) as { id: string; title: string | null }[]) {
    dealTitleById.set(d.id, d.title);
  }
  const eventTitleById = new Map<string, string | null>();
  for (const e of (eventsRes.data ?? []) as { id: string; title: string | null }[]) {
    eventTitleById.set(e.id, e.title);
  }

  const captures: EntityCapture[] = rows.map((r) => {
    let linkedProduction: EntityCapture['linkedProduction'] = null;
    if (r.linked_deal_id) {
      linkedProduction = {
        kind: 'deal',
        id: r.linked_deal_id,
        title: dealTitleById.get(r.linked_deal_id) ?? null,
      };
    } else if (r.linked_event_id) {
      linkedProduction = {
        kind: 'event',
        id: r.linked_event_id,
        title: eventTitleById.get(r.linked_event_id) ?? null,
      };
    }

    // aboutEntity is populated only when the row resolved to a different
    // entity than the viewed one — i.e. the "notes about people at this
    // company" case. When it matches the viewed entity we leave null so
    // the UI doesn't show a redundant "about X" chip.
    let aboutEntity: EntityCapture['aboutEntity'] = null;
    if (r.resolved_entity_id && r.resolved_entity_id !== entityId) {
      const other = otherEntityById.get(r.resolved_entity_id);
      aboutEntity = {
        id: r.resolved_entity_id,
        name: other?.name ?? null,
        type: other?.type ?? null,
      };
    }

    return {
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      capturedByName: nameByUserId.get(r.user_id) ?? null,
      isOwnCapture: r.user_id === user.id,
      transcript: r.transcript,
      parsedNote: r.parsed_note,
      parsedFollowUp: (r.parsed_follow_up as EntityCapture['parsedFollowUp']) ?? null,
      visibility: r.visibility,
      resolvedEntityId: r.resolved_entity_id,
      aboutEntity,
      linkedProduction,
      uncertain: isUncertain(r),
    };
  });

  return { ok: true, captures };
}
