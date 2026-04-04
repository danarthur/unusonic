'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

/* ── Types ───────────────────────────────────────────────────────── */

export type SetlistSong = {
  id: string;
  title: string;
  artist: string;
  notes: string;
};

export type Setlist = {
  id: string;
  name: string;
  songs: SetlistSong[];
  createdAt: string;
};

export type TechRiderItem = {
  id: string;
  category: string; // 'audio' | 'lighting' | 'stage' | 'backline'
  item: string;
  quantity: number;
  notes: string;
};

export type HospitalityRiderItem = {
  id: string;
  category: string; // 'food' | 'beverage' | 'green_room' | 'travel' | 'other'
  item: string;
  notes: string;
};

export type BandEntityData = {
  band_setlists?: Setlist[];
  band_tech_rider?: TechRiderItem[];
  band_hospitality_rider?: HospitalityRiderItem[];
};

export type SaveResult = { ok: true } | { ok: false; error: string };

/* ── Actions ─────────────────────────────────────────────────────── */

async function getAuthedEntity() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  return person ? { supabase, userId: user.id, person } : null;
}

/** Save setlists to person entity attributes */
export async function saveSetlists(setlists: Setlist[]): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  const current = (ctx.person.attributes ?? {}) as Record<string, unknown>;
  const merged = { ...current, band_setlists: setlists };

  const { error } = await ctx.supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: merged })
    .eq('id', ctx.person.id);

  if (error) return { ok: false, error: 'Failed to save setlists.' };
  return { ok: true };
}

/** Save tech rider to person entity attributes */
export async function saveTechRider(items: TechRiderItem[]): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  const current = (ctx.person.attributes ?? {}) as Record<string, unknown>;
  const merged = { ...current, band_tech_rider: items };

  const { error } = await ctx.supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: merged })
    .eq('id', ctx.person.id);

  if (error) return { ok: false, error: 'Failed to save tech rider.' };
  return { ok: true };
}

/** Save hospitality rider to person entity attributes */
export async function saveHospitalityRider(items: HospitalityRiderItem[]): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  const current = (ctx.person.attributes ?? {}) as Record<string, unknown>;
  const merged = { ...current, band_hospitality_rider: items };

  const { error } = await ctx.supabase
    .schema('directory')
    .from('entities')
    .update({ attributes: merged })
    .eq('id', ctx.person.id);

  if (error) return { ok: false, error: 'Failed to save hospitality rider.' };
  return { ok: true };
}

/** Save band-specific gig data to event run_of_show_data */
export async function saveBandGigData(
  eventId: string,
  data: { band_setlist_id?: string; band_set_time?: string; band_gig_notes?: string },
): Promise<SaveResult> {
  const ctx = await getAuthedEntity();
  if (!ctx) return { ok: false, error: 'Not authenticated.' };

  // Verify assignment exists
  const { data: assignment } = await ctx.supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('entity_id', ctx.person.id)
    .limit(1)
    .maybeSingle();

  if (!assignment) return { ok: false, error: 'Not assigned to this event.' };

  // Atomic JSONB merge via RPC — prevents race conditions with concurrent saves
  const { error } = await ctx.supabase.rpc('patch_event_ros_data', {
    p_event_id: eventId,
    p_patch: data as unknown as Record<string, unknown>,
  });

  if (error) return { ok: false, error: 'Failed to save.' };
  return { ok: true };
}
