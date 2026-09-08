'use client';

/**
 * The right-hand column of the entity studio: the complete records.
 *
 * This is the second of the three reasons the full page exists next to the
 * slide-over panel. The panel shows the top few of each and a count, because a
 * drawer has no room for more; this is where all of them live, with the space
 * to filter and page through them.
 *
 * Kept beside the editing column rather than beneath it -- a drawer stacks, a
 * page juxtaposes, and being able to change a fact while the history that
 * justifies it stays in view is the thing the panel structurally cannot do.
 *
 * @module app/network/entity/EntityRecordsAside
 */

import { FinancePanel } from './entity-studio-panels';
import { EntityAssignments } from '@/widgets/network-detail/ui/EntityAssignments';
import { EntityProductions } from '@/widgets/network-detail/ui/EntityProductions';
import { EntityDocumentsCard } from '@/features/network-data/ui/entity-documents-card';

export interface EntityRecordsAsideProps {
  entityId: string | null;
  entityType: 'person' | 'company' | 'venue' | null;
  workspaceId: string | null;
}

export function EntityRecordsAside({ entityId, entityType, workspaceId }: EntityRecordsAsideProps) {
  if (!entityId) return null;

  return (
    <aside className="min-w-0 space-y-3">
      <EntityAssignments entityId={entityId} variant="full" />
      {workspaceId && (
        <EntityProductions workspaceId={workspaceId} entityId={entityId} variant="full" />
      )}
      <FinancePanel entityId={entityId} />
      {workspaceId && (
        <EntityDocumentsCard
          entityId={entityId}
          entityType={entityType ?? 'company'}
          workspaceId={workspaceId}
        />
      )}
    </aside>
  );
}
