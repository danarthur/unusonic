/**
 * Domain event types — Pass 3 Phase 3.
 *
 * This list is CAPPED at three types by DB CHECK constraint and by
 * Visionary risk #4 ("Phase 3 domain event table becomes dumping ground").
 * Adding a fourth type requires:
 *   1. A design-note update in docs/reference/follow-up-engine-design.md
 *      or a new Pass document explaining the new type's trigger + consumer.
 *   2. A migration updating the CHECK constraint on ops.domain_events.type.
 *   3. A code review checkpoint confirming the new type has a consumer
 *      (not a write-to-nowhere event).
 *
 * The three events we ship with:
 *   - show.started — fired from markShowStarted when a PM starts a show
 *   - show.ended   — fired from markShowEnded when a PM ends a show
 *   - show.wrapped — fired from markShowWrapped (Phase 4) on close-out
 *
 * No events fire from undo actions — undos intentionally leave no trail.
 */
export type DomainEventType = 'show.started' | 'show.ended' | 'show.wrapped';

/**
 * Payload shapes per event type. All optional fields; the DB column is
 * a `jsonb` default `'{}'` and the table stores whatever we publish.
 */
export type DomainEventPayload = {
  'show.started': {
    startedAt: string;
  };
  'show.ended': {
    endedAt: string;
    startedAt: string | null;
  };
  'show.wrapped': {
    wrappedAt: string;
  };
};
