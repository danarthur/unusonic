/**
 * Claim Gateway – The Airlock. Public route for accepting an org or partner invitation.
 * Fetch by token → invalid: ClaimError; valid partner_summon: ClaimWizard; valid employee: ClaimView.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getInvitationForClaim } from '@/features/summoning';
import { validateInvitation } from '@/features/network/api/actions';
import { ClaimError } from '@/features/summoning/ui/ClaimError';
import { ClaimView } from '@/features/network/ui/ClaimView';
import { ClaimWizard } from '@/widgets/onboarding/ClaimWizard';

export const dynamic = 'force-dynamic';

const claimLayoutClass = 'flex min-h-dvh w-full flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12';
const safeAreaStyle = {
  paddingLeft: 'max(1rem, env(safe-area-inset-left))',
  paddingRight: 'max(1rem, env(safe-area-inset-right))',
  paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
} as const;

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = await getInvitationForClaim(token);
  if (!result.ok) {
    return (
      <div className={claimLayoutClass} style={safeAreaStyle}>
        <ClaimError message={result.error} />
      </div>
    );
  }

  const { invitation } = result;
  if (invitation.type === 'partner_summon') {
    return (
      <div className={claimLayoutClass} style={safeAreaStyle}>
        <ClaimWizard invitation={invitation} />
      </div>
    );
  }

  const validation = await validateInvitation(token);
  if (!validation.ok) {
    return (
      <div className={claimLayoutClass} style={safeAreaStyle}>
        <ClaimError message="Invalid or expired link." />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  return (
    <div className={claimLayoutClass} style={safeAreaStyle}>
      <ClaimView
        token={token}
        email={validation.email}
        orgName={validation.org_name}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
