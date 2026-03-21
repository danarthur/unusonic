import { getNetworkNodeDetails } from '@/features/network-data';
import { NetworkDetailSheet } from './NetworkDetailSheet';

interface NetworkDetailSheetAsyncProps {
  nodeId: string;
  kind: 'internal_employee' | 'external_partner';
  sourceOrgId: string;
}

/** Async server component: fetches details and renders the sheet. Used with Suspense. */
export async function NetworkDetailSheetAsync({
  nodeId,
  kind,
  sourceOrgId,
}: NetworkDetailSheetAsyncProps) {
  const details = await getNetworkNodeDetails(nodeId, kind, sourceOrgId);
  if (!details) return null;
  return <NetworkDetailSheet details={details} sourceOrgId={sourceOrgId} />;
}
