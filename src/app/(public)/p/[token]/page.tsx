/**
 * Public Proposal Viewer (Client Portal)
 * Route: /p/[token] – no auth, no AppShell. Fetches by public_token.
 * Injects workspace-specific portal theme CSS variables.
 */

import { notFound } from 'next/navigation';
import { getPublicProposal } from '@/features/sales/api/get-public-proposal';
import { PublicProposalView } from '@/features/sales/ui/public/PublicProposalView';
import { PortalThemeShell } from '@/shared/ui/portal-theme-shell';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';

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

  return (
    <PortalThemeShell
      preset={data.workspace.portalThemePreset}
      config={data.workspace.portalThemeConfig as PortalThemeConfig | null}
    >
      <PublicProposalView data={data} token={token} />
    </PortalThemeShell>
  );
}
