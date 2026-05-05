/**
 * Studio alias: /events/g/[id] → same as /events/[id] (unified events).
 * [id] is the event id. Renders EventCommandGrid.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEventCommand } from '@/entities/event';
import { EventCommandGrid } from '@/widgets/event-dashboard';

export default async function EventByGigPage({
  params,
}: {
  params: Promise<{ gigId: string }>;
}) {
  const { gigId: eventId } = await params;

  const event = await getEventCommand(eventId);

  if (!event) {
    redirect('/events');
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]">
        <Link
          href="/calendar"
          className="stage-hover overflow-hidden p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Back to Calendar"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">
            Event studio
          </p>
          <p className="text-sm text-[var(--stage-text-primary)] truncate">{event.title ?? eventId}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grain-overlay pointer-events-none fixed inset-0 z-0" aria-hidden />
        <div className="relative z-10">
          <EventCommandGrid event={event} />
        </div>
      </div>
    </div>
  );
}
