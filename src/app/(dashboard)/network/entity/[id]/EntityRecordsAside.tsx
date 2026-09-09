'use client';

/**
 * The right-hand column of the entity record page: everything that happened.
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
 * The rule that decides what lands here: records to the rail, knowledge to the
 * body. Assignments, productions, money, documents, referrals, the team and
 * the employment history are records of what happened. The brief, the notes
 * and the captures are what you think, and they sit in
 * [[EntityKnowledgeCards]] above the fields you edit.
 *
 * That is HubSpot's and Attio's arrangement rather than Polaris's -- on a
 * contact record the relationships are what you came for, so the wide column
 * goes to what you edit and the narrow one carries what you relate to.
 *
 * @module app/network/entity/EntityRecordsAside
 */

import { EntityAssignments } from '@/widgets/network-detail/ui/EntityAssignments';
import { EntityProductions } from '@/widgets/network-detail/ui/EntityProductions';
import { EntityMoney } from '@/widgets/network-detail/ui/EntityMoney';
import { ReferralsCard } from '@/widgets/network-detail/ui/ReferralsCard';
import { TeamCard } from '@/widgets/network-detail/ui/TeamCard';
import { EmploymentCard } from '@/widgets/network-detail/ui/EmploymentCard';
import { EntityDocumentsCard } from '@/features/network-data/ui/entity-documents-card';

export interface EntityRecordsAsideProps {
  entityId: string | null;
  entityType: 'person' | 'company' | 'venue' | null;
  workspaceId: string | null;
}

export function EntityRecordsAside({ entityId, entityType, workspaceId }: EntityRecordsAsideProps) {
  if (!entityId) return null;

  const isPerson = entityType === 'person';
  const isCompanyOrVenue = entityType === 'company' || entityType === 'venue';

  return (
    <aside className="min-w-0 space-y-3">
      {/* A company IS its people, so the faces come before the paperwork. */}
      {workspaceId && isCompanyOrVenue && (
        <TeamCard workspaceId={workspaceId} entityId={entityId} />
      )}
      {/* Append-only: moving someone ends the old edge rather than deleting it,
          so a past deal keeps explaining itself. */}
      {workspaceId && isPerson && (
        <EmploymentCard workspaceId={workspaceId} entityId={entityId} />
      )}
      <EntityAssignments entityId={entityId} variant="full" />
      {workspaceId && (
        <EntityProductions workspaceId={workspaceId} entityId={entityId} variant="full" />
      )}
      <EntityMoney entityId={entityId} variant="full" />
      {/* Reciprocity is a ledger, so it sits with the other ledger. */}
      {workspaceId && <ReferralsCard workspaceId={workspaceId} entityId={entityId} />}
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
