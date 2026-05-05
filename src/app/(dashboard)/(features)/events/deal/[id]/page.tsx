import { redirect } from 'next/navigation';

/**
 * Legacy deal detail route.
 *
 * The real deal experience lives at /events?selected=<dealId> (Prism Deal lens).
 * This file used to render a stub read-only view with no tabs, Prism, Production
 * Team Card, or handoff button — a trap for any caller that treated /events/deal/[id]
 * as the canonical URL for a deal. Redirect to the canonical route instead so all
 * inbound links land on the full Deal experience.
 */
export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
  redirect(`/events?selected=${dealId}`);
}
