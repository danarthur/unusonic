/**
 * getProductionCaptures — read captures linked to a specific deal or event.
 *
 * Inverse of getEntityCaptures: scoped to one production, enriched with the
 * linked entity's display name for inline attribution. RLS on cortex.capture_events
 * handles visibility filtering.
 *
 * Design: docs/reference/capture-surfaces-design.md (production linkage extension).
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { CaptureVisibility } from '@/widgets/lobby-capture/api/confirm-capture';

export type ProductionCapture = {
  id: string;
  createdAt: string;
  userId: string;
  capturedByName: string | null;
  isOwnCapture: boolean;
  transcript: string | null;
  parsedNote: string | null;
  visibility: CaptureVisibility;
  /** The entity this capture resolved to. Surface on the row since the production is the context. */
  resolvedEntity: {
    id: string;
    name: string | null;
    type: 'person' | 'company' | 'venue' | 'couple' | null;
  } | null;
};

export type GetProductionCapturesResult =
  | { ok: true; captures: ProductionCapture[] }
  | { ok: false; error: string };

type RawRow = {
  id: string;
  created_at: string;
  user_id: string;
  transcript: string | null;
  parsed_note: string | null;
  visibility: CaptureVisibility;
  resolved_entity_id: string | null;
};

export async function getProductionCaptures(
  workspaceId: string,
  kind: 'deal' | 'event',
  productionId: string,
  options?: {
    limit?: number;
    /**
     * When the caller is an event page and the event has a predecessor deal,
     * captures linked to that deal (pre-handover sales notes) also surface
     * here. Pass the deal id to include them — union'd with linked_event_id
     * matches, deduplicated, sorted reverse-chron.
     */
    includePredecessorDealId?: string | null;
  },
): Promise<GetProductionCapturesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const filterColumn = kind === 'deal' ? 'linked_deal_id' : 'linked_event_id';

  // Build the OR filter: linked_{kind} = id, plus linked_deal_id = predecessor
  // when provided and we're on an event.
  let orFilter = `${filterColumn}.eq.${productionId}`;
  if (kind === 'event' && options?.includePredecessorDealId) {
    orFilter += `,linked_deal_id.eq.${options.includePredecessorDealId}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .schema('cortex')
    .from('capture_events')
    .select(
      'id, created_at, user_id, transcript, parsed_note, visibility, resolved_entity_id',
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'confirmed')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 50);

  if (error) return { ok: false, error: (error as { message: string }).message };

  const rows: RawRow[] = (data ?? []) as RawRow[];
  if (rows.length === 0) {
    return { ok: true, captures: [] };
  }

  // Look up entity names + types for inline attribution on each row.
  const entityIds = Array.from(
    new Set(rows.map((r) => r.resolved_entity_id).filter((x): x is string => !!x)),
  );
  const { data: entityRows } = entityIds.length > 0
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, type')
        .in('id', entityIds)
    : { data: [] as { id: string; display_name: string | null; type: string | null }[] };

  type EntityType = NonNullable<ProductionCapture['resolvedEntity']>['type'];
  const entityById = new Map<string, { name: string | null; type: EntityType }>();
  for (const e of (entityRows ?? []) as { id: string; display_name: string | null; type: string | null }[]) {
    entityById.set(e.id, {
      name: e.display_name,
      type: (e.type as EntityType) ?? null,
    });
  }

  // Captured-by names via profiles.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  const nameByUserId = new Map<string, string | null>();
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
    nameByUserId.set(p.id, p.full_name ?? null);
  }

  return {
    ok: true,
    captures: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      capturedByName: nameByUserId.get(r.user_id) ?? null,
      isOwnCapture: r.user_id === user.id,
      transcript: r.transcript,
      parsedNote: r.parsed_note,
      visibility: r.visibility,
      resolvedEntity: r.resolved_entity_id
        ? {
            id: r.resolved_entity_id,
            name: entityById.get(r.resolved_entity_id)?.name ?? null,
            type: entityById.get(r.resolved_entity_id)?.type ?? null,
          }
        : null,
    })),
  };
}
