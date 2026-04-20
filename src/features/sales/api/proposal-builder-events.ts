/**
 * Proposal-builder rebuild (Phase 1) — telemetry writer.
 *
 * Thin server-action wrapper around `ops.record_proposal_builder_event(...)`.
 * Called from the proposal-builder studio (both variants) to emit the five
 * kill-criteria metrics defined in docs/reference/proposal-builder-rebuild-design.md §4.4.
 *
 * Telemetry is fire-and-forget from the client's perspective — a failure to
 * write an event must not block the user flow. All errors are swallowed and
 * logged; the table is append-only and the row is informational.
 *
 * @module features/sales/api/proposal-builder-events
 */
'use server';

import { createClient } from '@/shared/api/supabase/server';

/** Enumerated event types — must stay in sync with the CHECK on ops.proposal_builder_events.type. */
export type ProposalBuilderEventType =
  | 'session_start'
  | 'palette_open'
  | 'first_add'
  | 'add_success'
  | 'catalog_scroll'
  | 'row_reorder';

export type ProposalBuilderVariant = 'drag' | 'palette';

export type RecordProposalBuilderEventInput = {
  workspaceId: string;
  dealId: string;
  sessionId: string;
  variant: ProposalBuilderVariant;
  type: ProposalBuilderEventType;
  payload?: Record<string, unknown>;
};

export async function recordProposalBuilderEvent(
  input: RecordProposalBuilderEventInput,
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();
    // ops schema is not PostgREST-exposed at the table level, but SECURITY
    // DEFINER RPCs in ops are reachable via `.schema('ops').rpc(...)`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- src/types/supabase.ts does not include ops schema (see CLAUDE.md)
    const { error } = await (supabase as any)
      .schema('ops')
      .rpc('record_proposal_builder_event', {
        p_workspace_id: input.workspaceId,
        p_deal_id: input.dealId,
        p_session_id: input.sessionId,
        p_variant: input.variant,
        p_type: input.type,
        p_payload: input.payload ?? {},
      });

    if (error) {
      // Swallow — telemetry must not block the user. Log for visibility.
      console.warn('[proposal-builder-events] record failed:', error.message);
      return { success: false };
    }
    return { success: true };
  } catch (err) {
    console.warn('[proposal-builder-events] record threw:', err);
    return { success: false };
  }
}
