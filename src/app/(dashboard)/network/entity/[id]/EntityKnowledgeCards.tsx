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
 * The computed facts lead. There used to be a generated brief above them; it
 * told the owner that a real coordinator "is a ghost" and that a client "is a
 * client with contact details on file", and the strip now says the same class of
 * thing from a query, labelled and checkable. See §B3 of the design note.
 *
 * @module app/network/entity/EntityKnowledgeCards
 */

import { PromotedMetricsRow } from '@/widgets/network-detail/ui/PromotedMetricsRow';
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
      {/* The computed facts, back on the page.
          P3 took EntityOverviewCards off the record page and this went with it,
          in its density='page' branch -- so the panel kept a fact strip and the
          page, which has more room for one, had none. */}
      <PromotedMetricsRow
        workspaceId={workspaceId}
        entityId={entityId}
        entityType={entityType}
      />
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
