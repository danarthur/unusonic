'use client';

/**
 * EntityOverviewCards — the canonical stack of Phase 1 IA cards for an entity.
 *
 * Single source of truth for what an entity "looks like" at a glance. Mounted
 * in two surfaces:
 *   • NetworkDetailSheet (right-side slide-over, tabbed)
 *
 * Panel-only now. The page composes its own knowledge column from the same
 * cards and keeps the records in its rail, so the density tier this used to
 * carry had nothing left to switch on.
 *
 * Grouped into three named zones rather than a flat stack of cards. The stack
 * had grown to seven siblings of equal visual weight, several of them
 * summarising the one below, so every question cost the same scan:
 *
 *   Who they are              Brief · Employment · Venue specs · Team
 *   What we've done together  Productions · Referrals
 *   What we know              Working notes · Capture timeline
 *
 * The order follows the moment the sheet is actually opened — an unfamiliar
 * number calls and you have about three seconds to work out who this is, what
 * you have done together, and whether they were any good. Judgement and its
 * sources go last: the Brief is the glance, the timeline is where you go when
 * the glance is not enough.
 *
 * Cards hide themselves when empty, and a Zone hides with its contents, so a
 * sparse entity shows fewer headings rather than empty ones.
 *
 * Design: docs/reference/network-page-ia-redesign.md §3.2, §4, §5.
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { CaptureTimelinePanel } from './CaptureTimelinePanel';
import { WorkingNotesCard } from './WorkingNotesCard';
import { EmploymentCard } from './EmploymentCard';
import { TeamCard } from './TeamCard';
import { RecordHistoryCounts } from './RecordHistoryCounts';
import { VenueSpecsCompactCard } from './VenueSpecsCompactCard';

export type EntityOverviewEntityType = 'person' | 'company' | 'venue' | 'couple';

export interface EntityOverviewCardsProps {
  workspaceId: string;
  entityId: string;
  entityType: EntityOverviewEntityType;
  entityName: string | null;
  /**
   * The relationship in view, when there is one. Lets the notes card host its
   * own composer instead of a second notes card living elsewhere on the sheet.
   */
  relationshipId?: string | null;
  /** The record page for this node. Segments of the history row link into it. */
  recordHref?: string;
  className?: string;
}

export function EntityOverviewCards({
  workspaceId,
  entityId,
  entityType,
  entityName,
  relationshipId = null,
  recordHref,
  className,
}: EntityOverviewCardsProps) {
  const { isPersonOrCouple, isCompanyOrVenue, isVenue } = entityShape(entityType);

  return (
    <div
      className={cn('flex flex-col', className)}
      /* Between zones. Ratio against the intra-zone gap below lands at
         2.5:1 spacious, 3.2:1 balanced, 3:1 dense -- above the 2:1 where
         grouping becomes pre-attentive, at every tier. */
      style={{ gap: 'calc(var(--stage-padding) * 2)' }}
    >
      {/*
        Ordered around the moment this sheet actually gets opened: an unfamiliar
        number calls, and in about three seconds you need who is this, what have
        we done together, and are they any good. Seven equal-weight cards made
        every one of those questions cost the same scan; three named groups let
        you jump.
      */}
      <Zone label="Who they are">
        {isPersonOrCouple && (
          <EmploymentCard workspaceId={workspaceId} entityId={entityId} />
        )}
        {/* Building-first for a venue: capacity and load-in before people. */}
        {isVenue && (
          <VenueSpecsCompactCard workspaceId={workspaceId} entityId={entityId} />
        )}
        {/* A company IS its people -- the faces are the identity, not a roster. */}
        {isCompanyOrVenue && (
          <TeamCard workspaceId={workspaceId} entityId={entityId} />
        )}
      </Zone>

      {/* What we've done together, as counts rather than three lists.
          Productions, the referral ledger and the invoices were the bulk of
          what made this drawer eighteen blocks long, and the page next door
          holds a better version of all three. The number is the signal: it
          tells you whether the click is worth making. */}
      {recordHref && (
        <RecordHistoryCounts
          workspaceId={workspaceId}
          entityId={entityId}
          recordHref={recordHref}
        />
      )}

      {/*
        Judgement and its sources, last. The brief above is the glance; these are
        where you go when the glance is not enough.
      */}
      <Zone label="What we know">
        {/* Every entity type: do-not-rebook and private notes are as much a
            company's as a person's. */}
        <WorkingNotesCard workspaceId={workspaceId} entityId={entityId} />
        <CaptureTimelinePanel
          workspaceId={workspaceId}
          entityId={entityId}
          entityName={entityName}
          entityType={entityType}
          relationshipId={relationshipId}
        />
      </Zone>
    </div>
  );
}

/**
 * A titled group of cards.
 *
 * Every card in here hides itself when it has nothing to show, which would
 * otherwise leave a heading floating above nothing. `:has()` on the body means
 * the group disappears with its contents rather than needing each card to
 * report emptiness upward.
 */
function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col [&:not(:has(>div>*))]:hidden"
      style={{ gap: 'var(--stage-gap)' }}
    >
      {/* Secondary, not tertiary: this heading governs the card headings below
          it and was rendering dimmer than them -- the hierarchy was inverted at
          exactly the level meant to create it. .stage-label supplies secondary
          on its own. */}
      <h2 className="stage-label uppercase" style={{ letterSpacing: '0.1em' }}>{label}</h2>
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide)' }}>{children}</div>
    </section>
  );
}

/** Which cards an entity type gets. Kept out of the component so the JSX reads as layout. */
function entityShape(entityType: EntityOverviewCardsProps['entityType']) {
  return {
    isPersonOrCouple: entityType === 'person' || entityType === 'couple',
    isCompanyOrVenue: entityType === 'company' || entityType === 'venue',
    isVenue: entityType === 'venue',
  };
}
