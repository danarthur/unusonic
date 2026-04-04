/**
 * Availability Calendar — employee portal.
 * Crew members mark dates they are unavailable.
 * Blackout ranges are stored in directory.entities.attributes.availability_blackouts.
 */

import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { getEntityCrewSchedule, getEntityCrewHistory } from '@/features/ops/actions/get-entity-crew-schedule';
import { CalendarView } from './calendar-view';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the user's person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          No profile linked
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)] max-w-md">
          Your account is not linked to a team member profile yet. Contact your manager.
        </p>
      </div>
    );
  }

  const attrs = readEntityAttrs(personEntity.attributes, 'person');
  const blackouts = attrs.availability_blackouts ?? [];

  // Fetch scheduled gigs for calendar dots
  const [upcoming, past] = await Promise.all([
    getEntityCrewSchedule(personEntity.id),
    getEntityCrewHistory(personEntity.id),
  ]);
  const allGigs = [...upcoming, ...past].map(g => ({
    date: g.starts_at,
    title: g.event_title ?? 'Show',
    status: g.status,
    assignmentId: g.assignment_id,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <CalendarView
        entityId={personEntity.id}
        initialBlackouts={blackouts}
        gigs={allGigs}
      />
    </div>
  );
}
