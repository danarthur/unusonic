import { NetworkDetailSheet } from './NetworkDetailSheet';

interface NetworkDetailSheetAsyncProps {
  nodeId: string;
  kind: 'internal_employee' | 'extended_team' | 'external_partner';
  sourceOrgId: string;
  returnPath?: string;
}

/** Passes params to NetworkDetailSheet which fetches via useQuery. */
export function NetworkDetailSheetAsync({
  nodeId,
  kind,
  sourceOrgId,
  returnPath,
}: NetworkDetailSheetAsyncProps) {
  return (
    <NetworkDetailSheet
      nodeId={nodeId}
      kind={kind}
      sourceOrgId={sourceOrgId}
      returnPath={returnPath}
    />
  );
}
