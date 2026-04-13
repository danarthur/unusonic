import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { DomainEventType, DomainEventPayload } from './types';

/**
 * Publish a domain event to `ops.domain_events` — Pass 3 Phase 3.
 *
 * This is the append-only seam that the Follow-Up Engine will subscribe to
 * once its queue tables exist. Until then, the table is an audit log of
 * show lifecycle transitions.
 *
 * Important contract:
 *   - This function MUST NOT throw. Publish failures are captured to Sentry
 *     and swallowed so the caller's state transition commits cleanly.
 *     Losing a domain event is acceptable; losing a show-state transition
 *     mid-show is not.
 *   - Uses the service-role client because `ops.domain_events` has SELECT-only
 *     RLS and no public INSERT policy.
 *   - Caller supplies workspaceId + eventId + type + payload. The created_by
 *     uuid is best-effort: we pass null here (the system client has no user
 *     context) and rely on the caller's `instrument()` span + Sentry breadcrumb
 *     for user attribution.
 */
export async function publishDomainEvent<T extends DomainEventType>(args: {
  workspaceId: string;
  eventId: string;
  type: T;
  payload: DomainEventPayload[T];
  userId?: string | null;
}): Promise<{ ok: boolean }> {
  try {
    const supabase = getSystemClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .schema('ops')
      .from('domain_events')
      .insert({
        workspace_id: args.workspaceId,
        event_id: args.eventId,
        type: args.type,
        payload: args.payload,
        created_by: args.userId ?? null,
      });

    if (error) {
      Sentry.logger.error('domainEvents.publishFailed', {
        eventType: args.type,
        eventId: args.eventId,
        workspaceId: args.workspaceId,
        error: error.message,
      });
      return { ok: false };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.logger.error('domainEvents.publishThrew', {
      eventType: args.type,
      eventId: args.eventId,
      workspaceId: args.workspaceId,
      error: message,
    });
    Sentry.captureException(err);
    return { ok: false };
  }
}
