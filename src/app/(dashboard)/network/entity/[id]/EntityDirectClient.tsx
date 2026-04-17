'use client';

/**
 * EntityDirectClient — minimal read-first view for a directory.entities row
 * that isn't reachable via the workspace-relationship-based route.
 *
 * Covers cases where `/network/entity/[id]` gets an entity id directly
 * (e.g. clicking a person in a partner company's Crew tab) instead of a
 * workspace-to-org relationship id. The existing EntityStudioClient
 * dispatcher assumes the latter and would redirect; this page renders the
 * shared EntityOverviewCards stack so the user at least sees the person's
 * Brief, Working notes, capture timeline, and productions.
 *
 * Full-edit forms (FreelancerEntityForm, etc.) still require a relationship
 * context to work — reaching those is future work, not in scope here.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Building2, MapPin, Users } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { EntityOverviewCards } from '@/widgets/network-detail/ui/EntityOverviewCards';

export type EntityDirectClientProps = {
  entityId: string;
  workspaceId: string;
  entityType: 'person' | 'company' | 'venue' | 'couple';
  displayName: string | null;
  avatarUrl: string | null;
  returnPath: string;
};

export function EntityDirectClient({
  entityId,
  workspaceId,
  entityType,
  displayName,
  avatarUrl,
  returnPath,
}: EntityDirectClientProps) {
  const router = useRouter();

  const Icon =
    entityType === 'person' || entityType === 'couple'
      ? User
      : entityType === 'venue'
        ? MapPin
        : entityType === 'company'
          ? Building2
          : Users;

  const typeLabel =
    entityType === 'person' ? 'Person'
      : entityType === 'couple' ? 'Couple'
      : entityType === 'venue' ? 'Venue'
      : entityType === 'company' ? 'Company'
      : 'Contact';

  return (
    <div className="min-h-screen bg-[var(--stage-void)] pb-32">
      <header className="sticky top-0 z-20 bg-[var(--stage-void)] border-b border-[var(--stage-edge-subtle)] px-6 py-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(returnPath)}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" strokeWidth={1.5} />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] overflow-hidden">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <Icon className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0">
            <p className="stage-label text-[var(--stage-text-tertiary)]">{typeLabel}</p>
            <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
              {displayName ?? 'Unnamed'}
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <EntityOverviewCards
          workspaceId={workspaceId}
          entityId={entityId}
          entityType={entityType}
          entityName={displayName}
          density="page"
        />
      </div>
    </div>
  );
}
