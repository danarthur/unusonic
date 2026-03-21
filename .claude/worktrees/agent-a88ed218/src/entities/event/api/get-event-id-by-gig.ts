/**
 * @deprecated events.gig_id was removed in unification. Use event id directly.
 * Returns null; kept for type compatibility only.
 */
import 'server-only';

export async function getEventIdByGigId(_gigId: string): Promise<string | null> {
  return null;
}
