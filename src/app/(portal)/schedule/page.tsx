/**
 * My Schedule — employee portal.
 * Shows upcoming and past crew assignments for the current user.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getEntityCrewSchedule, getEntityCrewHistory } from '@/features/ops/actions/get-entity-crew-schedule';
import { ScheduleList } from './schedule-list';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the user's person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
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

  const [upcoming, past] = await Promise.all([
    getEntityCrewSchedule(personEntity.id),
    getEntityCrewHistory(personEntity.id),
  ]);

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          My schedule
        </h1>
        <p className="mt-1 text-sm text-[var(--stage-text-secondary)]">
          Your upcoming and past assignments.
        </p>
      </div>
      <ScheduleList upcoming={upcoming} past={past} />
    </div>
  );
}
