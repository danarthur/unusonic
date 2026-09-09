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
import { EntityOverviewCards } from '@/widgets/network-detail/ui/EntityOverviewCards';
import { EntityRecordShell } from './EntityRecordShell';

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
  const typeLabel =
    entityType === 'person' ? 'Person'
      : entityType === 'couple' ? 'Couple'
      : entityType === 'venue' ? 'Venue'
      : 'Company';

  return (
    <EntityRecordShell
      entityId={entityId}
      entityType={entityType === 'couple' ? 'person' : entityType}
      workspaceId={workspaceId}
      name={displayName ?? 'Unnamed'}
      eyebrow={typeLabel}
      avatarUrl={avatarUrl}
      avatarType={entityType}
      returnPath={returnPath}
    >
      <EntityOverviewCards
        workspaceId={workspaceId}
        entityId={entityId}
        entityType={entityType}
        entityName={displayName}
        density="page"
      />
    </EntityRecordShell>
  );
}
