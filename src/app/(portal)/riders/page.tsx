/**
 * Riders — band/musical act portal.
 * Tech rider (audio/lighting/stage) and hospitality rider (food/green room/travel).
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { RidersView } from './riders-view';
import type { TechRiderItem, HospitalityRiderItem } from '@/features/ops/actions/save-band-data';

export const dynamic = 'force-dynamic';

export default async function RidersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

  const { data: caps } = await supabase
    .schema('ops')
    .from('entity_capabilities')
    .select('capability')
    .eq('entity_id', personEntity.id);

  const { data: skills } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag')
    .eq('entity_id', personEntity.id);

  const resolved = resolvePortalProfile({
    capabilities: (caps ?? []).map(c => c.capability),
    skillTags: (skills ?? []).map(s => s.skill_tag),
  });

  if (!resolved.all.some(p => p.key === 'band_musical_act')) {
    notFound();
  }

  const attrs = (personEntity.attributes ?? {}) as Record<string, unknown>;
  const techRider = (attrs.band_tech_rider ?? []) as TechRiderItem[];
  const hospitalityRider = (attrs.band_hospitality_rider ?? []) as HospitalityRiderItem[];

  return (
    <RidersView initialTechRider={techRider} initialHospitalityRider={hospitalityRider} />
  );
}
