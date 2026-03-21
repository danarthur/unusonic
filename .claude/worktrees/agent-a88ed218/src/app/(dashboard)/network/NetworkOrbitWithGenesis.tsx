'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { NetworkInviteTrigger } from '@/features/talent-onboarding';
import { GhostForgeSheet } from '@/features/network-data';
import { SignalIONInput } from '@/widgets/network-detail';
import { NetworkOrbitClient } from './NetworkOrbitClient';
import { NetworkOrbitView } from './NetworkOrbitView';
import { RecentlyDeletedList } from './RecentlyDeletedList';
import type { NetworkNode } from '@/entities/network';
import type { DeletedRelationship } from '@/features/network-data';

interface NetworkOrbitWithGenesisProps {
  currentOrgId: string;
  /** Display name of the linked org (for "Linked: …" in header). */
  orgName?: string | null;
  nodes: NetworkNode[];
  /** When true, Genesis Card 1 (Establish Identity) shows as completed. */
  hasIdentity?: boolean;
  /** When true, Genesis Card 2 (Assemble Core) shows as completed; Card 3 becomes the active target. */
  hasTeam?: boolean;
  /** Org brand color for completed Identity card (solid border/icon). */
  brandColor?: string | null;
  onUnpin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Soft-deleted connections (restore within 30 days). */
  deletedRelationships?: DeletedRelationship[];
}

/**
 * Client shell: owns OmniSearch open state so Genesis "Summon Partner" can trigger it.
 * Renders header (with controlled OmniSearch) + NetworkOrbitView (with onOpenOmni / onOpenProfile).
 */
export function NetworkOrbitWithGenesis({
  currentOrgId,
  orgName = null,
  nodes,
  hasIdentity = false,
  hasTeam = false,
  brandColor = null,
  onUnpin,
  deletedRelationships = [],
}: NetworkOrbitWithGenesisProps) {
  const router = useRouter();
  const [omniOpen, setOmniOpen] = React.useState(false);
  const [forge, setForge] = React.useState<{ isOpen: boolean; name: string }>({ isOpen: false, name: '' });

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      <header className="shrink-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-[var(--color-ink)]">
              Network
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Your team and partners.
            </p>
            {orgName?.trim() && (
              <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--color-silk)]/90" aria-label="Linked organization">
                {orgName.trim()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NetworkInviteTrigger orgId={currentOrgId} />
            <NetworkOrbitClient
              orgId={currentOrgId}
              open={omniOpen}
              onOpenChange={setOmniOpen}
              onOpenForge={(name) => {
                setOmniOpen(false);
                setForge({ isOpen: true, name });
              }}
            />
          </div>
        </div>
        {deletedRelationships.length > 0 && (
          <RecentlyDeletedList deletedRelationships={deletedRelationships} sourceOrgId={currentOrgId} />
        )}
      </header>
      <div className="flex flex-1 min-h-0">
        <NetworkOrbitView
          nodes={nodes}
          onUnpin={onUnpin}
          sourceOrgId={currentOrgId}
          hasIdentity={hasIdentity}
          hasTeam={hasTeam}
          brandColor={brandColor}
          onOpenOmni={() => setOmniOpen(true)}
          onOpenProfile={() => router.push('/settings/identity')}
        />
      </div>
      <GhostForgeSheet
        isOpen={forge.isOpen}
        onOpenChange={(open) => setForge((prev) => ({ ...prev, isOpen: open }))}
        initialName={forge.name}
        sourceOrgId={currentOrgId}
        ScoutInputComponent={SignalIONInput}
      />
    </div>
  );
}
