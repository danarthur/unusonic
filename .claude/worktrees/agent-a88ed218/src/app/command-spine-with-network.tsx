'use client';

import { searchNetworkOrgs, summonPartner } from '@/features/network-data';
import { ConditionalCommandSpine } from '@/shared/ui/command-spine/conditional-command-spine';

/**
 * Wires network feature into the shared command spine from the app layer (FSD-compliant).
 * Layout uses this instead of ConditionalCommandSpine so shared never imports features.
 */
export function CommandSpineWithNetwork() {
  return (
    <ConditionalCommandSpine
      network={{
        searchNetworkOrgs: async (orgId, query) => searchNetworkOrgs(orgId, query),
        summonPartner: async (orgId, partnerId, role) =>
          summonPartner(orgId, partnerId, role as 'vendor' | 'venue' | 'client' | 'partner'),
      }}
    />
  );
}
