'use client';

/**
 * EntitySummaryCard — AI-maintained narrative + pinned facts.
 *
 * This is the primary read surface for "what do I know about this entity?" —
 * sits above the raw capture timeline per the design doc §5.2. Users glance
 * at the narrative; the timeline is for drill-down.
 *
 * Each pinned fact chip can be X'd out. The override is user-scoped: your
 * suppressions don't affect teammates' views. Suppressions are additive —
 * re-capturing a similar fact reasserts it past the suppression.
 *
 * Design: docs/reference/capture-surfaces-design.md §5.3.A.
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import {
  getEntitySummary,
  suppressPinnedFact,
} from '../api/get-entity-summary';

export interface EntitySummaryCardProps {
  workspaceId: string;
  entityId: string;
  /**
   * When viewing a company or venue, fold captures about affiliated people
   * into the narrative. Avoids the empty-brief-on-company problem where
   * every note lives on the individual team members.
   */
  entityType?: 'person' | 'company' | 'venue' | 'couple' | null;
}

export function EntitySummaryCard({
  workspaceId,
  entityId,
  entityType = null,
}: EntitySummaryCardProps) {
  const queryClient = useQueryClient();
  const includeAffiliated = entityType === 'company' || entityType === 'venue';

  const {
    data: summaryData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      ...queryKeys.entities.summary(workspaceId, entityId),
      { includeAffiliated },
    ],
    queryFn: () =>
      getEntitySummary(workspaceId, entityId, { includeAffiliated }),
    staleTime: 60_000, // 1 min — summary is regenerated on capture writes
    enabled: Boolean(workspaceId && entityId),
  });

  const suppressMutation = useMutation({
    mutationFn: (factText: string) =>
      suppressPinnedFact(workspaceId, entityId, factText),
    onMutate: async (factText) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.entities.summary(workspaceId, entityId),
      });
      const previous = queryClient.getQueryData<ReturnType<typeof getEntitySummary> extends Promise<infer R> ? R : never>(
        queryKeys.entities.summary(workspaceId, entityId),
      );
      if (previous && 'ok' in previous && previous.ok) {
        queryClient.setQueryData(
          queryKeys.entities.summary(workspaceId, entityId),
          {
            ...previous,
            summary: {
              ...previous.summary,
              pinnedFacts: previous.summary.pinnedFacts.filter(
                (f) => f.toLowerCase() !== factText.trim().toLowerCase(),
              ),
            },
          },
        );
      }
      return { previous };
    },
    onError: (_err, _factText, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.entities.summary(workspaceId, entityId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.entities.summary(workspaceId, entityId),
      });
    },
  });

  // Resolve the actual summary (server action returns a discriminated union)
  const summary =
    summaryData && 'ok' in summaryData && summaryData.ok ? summaryData.summary : null;

  if (isLoading && !summary) {
    return (
      <div
        className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-2"
        data-surface="elevated"
      >
        <div className="h-3 w-3/4 rounded stage-skeleton" />
        <div className="h-3 w-full rounded stage-skeleton" />
        <div className="h-3 w-2/3 rounded stage-skeleton" />
      </div>
    );
  }

  if (isError || !summary) {
    return null;
  }

  const pinnedFacts = summary.pinnedFacts ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles
          className="size-3 text-[var(--stage-text-tertiary)]"
          strokeWidth={1.5}
        />
        <h3 className="stage-label text-[var(--stage-text-secondary)]">Brief</h3>
      </div>

      <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] leading-relaxed">
        {summary.narrative}
      </p>

      {pinnedFacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <AnimatePresence initial={false}>
            {pinnedFacts.map((fact) => (
              <PinnedFactChip
                key={fact}
                fact={fact}
                onDismiss={() => suppressMutation.mutate(fact)}
                dismissing={
                  suppressMutation.isPending &&
                  suppressMutation.variables === fact
                }
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function PinnedFactChip({
  fact,
  onDismiss,
  dismissing,
}: {
  fact: string;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={STAGE_LIGHT}
      className={cn(
        'group inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)]',
        'stage-badge-text text-[var(--stage-text-secondary)]',
      )}
    >
      <span>{fact}</span>
      <button
        type="button"
        onClick={onDismiss}
        disabled={dismissing}
        aria-label={`Remove pinned fact: ${fact}`}
        className={cn(
          'opacity-0 group-hover:opacity-60 focus-visible:opacity-100',
          'hover:text-[var(--stage-text-primary)] transition-opacity',
          'disabled:opacity-30',
        )}
      >
        <X className="size-3" strokeWidth={1.5} />
      </button>
    </motion.span>
  );
}
