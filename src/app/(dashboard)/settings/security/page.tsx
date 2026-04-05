/**
 * Security settings – passkeys, Safety Net guardians, and team access posture.
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { SecuritySection } from './SecuritySection';
import { getTeamAccessData, type TeamAccessMember } from '@/features/auth/passkey-management/api/team-access';

export const metadata = {
  title: 'Security | Unusonic',
  description: 'Passkeys, Safety Net recovery, and team access',
};

export const dynamic = 'force-dynamic';

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch personal security data + workspace membership in parallel
  const [profileRes, recoveryRes, memberRes] = await Promise.all([
    supabase.from('profiles').select('has_recovery_kit').eq('id', user.id).maybeSingle(),
    supabase.from('recovery_requests').select('id, timelock_until').eq('owner_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id).limit(1).maybeSingle(),
  ]);

  const hasRecoveryKit = profileRes.data?.has_recovery_kit ?? false;
  const pendingRecovery = recoveryRes.data ?? null;

  // Fetch team access data if user is owner/admin
  let teamAccess: TeamAccessMember[] | null = null;
  const workspaceId = memberRes.data?.workspace_id;
  const callerRole = memberRes.data?.role;

  if (workspaceId && (callerRole === 'owner' || callerRole === 'admin')) {
    teamAccess = await getTeamAccessData(workspaceId);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-6">
        Security
      </h1>
      <SecuritySection
        hasRecoveryKit={hasRecoveryKit}
        pendingRecoveryRequest={pendingRecovery}
        teamAccess={teamAccess}
      />
    </div>
  );
}
