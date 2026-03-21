'use server';

import { getEventDetails } from '../api/get-event-details';
import type { EventDetailDTO } from '../model/event-detail';

/**
 * Server action for client components to fetch full event dossier.
 */
export async function fetchEventDetailsAction(eventId: string): Promise<EventDetailDTO | null> {
  return getEventDetails(eventId);
}
