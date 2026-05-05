/**
 * Admin preview — client portal proposal page.
 *
 * Read-only render of /client/proposal/[id] for admin QA.
 * Mirrors the real proposal page: status message + link to the full
 * public proposal view at /p/[token].
 *
 * @module app/(dashboard)/(features)/preview/client/[entityId]/proposal/[proposalId]/page
 */
import 'server-only';

import Link from 'next/link';

import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyPreviewAccess } from '@/shared/lib/preview-access';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { PreviewBanner } from '@/features/client-portal/ui/preview-banner';

type ProposalRow = {
  id: string;
  public_token: string;
  status: string;
  signed_at: string | null;
};

export default async function PreviewClientProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string; proposalId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { entityId, proposalId } = await params;
  const { from: fromDealId } = await searchParams;
  const entity = await verifyPreviewAccess(entityId);
  const exitHref = fromDealId
    ? `/events?stream=active&selected=${fromDealId}`
    : '/events';
  const homeHref = fromDealId
    ? `/preview/client/${entityId}?from=${fromDealId}`
    : `/preview/client/${entityId}`;

  const system = getSystemClient();
  const { data: proposalData } = await system
    .from('proposals')
    .select('id, public_token, status, signed_at')
    .eq('id', proposalId)
    .eq('workspace_id', entity.ownerWorkspaceId)
    .maybeSingle();

  const proposal = proposalData as ProposalRow | null;
  const workspace = await getClientPortalWorkspaceSummary(entity.ownerWorkspaceId);

  return (
    <>
      <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
      <ClientPortalShell
        workspace={workspace}
        header={<ClientPortalHeader workspace={workspace} />}
        footer={<ClientPortalFooter />}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
          <Link
            href={homeHref}
            className="text-xs uppercase tracking-[0.14em]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            &larr; Home
          </Link>

          <h1
            className="text-3xl font-medium tracking-tight"
            style={{
              color: 'var(--portal-text, var(--stage-text-primary))',
              fontFamily: 'var(--portal-font-heading, var(--font-sans))',
            }}
          >
            Your proposal
          </h1>

          {proposal ? (
            <>
              <p
                className="text-sm"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
              >
                {proposal.signed_at
                  ? 'Signed and confirmed. Open the document anytime to revisit the scope.'
                  : 'Ready for your review. Open the document to read through and sign.'}
              </p>
              <Link
                href={`/p/${proposal.public_token}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-full px-6 text-sm font-medium sm:w-auto"
                style={{
                  backgroundColor: 'var(--portal-accent, var(--stage-accent))',
                  color: 'var(--portal-accent-text, var(--stage-text-on-accent))',
                }}
              >
                {proposal.signed_at ? 'Open signed proposal' : 'Open proposal'}
              </Link>
            </>
          ) : (
            <p
              className="text-sm"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
            >
              Proposal not found for this client.
            </p>
          )}
        </div>
      </ClientPortalShell>
    </>
  );
}
