'use client';

/**
 * Who else is on this record, as a chip you can follow.
 *
 * "Partner · Jane Okafor →". The relationship type is on the link, not implied
 * by position, because a name on its own does not say why it is there. That is
 * the one thing every system with a two-person record agrees on: NPSP writes
 * the type on the connection line and in the related-list description,
 * Blackbaud shows the reciprocal word, HubSpot ships symmetric labels whose own
 * published examples are "Colleague" and "Partner".
 *
 * Sits in the record's header rather than a tab. Blackbaud puts the spouse in
 * the constituent profile header; 17hats puts related contacts in the project
 * sidebar; nobody makes you go looking.
 *
 * "Partner" rather than "Spouse" for a romantic pair, deliberately. The stored
 * pairing is `romantic`, which is not a claim about marriage, and guessing
 * wrong about someone's relationship on their own record is worse than being
 * general.
 *
 * Design: docs/couples-and-linked-people.md §C1.
 *
 * @module entities/network/ui/LinkedPeople
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { queryKeys } from '@/shared/api/query-keys';
import { getLinkedPeople, type LinkedPairing } from '@/features/network-data/api/get-linked-people';
import { EntityAvatar } from './EntityAvatar';

const PAIRING_LABEL: Record<LinkedPairing, string> = {
  romantic: 'Partner',
  co_host: 'Co-host',
  family: 'Family',
};

/**
 * A pair that has ended keeps its link and says so. NPSP renders the same
 * thing as "(Former)"; Blackbaud's rule is to end-date rather than delete.
 * Hiding it would take the second name off a show that really did have two.
 */
function labelFor(pairing: LinkedPairing, status: 'current' | 'former'): string {
  const label = PAIRING_LABEL[pairing];
  return status === 'former' ? `Former ${label.toLowerCase()}` : label;
}

export interface LinkedPeopleProps {
  workspaceId: string;
  entityId: string;
  /** Where the chip points. The record page for that person. */
  hrefFor: (entityId: string) => string;
  className?: string;
}

export function LinkedPeople({ workspaceId, entityId, hrefFor, className }: LinkedPeopleProps) {
  const { data } = useQuery({
    queryKey: queryKeys.entities.linkedPeople(workspaceId, entityId),
    queryFn: () => getLinkedPeople(entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  if (!data || data.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {data.map((person) => (
        <Link
          key={person.entityId}
          href={hrefFor(person.entityId)}
          title={
            person.status === 'former' && person.endedOn
              ? `Ended ${person.endedOn}`
              : undefined
          }
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2',
            'bg-[oklch(1_0_0/0.06)] hover:bg-[oklch(1_0_0/0.10)]',
            'transition-colors duration-[80ms]',
            // Present but quieter. Brightness is the accent here, so a former
            // pair steps down a tier rather than taking on a colour.
            person.status === 'former' && 'opacity-60',
          )}
        >
          <EntityAvatar name={person.name} avatarUrl={person.avatarUrl} entityType="person" sizeClassName="size-5" />
          <span className="stage-badge-text text-[var(--stage-text-tertiary)]">
            {labelFor(person.pairing, person.status)}
          </span>
          <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-primary)]">
            {person.name}
          </span>
          <ArrowUpRight
            className="size-3 shrink-0 text-[var(--stage-text-secondary)] opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.5}
          />
        </Link>
      ))}
    </div>
  );
}
