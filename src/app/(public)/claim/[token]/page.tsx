/**
 * Claim Gateway — the invite surface.
 *
 * Route: `/claim/[token]`
 *
 * Invited users land here from the email button. The page resolves the
 * invitation token server-side, classifies the device from the User-Agent,
 * and renders either:
 *
 *   - `ClaimError`          — invalid / used / expired token
 *   - `ClaimWizard`         — partner_summon (org-owner claim flow)
 *   - `ClaimView`           — employee or org-member invite
 *
 * Design spec: `docs/reference/login-redesign-design.md` §5.
 * Phase 3 of `docs/reference/login-redesign-implementation-plan.md`.
 *
 * @module app/(public)/claim/[token]/page
 */

import { headers } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { getInvitationForClaim } from '@/features/summoning';
import { validateInvitation } from '@/features/network/api/actions';
import { ClaimError } from '@/features/summoning/ui/ClaimError';
import { ClaimView } from '@/features/network/ui/ClaimView';
import { ClaimWizard } from '@/widgets/onboarding/ClaimWizard';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import { deviceCapabilityFromUserAgentClass } from '@/shared/lib/auth/device-copy';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Accept invite — Unusonic',
};

const pageClass =
  'relative flex min-h-dvh w-full flex-col items-center justify-center px-4 py-10 sm:px-6 bg-stage-void';
const safeAreaStyle = {
  paddingLeft: 'max(1rem, env(safe-area-inset-left))',
  paddingRight: 'max(1rem, env(safe-area-inset-right))',
  paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
} as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={pageClass} style={safeAreaStyle} data-surface="void" data-density="spacious">
      {/* Spotlight / cove light, opaque matte — matches /login per Stage Engineering spec. */}
      <div className="fixed inset-0 z-0 bg-[var(--stage-void)] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Device-aware copy resolution — classify once, server-side. The Next.js
  // `headers()` API is async in Next 16 so we await it.
  const reqHeaders = await headers();
  const uaClass = classifyUserAgent(reqHeaders.get('user-agent'));
  const deviceCapability = deviceCapabilityFromUserAgentClass(uaClass);

  // Initial token resolution — the `getInvitationForClaim` helper works for
  // anon users (reads from the invitations row + payload), so a bad token
  // dead-ends here before we do any more work.
  const result = await getInvitationForClaim(token);
  if (!result.ok) {
    return (
      <Shell>
        <ClaimError message={result.error} title="Link invalid or expired" />
      </Shell>
    );
  }

  const { invitation } = result;

  // Partner-summon is a distinct flow (handshake → keys → claim) that
  // predates the Phase 3 redesign. Its wizard now uses Stage Engineering
  // primitives but the logic path is unchanged.
  if (invitation.type === 'partner_summon') {
    return (
      <Shell>
        <ClaimWizard invitation={invitation} />
      </Shell>
    );
  }

  const isEmployeeInvite = invitation.type === 'employee_invite';

  // Full summary — workspace, inviter, role. This is the Phase 3 shape.
  const validation = await validateInvitation(token);
  if (!validation.ok) {
    return (
      <Shell>
        <ClaimError message={validation.error} token={token} />
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  return (
    <Shell>
      <ClaimView
        token={token}
        summary={{
          workspaceId: validation.workspaceId,
          workspaceName: validation.workspaceName,
          workspaceLogoUrl: validation.workspaceLogoUrl,
          inviterDisplayName: validation.inviterDisplayName,
          inviterEntityId: validation.inviterEntityId,
          role: validation.role,
          email: validation.email,
          expiresAt: validation.expiresAt,
        }}
        isAuthenticated={isAuthenticated}
        isEmployeeInvite={isEmployeeInvite}
        userEmail={user?.email ?? null}
        deviceCapability={deviceCapability}
      />
    </Shell>
  );
}
