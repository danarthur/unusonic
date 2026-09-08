/**
 * getVenueSpecs — the load-bearing venue attributes, for the compact spec card.
 *
 * Reads through `readEntityAttrs` rather than reaching into the raw JSONB. The
 * editor on the full page already validates through the same schema, and this
 * used to index the blob with hand-written string keys -- so the two surfaces
 * agreed only for as long as nobody renamed a key or changed a coercion. That
 * is also the house rule: never raw dot access on entity.attributes.
 *
 * Editing stays on VenueSpecsEditor. This is deliberately not the same
 * component: a 200-line read summary and a 600-line form are the panel-reads,
 * page-edits split working, not one thing built twice.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

export type VenueSpecs = {
  capacity: number | string | null;
  loadIn: string | null;
  loadInWindow: string | null;
  loadOutWindow: string | null;
  power: string | null;
  stage: string | null;
  parking: string | null;
  curfew: string | null;
  unionLocal: string | null;
  accessNotes: string | null;
  housePowerAmps: number | string | null;
  dockAddress: string | null;
  dockHours: string | null;
  formattedAddress: string | null;
};

export type GetVenueSpecsResult =
  | { ok: true; specs: VenueSpecs }
  | { ok: false; error: string };

export async function getVenueSpecs(
  workspaceId: string,
  entityId: string,
): Promise<GetVenueSpecsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const { data, error } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes, type')
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: true,
      specs: emptySpecs(),
    };
  }

  const attrs = readEntityAttrs(
    (data as { attributes: unknown }).attributes,
    'venue',
  );

  return {
    ok: true,
    specs: {
      capacity: attrs.capacity ?? null,
      loadIn: attrs.load_in_notes ?? null,
      loadInWindow: attrs.load_in_window ?? null,
      loadOutWindow: attrs.load_out_window ?? null,
      power: attrs.power_notes ?? null,
      stage: attrs.stage_notes ?? null,
      parking: attrs.parking_notes ?? null,
      curfew: attrs.curfew ?? null,
      unionLocal: attrs.union_local ?? null,
      accessNotes: attrs.access_notes ?? null,
      housePowerAmps: attrs.house_power_amps ?? null,
      dockAddress: attrs.dock_address ?? null,
      dockHours: attrs.dock_hours ?? null,
      formattedAddress: attrs.formatted_address ?? null,
    },
  };
}

function emptySpecs(): VenueSpecs {
  return {
    capacity: null,
    loadIn: null,
    loadInWindow: null,
    loadOutWindow: null,
    power: null,
    stage: null,
    parking: null,
    curfew: null,
    unionLocal: null,
    accessNotes: null,
    housePowerAmps: null,
    dockAddress: null,
    dockHours: null,
    formattedAddress: null,
  };
}
