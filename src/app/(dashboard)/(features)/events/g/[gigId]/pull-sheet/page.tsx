/**
 * Pull Sheet — focused gear prep view for crew chiefs.
 * Gear organized by department, status cycling, print-ready.
 * Crew call times shown for day-of dispatch reference.
 */

import { redirect } from 'next/navigation';
import { getEventCommand } from '@/entities/event';
import { getPullSheetData } from './get-pull-sheet-data';
import { PullSheetClient } from './pull-sheet-client';

export default async function PullSheetPage({
  params,
}: {
  params: Promise<{ gigId: string }>;
}) {
  const { gigId: eventId } = await params;

  const [event, pullSheet] = await Promise.all([
    getEventCommand(eventId),
    getPullSheetData(eventId),
  ]);

  if (!event) redirect('/events');

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="grain-overlay pointer-events-none fixed inset-0 z-0" aria-hidden />
      <div className="relative z-10 flex-1 overflow-y-auto">
        <PullSheetClient
          eventId={eventId}
          eventTitle={event.title ?? 'Untitled'}
          startsAt={event.starts_at ?? ''}
          venue={event.venue_name ?? null}
          gearItems={pullSheet?.gear ?? []}
          crewItems={pullSheet?.crew ?? []}
        />
      </div>
    </div>
  );
}
