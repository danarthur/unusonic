/**
 * Event Command Center – Home base for a specific event.
 * High-density Liquid Ceramic Bento Grid: Identity, Logistics, Stakeholders, Tech.
 * [id] = event id (UUID from events table).
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getEventCommand } from '@/entities/event';
import { EventCommandGrid } from '@/widgets/event-dashboard';

export default async function EventCommandCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await getEventCommand(id);

  if (!event) {
    notFound();
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
        <Link
          href="/calendar"
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Back to Calendar"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
            Event Command Center
          </p>
          <p className="text-sm text-ink truncate">{event.title ?? event.internal_code ?? id}</p>
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
