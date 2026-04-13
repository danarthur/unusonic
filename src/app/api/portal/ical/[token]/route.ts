import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';

/**
 * Public iCal feed endpoint. No auth required — secured by unique token.
 * Serves an ICS file of upcoming confirmed/dispatched assignments.
 * Crew subscribe once in Apple/Google/Outlook calendar.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return new NextResponse('Not found', { status: 404 });

  const system = getSystemClient();

  // Look up user by ical_token
  const { data: profile } = await system
    .from('profiles')
    .select('id, full_name, email')
    .eq('ical_token', token)
    .maybeSingle();

  if (!profile) return new NextResponse('Not found', { status: 404 });

  // Resolve person entity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: person } = await system
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', profile.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return new NextResponse('Not found', { status: 404 });

  // Fetch upcoming assignments (next 6 months)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignments } = await system
    .schema('ops')
    .from('entity_crew_schedule')
    .select('assignment_id, role, status, event_title, starts_at, ends_at, venue_name, venue_address, location_address')
    .eq('entity_id', person.id)
    .in('status', ['confirmed', 'dispatched'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(100);

  // Build ICS
  const events = (assignments ?? []) as {
    assignment_id: string;
    role: string;
    status: string;
    event_title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue_name: string | null;
    venue_address: string | null;
    location_address: string | null;
  }[];

  const icsEvents = events
    .filter((e) => e.starts_at)
    .map((e) => {
      const start = formatIcsDate(e.starts_at!);
      const end = e.ends_at ? formatIcsDate(e.ends_at) : start;
      const location = e.venue_address || e.location_address || e.venue_name || '';
      const summary = escapeIcs(`${e.event_title ?? 'Show'} — ${e.role}`);
      const description = escapeIcs(`Role: ${e.role}\\nStatus: ${e.status}${e.venue_name ? `\\nVenue: ${e.venue_name}` : ''}`);

      return [
        'BEGIN:VEVENT',
        `UID:${e.assignment_id}@unusonic.com`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        location ? `LOCATION:${escapeIcs(location)}` : '',
        `STATUS:CONFIRMED`,
        'END:VEVENT',
      ].filter(Boolean).join('\r\n');
    });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unusonic//Portal//EN',
    `X-WR-CALNAME:${escapeIcs(profile.full_name ?? 'My')} Shows`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...icsEvents,
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="unusonic-schedule.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

function formatIcsDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
