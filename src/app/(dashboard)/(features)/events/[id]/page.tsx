/**
 * Event Studio – Home base for a specific event.
 * High-density Liquid Ceramic Bento Grid: Identity, Logistics, Stakeholders, Tech.
 * [id] = event id (UUID from events table).
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getEventCommand } from '@/entities/event';
import { EventCommandGrid } from '@/widgets/event-dashboard';

function EventSkeleton() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]">
        <div className="h-10 w-10 rounded-xl stage-skeleton" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-20 rounded stage-skeleton" />
          <div className="h-4 w-48 rounded stage-skeleton" />
        </div>
      </header>
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 w-full rounded-xl stage-skeleton" />
        ))}
      </div>
    </div>
  );
}

export default async function EventCommandCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventContent id={id} />
    </Suspense>
  );
}

async function EventContent({ id }: { id: string }) {
  const event = await getEventCommand(id);

  if (!event) {
    notFound();
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]">
        <Link
          href="/calendar"
          className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
          aria-label="Back to Calendar"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">
            Event Studio
          </p>
          <p className="text-sm text-[var(--stage-text-primary)] truncate">{event.title ?? event.internal_code ?? id}</p>
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
