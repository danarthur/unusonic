/**
 * Client portal proposal wrapper.
 *
 * Route: /client/proposal/[id]
 *
 * Phase 0.5 scope: a session-authed discovery page that confirms the
 * proposal the client is looking at and routes them into the full public
 * proposal view (/p/[token]) for the actual document. The full viewer
 * already handles theme, signing, and deposit payment under
 * PortalThemeShell — we don't want to duplicate that here.
 *
 * Phase 1 will inline the full PublicProposalView inside ClientPortalShell
 * so the chrome is consistent across all surfaces.
 *
 * See client-portal-design.md §16.1.
 */
import 'server-only';

import Link from 'next/link';

import { getSystemClient } from '@/shared/api/supabase/system';
import { getClientPortalContext } from '@/shared/lib/client-portal';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';

type ProposalRow = {
  id: string;
  public_token: string;
  status: string;
  signed_at: string | null;
  workspace_id: string;
};

export default async function ClientProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) return null;

  const supabase = getSystemClient();
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, public_token, status, signed_at, workspace_id')
    .eq('id', id)
    .eq('workspace_id', context.activeEntity.ownerWorkspaceId)
    .maybeSingle<ProposalRow>();

  const workspace = await getClientPortalWorkspaceSummary(
    context.activeEntity.ownerWorkspaceId,
  );

  return (
    <ClientPortalShell
      workspace={workspace}
      header={<ClientPortalHeader workspace={workspace} />}
      footer={<ClientPortalFooter />}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
        <Link
          href="/client/home"
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
        >
          ← Home
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
            We couldn&rsquo;t find that proposal. It may have been revoked or moved — ask your coordinator for a fresh link.
          </p>
        )}
      </div>
    </ClientPortalShell>
  );
}
