/**
 * getVenueSpecs — read the load-bearing venue attributes for the compact spec
 * card. Existing venue fields live in `directory.entities.attributes` (see
 * VenueAttrsSchema + VENUE_ATTR); we just surface the ones that matter when
 * you're prepping a show.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

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

  const attrs = ((data as { attributes: Record<string, unknown> | null }).attributes ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    specs: {
      capacity: (attrs.capacity as number | string | null) ?? null,
      loadIn: (attrs.load_in_notes as string | null) ?? null,
      loadInWindow: (attrs.load_in_window as string | null) ?? null,
      loadOutWindow: (attrs.load_out_window as string | null) ?? null,
      power: (attrs.power_notes as string | null) ?? null,
      stage: (attrs.stage_notes as string | null) ?? null,
      parking: (attrs.parking_notes as string | null) ?? null,
      curfew: (attrs.curfew as string | null) ?? null,
      unionLocal: (attrs.union_local as string | null) ?? null,
      accessNotes: (attrs.access_notes as string | null) ?? null,
      housePowerAmps: (attrs.house_power_amps as number | string | null) ?? null,
      dockAddress: (attrs.dock_address as string | null) ?? null,
      dockHours: (attrs.dock_hours as string | null) ?? null,
      formattedAddress: (attrs.formatted_address as string | null) ?? null,
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
