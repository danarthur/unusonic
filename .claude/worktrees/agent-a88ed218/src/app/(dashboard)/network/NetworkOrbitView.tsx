'use client';

import { useRouter } from 'next/navigation';
import { StreamLayout } from '@/widgets/network-stream';
import type { NetworkNode } from '@/entities/network';

interface NetworkOrbitViewProps {
  nodes: NetworkNode[];
  onUnpin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
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
export function NetworkOrbitView({ nodes, onUnpin, sourceOrgId, hasIdentity = false, hasTeam = false, brandColor = null, onOpenOmni, onOpenProfile }: NetworkOrbitViewProps) {
  const router = useRouter();

  const handleNodeClick = (node: NetworkNode) => {
    router.push(`/network?nodeId=${encodeURIComponent(node.id)}&kind=${encodeURIComponent(node.kind)}`);
  };

  return (
    <>
      <StreamLayout
        nodes={nodes}
        onNodeClick={handleNodeClick}
        onUnpin={onUnpin}
        hasIdentity={hasIdentity}
        hasTeam={hasTeam}
        brandColor={brandColor}
        onOpenOmni={onOpenOmni}
        onOpenProfile={onOpenProfile}
      />
    </>
  );
}
