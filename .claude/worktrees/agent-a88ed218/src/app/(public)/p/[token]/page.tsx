/**
 * Public Proposal Viewer (Client Portal)
 * Route: /p/[token] – no auth, no AppShell. Fetches by public_token.
 */

import { notFound } from 'next/navigation';
import { getPublicProposal } from '@/features/sales/api/get-public-proposal';
import { PublicProposalView } from '@/features/sales/ui/public/PublicProposalView';

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const data = await getPublicProposal(token);

  if (!data) {
    notFound();
  }

  return <PublicProposalView data={data} token={token} />;
}
