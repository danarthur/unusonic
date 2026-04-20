/**
 * Client-side helper for emitting proposal-builder telemetry events.
 *
 * Owns the per-mount session_id (stable for the lifetime of the studio),
 * tracks first_add timing, and provides a fire-and-forget `emit()` function
 * that dispatches to the server-action wrapper. All writes are async and
 * non-blocking.
 *
 * @module features/sales/lib/use-proposal-builder-events
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import {
  recordProposalBuilderEvent,
  type ProposalBuilderEventType,
  type ProposalBuilderVariant,
} from '../api/proposal-builder-events';

export type UseProposalBuilderEventsArgs = {
  workspaceId: string | null | undefined;
  dealId: string | null | undefined;
  variant: ProposalBuilderVariant;
};

/** Lazy initializer kept out of render: produces a stable session token. */
function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Minimal fallback for environments without crypto.randomUUID (older Safari).
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useProposalBuilderEvents({
  workspaceId,
  dealId,
  variant,
}: UseProposalBuilderEventsArgs) {
  // useState's lazy initializer only runs once, off the render path — so
  // `makeSessionId` (which reads crypto/Date/Math) doesn't violate the
  // react-hooks/purity rule the way a bare useMemo call would. Same for
  // the session-start timestamp.
  const [sessionId] = useState(makeSessionId);
  const [sessionStartMs] = useState(() => Date.now());
  const firstAddEmittedRef = useRef(false);

  const emit = useCallback(
    (type: ProposalBuilderEventType, payload?: Record<string, unknown>) => {
      if (!workspaceId || !dealId) return;
      // Fire-and-forget — never await, never block.
      void recordProposalBuilderEvent({
        workspaceId,
        dealId,
        sessionId,
        variant,
        type,
        payload,
      });
    },
    [workspaceId, dealId, sessionId, variant],
  );

  /**
   * Emits `add_success` plus, the first time per session, a `first_add`
   * event with `elapsed_ms` since session start. Used by both studios
   * whenever a line item lands on the receipt.
   */
  const emitAddSuccess = useCallback(
    (source: 'palette' | 'drag' | 'custom', payload?: Record<string, unknown>) => {
      emit('add_success', { source, ...(payload ?? {}) });
      if (!firstAddEmittedRef.current) {
        firstAddEmittedRef.current = true;
        emit('first_add', {
          source,
          elapsed_ms: Date.now() - sessionStartMs,
          ...(payload ?? {}),
        });
      }
    },
    [emit, sessionStartMs],
  );

  /**
   * Emits a `row_reorder` event for a single drag-end on the receipt. No
   * debounce — dragging is a discrete user action, not a passive stream.
   *
   * `from_group_index` / `to_group_index` are indices into the GROUP list
   * (what the user sees as a sortable row), NOT into `proposal_items.sort_order`.
   * Ungrouped line items occupy their own group, so for flat proposals these
   * match the line-item index; for proposals with package bundles they don't.
   */
  const emitRowReorder = useCallback(
    (payload: {
      from_group_index: number;
      to_group_index: number;
      from_group_id: string;
      to_group_id: string;
    }) => {
      emit('row_reorder', payload);
    },
    [emit],
  );

  return { sessionId, emit, emitAddSuccess, emitRowReorder };
}
