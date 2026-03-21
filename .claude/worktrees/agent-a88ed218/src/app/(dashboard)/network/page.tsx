/**
 * Network Orbit – Unified Command Stream: Core (employees) + Membrane + Inner Circle (partners).
 * Detail view is URL-driven: ?nodeId= & kind= opens the Glass Slide-Over.
 */

import { unstable_noStore } from 'next/cache';
import { Suspense } from 'react';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { PersistOrgCookie } from '@/features/network/ui/PersistOrgCookie';
import { getOrgDetails } from '@/features/org-management/api';
import { getNetworkStream, getDeletedRelationships, unpinFromInnerCircle } from '@/features/network-data';
import { NetworkDetailSheetWithSuspense } from '@/widgets/network-detail';
import { NetworkOrbitWithGenesis } from './NetworkOrbitWithGenesis';
import { NetworkGenesisNoOrg } from './NetworkGenesisNoOrg';
import { SetCommandPaletteOrg } from './SetCommandPaletteOrg';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ nodeId?: string; kind?: string }>;
};

export default async function NetworkPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<NetworkPageSkeleton />}>
      <NetworkPageInner searchParams={searchParams} />
    </Suspense>
  );
}

function NetworkPageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
      <div className="shrink-0">
        <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      </div>
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <div className="h-32 w-32 animate-pulse rounded-full bg-white/5" />
      </div>
    </div>
  );
}

async function NetworkPageInner({ searchParams }: PageProps) {
  unstable_noStore();
  let currentOrgId: string | null = null;
  try {
    currentOrgId = await getCurrentOrgId();
  } catch (err) {
    console.error('[Network] getCurrentOrgId failed:', err);
    return <NetworkGenesisNoOrg />;
  }
  if (!currentOrgId) {
    return <NetworkGenesisNoOrg />;
  }

  const params = await searchParams;
  const nodeId = params?.nodeId ?? null;
  const kind =
    params?.kind === 'external_partner' || params?.kind === 'internal_employee'
      ? params.kind
      : null;

  let nodes: Awaited<ReturnType<typeof getNetworkStream>> = [];
  let org: Awaited<ReturnType<typeof getOrgDetails>> = null;
  let deletedRelationships: Awaited<ReturnType<typeof getDeletedRelationships>> = [];
  try {
    [nodes, org, deletedRelationships] = await Promise.all([
      getNetworkStream(currentOrgId),
      getOrgDetails(currentOrgId),
      getDeletedRelationships(currentOrgId),
    ]);
  } catch (err) {
    console.error('[Network] Data fetch failed:', err);
  }

  const hasIdentity = !!(org?.name?.trim());
  const coreNodes = nodes.filter((n) => n.kind === 'internal_employee');
  const hasTeam = coreNodes.length > 1;
  const brandColor = org?.brand_color ?? null;
  const orgName = org?.name ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
      <PersistOrgCookie orgId={currentOrgId} />
      <SetCommandPaletteOrg orgId={currentOrgId} />
      <NetworkOrbitWithGenesis
        currentOrgId={currentOrgId}
        orgName={orgName}
        nodes={nodes}
        hasIdentity={hasIdentity}
        hasTeam={hasTeam}
        brandColor={brandColor}
        onUnpin={unpinFromInnerCircle}
        deletedRelationships={deletedRelationships}
      />
      {nodeId && kind && (
        <NetworkDetailSheetWithSuspense
          nodeId={nodeId}
          kind={kind}
          sourceOrgId={currentOrgId}
        />
      )}
    </div>
  );
}
