'use client';

import { DispatchSummary } from './dispatch-summary';
import type { EventSummaryForPrism } from '../actions/get-event-summary';

type PlanLensProps = {
  eventId: string;
  event: EventSummaryForPrism;
  /** Called when flight check status is updated so the parent can refetch event summary. */
  onEventUpdated?: () => void;
};

export function PlanLens({ eventId, event, onEventUpdated }: PlanLensProps) {
  return (
    <DispatchSummary
      eventId={eventId}
      event={event}
      onFlightCheckUpdated={onEventUpdated}
    />
  );
}
