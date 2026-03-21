import { notFound } from 'next/navigation';
import { getEventSummary } from '@/entities/event';
import { RunOfShowClient } from './run-of-show-client';

export default async function RunOfShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const event = await getEventSummary(eventId);

  if (!event) {
    notFound();
  }

  return <RunOfShowClient eventId={eventId} initialEvent={event} />;
}
