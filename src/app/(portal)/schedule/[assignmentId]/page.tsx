/**
 * Gig Detail — employee portal.
 * Shows full event details: venue, timeline, crew roster, contacts, notes.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { GigDetailView } from './gig-detail-view';

export const dynamic = 'force-dynamic';

export default async function GigDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
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

  if (!personEntity) notFound();

  // Fetch assignment
  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id, entity_id, role, status, pay_rate, pay_rate_type, scheduled_hours, call_time_override')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment || assignment.entity_id !== personEntity.id) notFound();

  // Fetch event
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, location_name, location_address, show_day_contacts, run_of_show_data, dates_load_in, dates_load_out, event_archetype, deal_id, notes')
    .eq('id', assignment.event_id)
    .maybeSingle();

  if (!event) notFound();

  // Crew roster for this event
  const crewMembers: { name: string; role: string | null; phone: string | null; entityId: string | null; isYou: boolean }[] = [];

  const { data: allCrew } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('entity_id, role, assignee_name')
    .eq('event_id', event.id);

  if (allCrew && allCrew.length > 0) {
    const entityIds = allCrew.map((c) => c.entity_id).filter(Boolean) as string[];
    const contactMap = new Map<string, { phone: string | null }>();

    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, attributes')
        .in('id', entityIds);

      for (const ent of (entities ?? []) as { id: string; attributes: unknown }[]) {
        try {
          const attrs = readEntityAttrs(ent.attributes, 'person') as Record<string, unknown>;
          contactMap.set(ent.id, { phone: (attrs.phone as string) ?? null });
        } catch {
          contactMap.set(ent.id, { phone: null });
        }
      }
    }

    for (const c of allCrew) {
      const contact = c.entity_id ? contactMap.get(c.entity_id) : null;
      crewMembers.push({
        name: c.assignee_name ?? 'Unnamed',
        role: c.role,
        phone: contact?.phone ?? null,
        entityId: c.entity_id,
        isYou: c.entity_id === personEntity.id,
      });
    }
  }

  // Build timeline
  const timeline: { time: string; label: string }[] = [];
  const fmt = (iso: string | null, label: string) => {
    if (!iso) return;
    timeline.push({
      time: new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      label,
    });
  };

  fmt(event.dates_load_in, 'Load in');
  if (event.starts_at) {
    if (assignment.call_time_override) {
      fmt(assignment.call_time_override, 'Your call time');
    } else {
      const ct = new Date(event.starts_at);
      ct.setHours(ct.getHours() - 2);
      timeline.push({
        time: ct.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        label: 'Crew call',
      });
    }
  }
  fmt(event.starts_at, 'Show start');
  fmt(event.ends_at, 'Show end');
  fmt(event.dates_load_out, 'Load out');

  // Show-day contacts
  const showDayContacts = (event.show_day_contacts ?? []) as { role: string; name: string; phone: string | null; email: string | null }[];

  // Venue
  const venueName = event.venue_name || event.location_name || null;
  const venueAddress = event.venue_address || event.location_address || null;
  const mapsUrl = venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : null;

  // Notes
  const rosData = (event.run_of_show_data ?? {}) as Record<string, unknown>;
  const specialNotes = (rosData.venue_restrictions as string | null) ?? event.notes ?? null;

  // Rate
  const payRate = assignment.pay_rate ? Number(assignment.pay_rate) : null;
  const payDisplay = payRate
    ? assignment.pay_rate_type === 'hourly' && assignment.scheduled_hours
      ? `$${(payRate * Number(assignment.scheduled_hours)).toFixed(0)}`
      : `$${payRate.toFixed(0)}`
    : null;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <GigDetailView
        eventTitle={event.title ?? 'Untitled show'}
        eventDate={event.starts_at}
        eventArchetype={event.event_archetype}
        venueName={venueName}
        venueAddress={venueAddress}
        mapsUrl={mapsUrl}
        role={assignment.role}
        status={assignment.status}
        payDisplay={payDisplay}
        timeline={timeline}
        crewMembers={crewMembers}
        showDayContacts={showDayContacts}
        specialNotes={specialNotes}
        assignmentId={assignmentId}
      />
    </div>
  );
}
