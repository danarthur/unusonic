import { Suspense } from 'react';
import { NetworkDetailSheetAsync } from './NetworkDetailSheetAsync';
import { NetworkDetailSheetSkeleton } from './NetworkDetailSheetSkeleton';

interface NetworkDetailSheetWithSuspenseProps {
  nodeId: string;
  kind: 'internal_employee' | 'extended_team' | 'external_partner';
  sourceOrgId: string;
  returnPath?: string;
}

/** Server component: wraps async sheet fetch in Suspense; shows skeleton while loading. */
export function NetworkDetailSheetWithSuspense({
  nodeId,
  kind,
  sourceOrgId,
  returnPath,
}: NetworkDetailSheetWithSuspenseProps) {
  return (
    <Suspense fallback={<NetworkDetailSheetSkeleton />}>
        <NetworkDetailSheetAsync
          nodeId={nodeId}
          kind={kind}
          sourceOrgId={sourceOrgId}
          returnPath={returnPath}
        />
    </Suspense>
  );
}
