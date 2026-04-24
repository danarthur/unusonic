'use server';

/**
 * Migrate the caller's active deal-scoped Aion session to event-scope after
 * a successful deal→event handoff (Phase 3 §3.6).
 *
 * Thin wrapper around cortex.migrate_session_scope RPC — full B1 spec lives
 * in the migration (20260424093644_migrate_session_scope.sql): collision
 * resolution, orphaned proactive-line re-linking, seeded handoff system
 * message, rolling-summary null-out.
 *
 * R6 rule: handover is CRM-critical path. This function NEVER throws. Errors
 * go to Sentry and the caller (handoverDeal) continues.
 *
 * Scoped to the caller only. Other users' deal-scoped sessions on this deal
 * stay put; they migrate lazily when those users next open the thread (the
 * UI's scope resolver reads the session row fresh per-turn and can be
 * extended later if we want eager multi-user migration).
 *
 * Extracted from handover-deal.ts for unit-testability. The function has no
 * side effects beyond the one RPC call and the Sentry log on failure, and
 * the supabase client is passed in rather than constructed — so mocking is
 * straightforward.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import * as Sentry from '@sentry/nextjs';

export async function migrateCallerDealSessionToEvent(
  supabase: SupabaseClient<Database>,
  dealId: string,
  eventId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;  // No session to migrate when no authed user.

    // Find the caller's active deal-scoped session. RLS filters by user_id
    // automatically; we also pin scope_type / scope_entity_id to avoid
    // grabbing an event-scoped session that already exists.
    const { data: sessionRow } = await supabase
      .schema('cortex')
      .from('aion_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .eq('scope_type', 'deal')
      .eq('scope_entity_id', dealId)
      .is('archived_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!sessionRow) return;  // No deal-scoped thread exists — nothing to migrate.

    const { error: migrateErr } = await supabase
      .schema('cortex')
      .rpc('migrate_session_scope', {
        p_session_id: sessionRow.id,
        p_new_scope_type: 'event',
        p_new_scope_entity_id: eventId,
      });

    if (migrateErr) {
      Sentry.logger.error('crm.handoverDeal.aionSessionMigrateFailed', {
        dealId,
        eventId,
        workspaceId,
        sessionId: sessionRow.id,
        error: migrateErr.message,
      });
    }
  } catch (err) {
    // Defensive catch — migrate_session_scope already swallows most internal
    // errors via RAISE; the catch here handles unexpected auth / query
    // failures so handoff never aborts on an Aion-side issue.
    const message = err instanceof Error ? err.message : String(err);
    Sentry.logger.error('crm.handoverDeal.aionSessionMigrateThrew', {
      dealId,
      eventId,
      workspaceId,
      error: message,
    });
  }
}
