/**
 * My Pay — employee portal.
 * Read-only view of compensation rates and assignment pay history.
 */

import { createClient } from '@/shared/api/supabase/server';
import { PayView } from './pay-view';

export const dynamic = 'force-dynamic';

export default async function PayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve person entity
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

  // Get default rate from ROSTER_MEMBER edge
  const { data: rosterEdge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('context_data')
    .eq('source_entity_id', personEntity.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .limit(1)
    .maybeSingle();

  const ctx = (rosterEdge?.context_data ?? {}) as Record<string, unknown>;
  const defaultHourlyRate = (ctx.default_hourly_rate as number) ?? null;

  // Get per-skill rates
  const { data: skills } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag, hourly_rate')
    .eq('entity_id', personEntity.id)
    .not('hourly_rate', 'is', null)
    .order('skill_tag');

  // Get assignment pay history (confirmed gigs with day_rate)
  const { data: assignments } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, role_note, day_rate, confirmed_at, call_time')
    .eq('entity_id', personEntity.id)
    .not('confirmed_at', 'is', null)
    .not('day_rate', 'is', null)
    .order('call_time', { ascending: false, nullsFirst: false })
    .limit(20);

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          My pay
        </h1>
        <p className="mt-1 text-sm text-[var(--stage-text-secondary)]">
          Your rates and assignment pay history. All rates are set by your team admin.
        </p>
      </div>
      <PayView
        defaultHourlyRate={defaultHourlyRate}
        skillRates={(skills ?? []).map(s => ({
          tag: s.skill_tag,
          hourlyRate: s.hourly_rate as number,
        }))}
        assignments={(assignments ?? []).map(a => ({
          id: a.id,
          role: a.role_note ?? 'Crew',
          dayRate: a.day_rate as number,
          date: a.call_time as string | null,
        }))}
      />
    </div>
  );
}
