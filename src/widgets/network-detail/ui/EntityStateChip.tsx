'use client';

/**
 * The triage byte, above everything else on the record.
 *
 * I-PASS opens every clinical handover with one word before any prose — the
 * only structured-handover format with moderate-certainty evidence behind it,
 * and the reason is that the reader needs the state before the narrative, in a
 * fixed slot, every time.
 *
 * Computed, never generated. That is the point: a labelled, falsifiable fact
 * can be checked at a glance, and the previous occupant of this space told the
 * owner that a real coordinator "is a ghost". Nothing here passes through a
 * model, so nothing here can invent a date.
 *
 * Costs no extra fetching. Productions and money are already queried by the
 * panel's history counts and by the record page's rail, on the same keys — so
 * this reads the cache, and cannot disagree with the lists underneath it.
 *
 * Renders nothing when there is nothing worth saying. A chip that always
 * appears is a chip nobody reads.
 *
 * Design: docs/what-the-brief-should-say.md §B1.
 *
 * @module widgets/network-detail/ui/EntityStateChip
 */

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { queryKeys } from '@/shared/api/query-keys';
import { getEntityMoney } from '@/features/network-data/api/get-entity-money';
import {
  entityStateToken,
  showDatesFromProductions,
  type StateTone,
} from '@/entities/network/model/state-token';
import { getEntityProductions } from '../api/get-entity-productions';

const TONE_CLASS: Record<StateTone, string> = {
  // Only a standing "do not" earns a hue. Everywhere else brightness is the
  // accent, per the design system's achromatic rule.
  warning:
    'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]',
  attention: 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
  neutral: 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]',
};

export interface EntityStateChipProps {
  workspaceId: string;
  entityId: string;
  /** From the relationship edge; the page and panel both already have it. */
  doNotRebook?: boolean;
  className?: string;
}

export function EntityStateChip({
  workspaceId,
  entityId,
  doNotRebook,
  className,
}: EntityStateChipProps) {
  const productions = useQuery({
    queryKey: queryKeys.entities.productions(workspaceId, entityId),
    queryFn: () => getEntityProductions(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });
  const money = useQuery({
    queryKey: ['entity-money', entityId],
    queryFn: () => getEntityMoney(entityId),
    staleTime: 60_000,
    enabled: Boolean(entityId),
  });

  const result = productions.data;
  const { nextBooked, lastWorked } = showDatesFromProductions(
    result && result.ok ? result.productions : [],
  );

  const token = entityStateToken({
    doNotRebook,
    theyOweUs: money.data?.theyOweUs,
    weOweThem: money.data?.weOweThem,
    nextBooked,
    lastWorked,
  });

  if (!token) return null;

  return (
    <span
      title={token.because}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1',
        'stage-badge-text tabular-nums',
        TONE_CLASS[token.tone],
        className,
      )}
    >
      {token.label}
    </span>
  );
}
