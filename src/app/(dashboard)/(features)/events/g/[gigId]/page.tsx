import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Legacy Gig Studio route.
 *
 * `/events/g/<eventId>` used to render the standalone Event Studio (the same
 * `EventCommandGrid` that `/events/[id]` renders). After the Plan-tab consolidation
 * the canonical surface for an event is the deal's Plan view at
 * `/events?selected=<dealId>`. Bare `[id]` is a trap because the Plan tab,
 * Prism lenses, Production Team Card and handoff button all live on the deal.
 *
 * Redirect to the deal's Plan view (resolved from `ops.events.deal_id`). When
 * the event has no deal_id (rare — direct event creation predates the
 * deal-first flow), fall back to `/events` so the user lands somewhere
 * recognizable instead of a half-rendered legacy Studio.
 *
 * Sub-routes under `/events/g/<gigId>/...` (e.g. `/pull-sheet`) keep working
 * because they own their own `page.tsx` files and Next.js does not propagate
 * this redirect to them.
 */
export default async function LegacyGigStudioPage({
  params,
}: {
  params: Promise<{ gigId: string }>;
}) {
  const { gigId: eventId } = await params;

  const supabase = await createClient();
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .maybeSingle();

  const dealId = event?.deal_id ?? null;
  redirect(dealId ? `/events?selected=${dealId}` : '/events');
}
