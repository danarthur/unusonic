/**
 * Identity Architect – Establish Identity (Card 1).
 * Forge & Preview: left = form, right = live mirror with 3D tilt and brand glow.
 */

import { redirect } from 'next/navigation';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { getOrgDetails } from '@/features/org-management/api';
import { IdentityArchitect } from '@/features/org-identity';

export const metadata = {
  title: 'Establish Identity | Settings | Signal',
  description: 'Craft the artifact that other companies see when they connect with you.',
};

export const dynamic = 'force-dynamic';

export default async function IdentityPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    redirect('/settings');
  }

  const org = await getOrgDetails(orgId);
  if (!org) {
    redirect('/settings');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-64px)] min-h-0">
      <IdentityArchitect org={org} />
    </div>
  );
}
