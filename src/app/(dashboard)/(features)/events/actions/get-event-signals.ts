'use server';

/**
 * getEventSignals — single source of truth for the per-event signal stack.
 *
 * Used by:
 *   - AionPlanCard on the Plan tab (via the Prism bundle)
 *   - Aion's `get_event_signals` chat tool
 *
 * Both surfaces read identical signals from this action. The work it does:
 *   1. Resolve the event + linked deal
 *   2. Fetch the latest proposal (deposit timing) and final invoice (money signal)
 *   3. Fetch the latest follow-up timestamp (silence proxy until Replies ships)
 *   4. Fetch the latest run-of-show cue edit (staleness signal)
 *   5. Run getEventConflicts to detect cross-show double-bookings
 *   6. Pass the lot through computeEventSignals (pure function)
 *
 * Reference: docs/reference/aion-plan-card-design.md
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getEventConflicts } from '@/features/ops/actions/get-event-conflicts';
import {
  computeEventSignals,
  type EventSignal,
  type EventSignalConflict,
} from '../lib/compute-event-signals';

export type { EventSignal } from '../lib/compute-event-signals';

export async function getEventSignals(eventId: string): Promise<EventSignal[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // 1. Event basics — start time + linked deal id. ops schema is exposed
  // via PostgREST per the recent grants migration; cast through unknown
  // because supabase-js generic types only cover the public schema.
  const { data: eventRow } = await (supabase as unknown as {
    schema: (s: string) => typeof supabase;
  })
    .schema('ops')
    .from('events')
    .select('id, starts_at, deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!eventRow) return [];
  const event = eventRow as { id: string; starts_at: string; deal_id: string | null };
  const dealId = event.deal_id;

  // 2. Deal scalars — show_health is the manual at-risk/blocked override
  // that the Aion card amplifies but never overrides.
  let deal: { id: string; showHealth: { status: 'on_track' | 'at_risk' | 'blocked'; note: string } | null } | null = null;
  if (dealId) {
    const { data: dealRow } = await supabase
      .from('deals')
      .select('id, show_health')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (dealRow) {
      const d = dealRow as { id: string; show_health: { status: 'on_track' | 'at_risk' | 'blocked'; note: string } | null };
      deal = { id: d.id, showHealth: d.show_health ?? null };
    }
  }

  // 3. Latest non-draft proposal — deposit timing for the deposit_overdue signal.
  let proposal: { acceptedAt: string | null; depositPaidAt: string | null } | null = null;
  if (dealId) {
    const { data: proposalRows } = await supabase
      .from('proposals')
      .select('accepted_at, deposit_paid_at')
      .eq('deal_id', dealId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = proposalRows?.[0] as { accepted_at: string | null; deposit_paid_at: string | null } | undefined;
    if (row) proposal = { acceptedAt: row.accepted_at, depositPaidAt: row.deposit_paid_at };
  }

  // 4. Final invoice — money signal at T-7. Skips if no row spawned yet
  // (which itself is a "final invoice unsent" condition — pure function
  // handles the null case).
  let finalInvoice: { status: string | null } | null = null;
  if (dealId) {
    const { data: invoiceRows } = await (supabase as unknown as {
      schema: (s: string) => typeof supabase;
    })
      .schema('finance')
      .from('invoices')
      .select('status')
      .eq('deal_id', dealId)
      .eq('invoice_kind', 'final')
      .order('issue_date', { ascending: false })
      .limit(1);
    const row = invoiceRows?.[0] as { status: string | null } | undefined;
    if (row) finalInvoice = { status: row.status };
  }

  // 5. Last follow-up — staleness/silence proxy. ops.follow_up_log keys
  // off deal_id; on Plan-tab scope a real "client gone quiet" signal will
  // come from the Replies inbound mirror once Phase 1 ships.
  let lastFollowUpAt: string | null = null;
  if (dealId) {
    const { data: logRows } = await (supabase as unknown as {
      schema: (s: string) => typeof supabase;
    })
      .schema('ops')
      .from('follow_up_log')
      .select('created_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1);
    const row = logRows?.[0] as { created_at: string } | undefined;
    if (row) lastFollowUpAt = row.created_at;
  }

  // 6. Latest run-of-show cue edit — Linear's "staleness as signal" pattern.
  // Cue rows live in public.run_of_show_cues with their own updated_at.
  // MAX(updated_at) catches every cue tweak; if the RoS hasn't been touched
  // for longer than days-to-show, the pure function fires a drift signal.
  let rosLastModifiedAt: string | null = null;
  const { data: cueRows } = await supabase
    .from('run_of_show_cues')
    .select('updated_at')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const cueRow = cueRows?.[0] as { updated_at: string } | undefined;
  if (cueRow) rosLastModifiedAt = cueRow.updated_at;

  // 7. Cross-show conflicts. getEventConflicts returns the full list across
  // crew + gear; the pure function collapses it into one signal with the
  // first 2 names + a "+N more" suffix.
  const conflictResult = await getEventConflicts(eventId);
  const conflicts: EventSignalConflict[] = (conflictResult.conflicts ?? []).map((c) => ({
    kind: c.resourceType,
    resourceName: c.resourceName,
    otherEventTitle: c.eventName,
  }));

  return computeEventSignals({
    event: { id: event.id, startsAt: event.starts_at },
    deal,
    proposal,
    conflicts,
    lastFollowUpAt,
    rosLastModifiedAt,
    finalInvoice,
    now: Date.now(),
  });
}
