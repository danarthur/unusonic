'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Blackout date range — a span of unavailable dates.
 * Single-day blackouts have start === end.
 */
const BlackoutRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const SaveAvailabilitySchema = z.object({
  entityId: z.string().uuid(),
  blackouts: z.array(BlackoutRangeSchema),
});

export type BlackoutRange = z.infer<typeof BlackoutRangeSchema>;

/**
 * Save availability blackout ranges for a crew member.
 * Validates the user owns the entity via claimed_by_user_id.
 * Stores as `availability_blackouts` in directory.entities.attributes.
 */
export async function saveAvailability(
  entityId: string,
  blackouts: BlackoutRange[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Validate input
  const parsed = SaveAvailabilitySchema.safeParse({ entityId, blackouts });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Verify the entity belongs to the current user
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, claimed_by_user_id')
    .eq('id', parsed.data.entityId)
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();

  if (!entity) {
    return { ok: false, error: 'Not authorised.' };
  }

  // Sort and validate ranges (start <= end)
  const sorted = parsed.data.blackouts
    .filter((r) => r.start <= r.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: parsed.data.entityId,
    p_attributes: { availability_blackouts: sorted },
  });

  if (error) {
    console.error('[ops] saveAvailability:', error.message);
    return { ok: false, error: 'Failed to save availability.' };
  }

  return { ok: true };
}
