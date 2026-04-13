'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

const InputSchema = z.object({
  eventId: z.string().uuid(),
  dealId: z.string().uuid(),
});

export type DaySheetToken = {
  entityId: string;
  name: string;
  email: string | null;
  token: string;
};

export type GenerateTokensResult =
  | { tokens: DaySheetToken[] }
  | { error: string };

/**
 * Generate one-time day sheet tokens per crew member.
 * Deletes existing tokens for this event (fresh batch each send).
 */
export async function generateDaySheetTokens(
  eventId: string,
  dealId: string,
): Promise<GenerateTokensResult> {
  const parsed = InputSchema.safeParse({ eventId, dealId });
  if (!parsed.success) return { error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { error: 'No active workspace.' };

  const supabase = await createClient();

  // 1. Get event starts_at for expiry calculation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not typed in PostgREST client
  const { data: evt } = await supabase
    .schema('ops')
    .from('events')
    .select('starts_at, project:projects!inner(workspace_id)')
    .eq('id', parsed.data.eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (!evt) return { error: 'Event not found or not authorised.' };

  const startsAt = (evt as Record<string, unknown>).starts_at as string | null;

  // Expiry: event start + 24h, or 7 days from now if no start date
  const expiresAt = startsAt
    ? new Date(new Date(startsAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 2. Fetch deal crew
  const { data: crewData } = await supabase.rpc('get_deal_crew_enriched', {
    p_deal_id: parsed.data.dealId,
    p_workspace_id: workspaceId,
  });

  const crewRows = Array.isArray(crewData) ? crewData : crewData ? [crewData] : [];
  const typedCrew = (crewRows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    entity_id: (r.entity_id as string | null) ?? null,
    entity_name: (r.entity_name as string | null) ?? null,
  }));

  // Filter to crew with entity assignments
  const assignedCrew = typedCrew.filter((r) => r.entity_id);
  if (assignedCrew.length === 0) return { error: 'No crew members assigned.' };

  // Resolve emails
  const entityIds = assignedCrew.map((r) => r.entity_id!);
  const emailMap = new Map<string, string | null>();

  if (entityIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, type, attributes')
      .in('id', entityIds);

    for (const e of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
      const t = e.type ?? 'person';
      let email: string | null = null;
      if (t === 'person') {
        email = readEntityAttrs(e.attributes, 'person').email ?? null;
      } else if (t === 'individual') {
        email = readEntityAttrs(e.attributes, 'individual').email ?? null;
      } else if (t === 'company') {
        email = readEntityAttrs(e.attributes, 'company').support_email ?? null;
      }
      emailMap.set(e.id, email);
    }
  }

  // 3. Delete existing tokens for this event (fresh batch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not typed
  await supabase
    .schema('ops')
    .from('day_sheet_tokens')
    .delete()
    .eq('event_id', parsed.data.eventId)
    .eq('workspace_id', workspaceId);

  // 4. Insert new tokens
  const tokenRows = assignedCrew.map((r) => ({
    event_id: parsed.data.eventId,
    workspace_id: workspaceId,
    deal_crew_id: r.id,
    entity_id: r.entity_id,
    email: emailMap.get(r.entity_id!) ?? null,
    expires_at: expiresAt,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not typed
  const { data: inserted, error: insertError } = await supabase
    .schema('ops')
    .from('day_sheet_tokens')
    .insert(tokenRows)
    .select('token, entity_id');

  if (insertError || !inserted) {
    console.error('[day-sheet-tokens] insert failed:', insertError);
    return { error: 'Failed to generate tokens.' };
  }

  // 5. Build result
  const insertedRows = inserted as { token: string; entity_id: string | null }[];
  const tokens: DaySheetToken[] = insertedRows.map((row) => {
    const crew = assignedCrew.find((c) => c.entity_id === row.entity_id);
    return {
      entityId: row.entity_id ?? '',
      name: crew?.entity_name ?? 'Unnamed',
      email: emailMap.get(row.entity_id ?? '') ?? null,
      token: row.token,
    };
  });

  return { tokens };
}
