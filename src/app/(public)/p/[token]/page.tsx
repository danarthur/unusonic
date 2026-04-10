/**
 * Public Proposal Viewer (Client Portal)
 * Route: /p/[token] – no auth, no AppShell. Fetches by public_token.
 * Injects workspace-specific portal theme CSS variables.
 *
 * First-touch flow (see client-portal-design.md §15.1):
 *   - The proxy intercepts /p/<token> with no session cookie and redirects
 *     to /api/client-portal/mint-from-proposal which mints a session, sets
 *     the cookie, and redirects back here. By the time this page runs, the
 *     cookie is present (or the no-mint marker is set for lead-stage cases).
 *   - On return visits, we silently rotate the session in the DB (no cookie
 *     write — server components can't mutate cookies in Next.js 16).
 */

import { headers as nextHeaders } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPublicProposal } from '@/features/sales/api/get-public-proposal';
import { PublicProposalView } from '@/features/sales/ui/public/PublicProposalView';
import { PortalThemeShell } from '@/shared/ui/portal-theme-shell';
import { resolvePortalTheme, type PortalThemeConfig } from '@/shared/lib/portal-theme';
import { readSessionCookie } from '@/shared/lib/client-portal/cookies';
import { rotateClientPortalSession } from '@/shared/lib/client-portal/rotate-session';
import { logAccess } from '@/shared/lib/client-portal/audit';
import { ClientPortalReturnPill } from '@/features/client-portal/ui';

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

  // --- Client portal session rotation (return visits only) ---
  // First-touch minting happens in the proxy → mint handler → back here.
  // If we see a session cookie, it means the client is returning or has
  // just come back from the mint handler. Rotate the DB row silently.
  const existingSession = await readSessionCookie();
  if (existingSession) {
    const h = await nextHeaders();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null;
    const ua = h.get('user-agent');

    const rotateResult = await rotateClientPortalSession({ ip, userAgent: ua });

    if (rotateResult.ok) {
      // Fire-and-forget audit log for the (re)visit
      logAccess({
        entityId: rotateResult.entityId,
        workspaceId: data.workspace.id,
        resourceType: 'proposal',
        resourceId: data.proposal.id,
        action: 'view',
        actorKind: 'anonymous_token',
        authMethod: 'session_cookie',
        outcome: 'success',
        ip,
        userAgent: ua,
      }).catch(() => {});
    }
    // On rotation failure (revoked/expired), we fall through and render.
    // The stale cookie is harmless and the page still works via the public token.
  }

  const themeConfig = data.workspace.portalThemeConfig as PortalThemeConfig | null;
  const { tokens } = resolvePortalTheme(data.workspace.portalThemePreset, themeConfig);

  return (
    <PortalThemeShell
      preset={data.workspace.portalThemePreset}
      config={themeConfig}
    >
      {/* When the viewer is in a client portal session, show a return pill
          so they aren't stranded on the standalone proposal view. */}
      {existingSession && <ClientPortalReturnPill />}
      <PublicProposalView
        data={data}
        token={token}
        itemLayout={tokens.itemLayout as 'card' | 'row' | 'minimal'}
        sectionBgAlternate={tokens.sectionBgAlternate === 'true'}
        heroImageUrl={(themeConfig?.hero_image_url as string | undefined) ?? null}
        sectionTrim={tokens.sectionTrim as 'none' | 'wave' | 'angle' | 'dots' | 'straight'}
        accentBand={tokens.accentBand as 'none' | 'top' | 'bottom'}
      />
    </PortalThemeShell>
  );
}
