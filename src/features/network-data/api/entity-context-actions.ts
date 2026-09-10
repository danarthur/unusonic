'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { VENUE_ATTR } from '@/features/network-data/model/attribute-keys';
import type { JsonObject } from '@/shared/lib/jsonb';

// ─── Venue technical specs ────────────────────────────────────────────────────

export type VenueTechSpecsResult = { ok: true } | { ok: false; error: string };

export type VenueTechSpecs = {
  capacity?: number | null;
  load_in_notes?: string | null;
  power_notes?: string | null;
  stage_notes?: string | null;
};

/**
 * Merges venue technical specs into directory.entities.attributes
 * via patch_entity_attributes RPC (safe jsonb merge, no race condition).
 */
export async function updateVenueTechnicalSpecs(
  entityId: string,
  specs: VenueTechSpecs,
): Promise<VenueTechSpecsResult> {
  if (!entityId) return { ok: false, error: 'Missing entity ID.' };

  // Build payload — only include defined keys (using VENUE_ATTR constants for key safety)
  const payload: JsonObject = {};
  if (specs.capacity !== undefined) payload[VENUE_ATTR.capacity] = specs.capacity;
  if (specs.load_in_notes !== undefined) payload[VENUE_ATTR.load_in_notes] = specs.load_in_notes;
  if (specs.power_notes !== undefined) payload[VENUE_ATTR.power_notes] = specs.power_notes;
  if (specs.stage_notes !== undefined) payload[VENUE_ATTR.stage_notes] = specs.stage_notes;

  if (Object.keys(payload).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: payload,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

