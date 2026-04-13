/**
 * My Pay — employee portal.
 * Read-only view of compensation, payment status tracking, and earnings history.
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

  // Get assignment pay history with payment tracking columns
  const { data: crewAssignments } = await supabase
    .schema('ops')
    .from('entity_crew_schedule')
    .select(
      'assignment_id, role, status, pay_rate, pay_rate_type, scheduled_hours, event_title, starts_at, payment_status, payment_date, travel_stipend, per_diem, kit_fee, overtime_hours, overtime_rate, bonus'
    )
    .eq('entity_id', personEntity.id)
    .in('status', ['confirmed', 'dispatched'])
    .order('starts_at', { ascending: false })
    .limit(50);

  const payAssignments = (crewAssignments ?? []).map((a) => {
    const baseRate = Number(a.pay_rate ?? 0);
    const scheduledHours = a.scheduled_hours ? Number(a.scheduled_hours) : null;
    const overtimeHours = a.overtime_hours ? Number(a.overtime_hours) : null;
    const overtimeRate = a.overtime_rate ? Number(a.overtime_rate) : null;
    const travelStipend = a.travel_stipend ? Number(a.travel_stipend) : null;
    const perDiem = a.per_diem ? Number(a.per_diem) : null;
    const kitFee = a.kit_fee ? Number(a.kit_fee) : null;
    const bonus = a.bonus ? Number(a.bonus) : null;

    // Compute base earnings
    const baseEarnings =
      a.pay_rate_type === 'hourly' && scheduledHours
        ? baseRate * scheduledHours
        : baseRate;

    // Compute overtime
    const otEarnings =
      overtimeHours && overtimeRate ? overtimeHours * overtimeRate : 0;

    // Gross total = base + OT + extras
    const grossTotal =
      baseEarnings +
      otEarnings +
      (travelStipend ?? 0) +
      (perDiem ?? 0) +
      (kitFee ?? 0) +
      (bonus ?? 0);

    return {
      id: a.assignment_id as string,
      role: (a.role as string) ?? 'Crew',
      eventTitle: a.event_title as string | null,
      date: a.starts_at as string | null,
      baseRate,
      baseRateType: a.pay_rate_type as string | null,
      scheduledHours,
      overtimeHours,
      overtimeRate,
      travelStipend,
      perDiem,
      kitFee,
      bonus,
      grossTotal,
      paymentStatus: (a.payment_status as string) ?? 'pending',
      paymentDate: a.payment_date as string | null,
    };
  });

  return (
    <PayView
      defaultHourlyRate={defaultHourlyRate}
      skillRates={(skills ?? []).map((s) => ({
        tag: s.skill_tag,
        hourlyRate: s.hourly_rate as number,
      }))}
      assignments={payAssignments}
    />
  );
}
