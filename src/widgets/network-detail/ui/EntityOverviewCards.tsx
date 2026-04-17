'use client';

/**
 * EntityOverviewCards — the canonical stack of Phase 1 IA cards for an entity.
 *
 * Single source of truth for what an entity "looks like" at a glance. Mounted
 * in two surfaces:
 *   • NetworkDetailSheet (right-side slide-over, tabbed — density: sheet)
 *   • Entity studio page (/network/entity/[id], full page — density: page)
 *
 * Renders (conditional on entity type):
 *   • PromotedMetricsRow — two inline metrics
 *   • EntitySummaryCard  — AI Brief
 *   • WorkingNotesCard   — person/couple only
 *   • TeamCard           — company/venue only
 *   • CaptureTimelinePanel — all types
 *   • PersonProductionsPanel — person/couple only
 *
 * Design: docs/reference/network-page-ia-redesign.md §3.2, §4, §5.
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { EntitySummaryCard } from './EntitySummaryCard';
import { CaptureTimelinePanel } from './CaptureTimelinePanel';
import { WorkingNotesCard } from './WorkingNotesCard';
import { TeamCard } from './TeamCard';
import { PersonProductionsPanel } from './PersonProductionsPanel';
import { ReferralsCard } from './ReferralsCard';
import { PromotedMetricsRow } from './PromotedMetricsRow';
import { VenueSpecsCompactCard } from './VenueSpecsCompactCard';

export type EntityOverviewEntityType = 'person' | 'company' | 'venue' | 'couple';

export interface EntityOverviewCardsProps {
  workspaceId: string;
  entityId: string;
  entityType: EntityOverviewEntityType;
  entityName: string | null;
  /**
   * Layout tier:
   *   'sheet' — tighter spacing, no promoted-metrics row (the sheet renders
   *             PromotedMetricsRow separately under the IdentityHeader so it
   *             slots in with the existing contact strip).
   *   'page'  — fuller spacing, includes PromotedMetricsRow inline at top.
   */
  density?: 'sheet' | 'page';
  className?: string;
}

export function EntityOverviewCards({
  workspaceId,
  entityId,
  entityType,
  entityName,
  density = 'sheet',
  className,
}: EntityOverviewCardsProps) {
  const isPersonOrCouple = entityType === 'person' || entityType === 'couple';
  const isCompanyOrVenue = entityType === 'company' || entityType === 'venue';
  const isVenue = entityType === 'venue';

  return (
    <div
      className={cn(
        'flex flex-col',
        density === 'page' ? 'gap-4' : 'space-y-5',
        className,
      )}
    >
      {density === 'page' && (
        <PromotedMetricsRow
          workspaceId={workspaceId}
          entityId={entityId}
          entityType={entityType}
        />
      )}
      <EntitySummaryCard
        workspaceId={workspaceId}
        entityId={entityId}
        entityType={entityType}
      />
      {/* Venue specs: read-only summary of capacity/load-in/power/stage/etc.
          Sits above the team card so the building-first info lands first. */}
      {isVenue && (
        <VenueSpecsCompactCard workspaceId={workspaceId} entityId={entityId} />
      )}
      {isPersonOrCouple && (
        <WorkingNotesCard workspaceId={workspaceId} entityId={entityId} />
      )}
      {isCompanyOrVenue && (
        <TeamCard workspaceId={workspaceId} entityId={entityId} />
      )}
      <CaptureTimelinePanel
        workspaceId={workspaceId}
        entityId={entityId}
        entityName={entityName}
        entityType={entityType}
      />
      {isPersonOrCouple && (
        <PersonProductionsPanel
          workspaceId={workspaceId}
          entityId={entityId}
        />
      )}
      {/* Referrals: both people and company/venue carry a reciprocity ledger
          ("who feeds us, who do we feed"). Useful at both levels. */}
      <ReferralsCard workspaceId={workspaceId} entityId={entityId} />
    </div>
  );
}
