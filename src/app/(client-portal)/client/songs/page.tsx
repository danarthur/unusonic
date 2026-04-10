/**
 * Client portal songs placeholder.
 *
 * Route: /client/songs
 *
 * Phase 0.5: placeholder only. The real page is the Songs punch list
 * item in the session doc (~12-16 hrs) — 3 SECURITY DEFINER RPCs,
 * added_by field on SongEntry, a client-safe projection, reuse of
 * SongSearchInput from the employee portal, and a step-up gate. Ships
 * before go-live, not before Phase 0.5 chrome.
 *
 * @module app/(client-portal)/client/songs/page
 */
import 'server-only';

import Link from 'next/link';

import { getClientPortalContext } from '@/shared/lib/client-portal';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';

export default async function ClientSongsPage() {
  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) return null;

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
          Songs
        </h1>

        <p
          className="text-sm"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
        >
          This is where you&rsquo;ll share requests, must-plays, and songs to
          avoid. Your DJ will see everything you add here and build it into
          the night&rsquo;s timeline.
        </p>
        <p
          className="text-sm"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
        >
          Coming soon — we&rsquo;re putting the finishing touches on this.
        </p>
      </div>
    </ClientPortalShell>
  );
}
