'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { StreamLayout } from '@/widgets/network-stream';
import { networkQueries } from '@/features/network-data/api/queries';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import type { NetworkNode } from '@/entities/network';

interface NetworkOrbitViewProps {
  nodes: NetworkNode[];
  onUnpin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  onPin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  sourceOrgId: string;
  /** When true, Genesis Card 1 shows as completed (Establish Identity done). */
  hasIdentity?: boolean;
  /** When true, Genesis Card 2 shows as completed; Card 3 (Connection) becomes active. */
  hasTeam?: boolean;
  /** Org brand color for completed Identity card. */
  brandColor?: string | null;
  onOpenOmni?: () => void;
  onOpenProfile?: () => void;
}

/**
 * Client wrapper: card click pushes ?nodeId=&kind= to URL; sheet is driven by details from server.
 */
export function NetworkOrbitView({ nodes, onUnpin, onPin, sourceOrgId, hasIdentity = false, hasTeam = false, brandColor = null, onOpenOmni, onOpenProfile }: NetworkOrbitViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();

  const handleNodeClick = (node: NetworkNode) => {
    router.push(`/network?nodeId=${encodeURIComponent(node.id)}&kind=${encodeURIComponent(node.kind)}`);
  };

  // Hover prefetch — by the time the click lands, the network-detail bundle
  // is already warm in TanStack Query cache. The 150ms intent delay lives in
  // StreamLayout so accidental fly-overs don't trigger fetches.
  // perf-patterns.md §4.
  const handleNodeHover = useCallback(
    (node: NetworkNode) => {
      if (!workspaceId) return;
      queryClient.prefetchQuery(
        networkQueries.nodeDetail(workspaceId, node.id, node.kind, sourceOrgId),
      );
    },
    [queryClient, workspaceId, sourceOrgId],
  );

  return (
    <>
      <StreamLayout
        nodes={nodes}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onUnpin={onUnpin}
        onPin={onPin}
        hasIdentity={hasIdentity}
        hasTeam={hasTeam}
        brandColor={brandColor}
        onOpenOmni={onOpenOmni}
        onOpenProfile={onOpenProfile}
      />
    </>
  );
}
