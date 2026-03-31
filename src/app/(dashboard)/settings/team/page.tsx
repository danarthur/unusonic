/**
 * Team Roster – Forge the Roster (Genesis Step 2).
 * Personnel cards: Captain, Ghost slots, batch Send Invites.
 */

import { redirect } from 'next/navigation';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { PersistOrgCookie } from '@/features/network/ui/PersistOrgCookie';
import { getRoster, getCurrentUserOrgRole } from '@/features/team-invite/api/actions';
import { TeamRoster } from '@/features/team-invite';

export const metadata = {
  title: 'Team | Settings | Unusonic',
  description: 'Add members. Send invites when ready.',
};

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect('/settings');

  const [{ members, captainId }, role] = await Promise.all([
    getRoster(orgId),
    getCurrentUserOrgRole(orgId),
  ]);
  const canAssignAdmin = role === 'owner' || role === 'admin';

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full px-5 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-5 max-w-4xl mx-auto w-full box-border">
      <PersistOrgCookie orgId={orgId} />
      <TeamRoster
        orgId={orgId}
        initialMembers={members}
        captainId={captainId}
        canAssignAdmin={canAssignAdmin}
      />
    </div>
  );
}
