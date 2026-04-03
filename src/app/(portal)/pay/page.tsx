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

  // Get assignment pay history from crew_assignments (has event join for titles)
  const { data: crewAssignments } = await supabase
    .schema('ops')
    .from('entity_crew_schedule')
    .select('assignment_id, role, status, pay_rate, pay_rate_type, scheduled_hours, event_title, starts_at')
    .eq('entity_id', personEntity.id)
    .in('status', ['confirmed', 'dispatched'])
    .not('pay_rate', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(50);

  const payAssignments = (crewAssignments ?? []).map(a => {
    const rate = Number(a.pay_rate);
    const total = a.pay_rate_type === 'hourly' && a.scheduled_hours
      ? rate * Number(a.scheduled_hours)
      : rate;
    return {
      id: a.assignment_id,
      role: a.role ?? 'Crew',
      dayRate: total,
      date: a.starts_at as string | null,
      eventTitle: a.event_title as string | null,
    };
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <PayView
        defaultHourlyRate={defaultHourlyRate}
        skillRates={(skills ?? []).map(s => ({
          tag: s.skill_tag,
          hourlyRate: s.hourly_rate as number,
        }))}
        assignments={payAssignments}
      />
    </div>
  );
}
