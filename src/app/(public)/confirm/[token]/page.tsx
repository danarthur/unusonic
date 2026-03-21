/**
 * Crew confirmation page — public, no auth required.
 * Crew member clicks link in their assignment email → sees event details → confirms or declines.
 * Route: /confirm/[token]?action=confirmed|declined
 */

import { notFound } from 'next/navigation';
import { getCrewTokenDetails } from '@/features/crew-notifications/api/confirm-crew-token';
import { ConfirmPageClient } from '@/features/crew-notifications/ui/ConfirmPageClient';

export const dynamic = 'force-dynamic';

export default async function CrewConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const { action } = await searchParams;

  const details = await getCrewTokenDetails(token);
  if (!details) notFound();

  const initialAction =
    action === 'confirmed' ? 'confirmed' :
    action === 'declined' ? 'declined' :
    null;

  return <ConfirmPageClient details={details} initialAction={initialAction} />;
}
