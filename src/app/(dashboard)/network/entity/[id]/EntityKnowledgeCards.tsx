'use client';

/**
 * The left column's "what we know": the brief, the working notes, the captures.
 *
 * The page used to render `EntityOverviewCards` -- the panel's whole card set --
 * and then put the editing forms underneath it. So opening the full profile
 * showed you the panel again, followed by the thing the page actually exists
 * for. The panel is the glance; repeating it on the page makes the page a
 * longer glance rather than a workspace.
 *
 * The split that replaces it is one line: records to the rail, knowledge to the
 * body. Productions, money, documents, assignments, referrals, team and
 * employment history are records of what happened -- they go in
 * [[EntityRecordsAside]]. The brief, the notes and the captures are what you
 * think about this entity, they sit above the fields you edit, and they belong
 * here.
 *
 * The brief leads, because that is where every vendor puts generated summary on
 * a record page -- Power Apps' insights bar, D365's insight banner, HubSpot's
 * summary card -- at the top of the primary column, in an ordinary container.
 *
 * @module app/network/entity/EntityKnowledgeCards
 */

import { EntitySummaryCard } from '@/widgets/network-detail/ui/EntitySummaryCard';
import { WorkingNotesCard } from '@/widgets/network-detail/ui/WorkingNotesCard';
import { CaptureTimelinePanel } from '@/widgets/network-detail/ui/CaptureTimelinePanel';

export interface EntityKnowledgeCardsProps {
  workspaceId: string;
  entityId: string;
  entityType: 'person' | 'company' | 'venue' | 'couple';
  entityName: string | null;
  /** The relationship in view, so the capture panel can host its own composer. */
  relationshipId?: string | null;
  relationshipNotes?: string | null;
}

export function EntityKnowledgeCards({
  workspaceId,
  entityId,
  entityType,
  entityName,
  relationshipId,
  relationshipNotes,
}: EntityKnowledgeCardsProps) {
  const isPersonOrCouple = entityType === 'person' || entityType === 'couple';

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide)' }}>
      <EntitySummaryCard workspaceId={workspaceId} entityId={entityId} entityType={entityType} />
      {isPersonOrCouple && <WorkingNotesCard workspaceId={workspaceId} entityId={entityId} />}
      <CaptureTimelinePanel
        workspaceId={workspaceId}
        entityId={entityId}
        entityName={entityName}
        entityType={entityType}
        relationshipId={relationshipId}
        initialNotes={relationshipNotes}
      />
    </div>
  );
}
