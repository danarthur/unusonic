-- =============================================================================
-- Revoke anon EXECUTE on all server/staff-only SECURITY DEFINER functions.
--
-- Follow-up to 20260410160000_revoke_anon_exec_client_portal_rpcs.sql after
-- a broader audit turned up the same default-PUBLIC-grant hole across ~50
-- more SECURITY DEFINER functions. Postgres grants EXECUTE to PUBLIC on
-- CREATE FUNCTION; most migrations never revoked it; `anon` (the role used
-- by unauthenticated PostgREST calls with the public Supabase anon key)
-- inherited the grant on every one.
--
-- Categorization for this migration:
--
-- CATEGORY A — confirmed exploitable, NO internal auth/workspace guard:
--   hybrid_search                         — dumps cortex.memory across all workspaces
--   search_spine                          — trusts caller-supplied filter_workspace_id
--   upsert_memory_embedding               — injects into cortex.memory with no guard
--   delete_memory_embedding               — deletes cortex.memory with no guard
--   save_aion_memory / save_aion_message  — injects into cortex.aion_*
--   create_aion_session                   — creates sessions for arbitrary users
--   update_aion_session_summary           — mutates session summaries with no guard
--   upsert_aion_insight                   — injects into cortex.aion_insights
--   resolve_aion_insight                  — marks real insights resolved
--   dismiss_aion_insight                  — dismisses real insights
--   delete_aion_session                   — trusts caller-supplied p_user_id
--   create_draft_invoice_from_proposal    — financial mutation, no ownership check
--   insert_ghost_entity                   — creates entities for arbitrary emails
--   get_user_id_by_email                  — auth.users.id enumeration by email
--   get_ghost_entity_by_email             — directory entity enumeration by email
--   generate_bridge_pairing_code          — trusts caller-supplied p_user_id
--   patch_event_ros_data                  — no auth, writes ops.events.run_of_show_data
--   create_default_location               — no auth, writes public.locations
--   seed_workspace_lead_sources           — no auth, writes ops.workspace_lead_sources
--   cleanup_webauthn_challenges           — minor DoS (pruning)
--
-- CATEGORY B — has internal auth guard, revoke anon as defense-in-depth.
-- These are called from staff-only server actions (authenticated) or from
-- server-side Aion/webhook code (service_role). Anon calls would trip the
-- internal guard and error — but the principle is "anon reaches nothing it
-- doesn't need to reach", so we close the outer door too:
--   patch_entity_attributes, patch_relationship_context, upsert_relationship,
--   remove_relationship, add_roster_member, add_catalog_item_assignee,
--   add_catalog_role_assignee, remove_catalog_item_assignee,
--   add_contact_to_ghost_org (2 overloads), add_ghost_member, update_ghost_member,
--   merge_industry_tags, strip_industry_tag, bulk_approve_pending_equipment,
--   review_crew_equipment, regenerate_invite_code, claim_ghost_entity_workspace,
--   complete_onboarding, get_deal_crew_enriched, get_catalog_availability,
--   get_catalog_item_assignees, increment_proposal_view, count_active_shows,
--   count_team_seats, get_workspace_seat_limit, compute_client_session_expiry,
--   check_bridge_pair_rate_limit
--
-- NOT TOUCHED (deliberate exclusions, safe by design):
--   - Trigger functions (entities_set_updated_at, handle_new_user, etc.) —
--     grants don't affect trigger execution at all, anon grant is cosmetic.
--   - auth.uid()-based predicates (is_workspace_member, get_my_*,
--     member_has_permission, etc.) — for anon, auth.uid() is NULL and they
--     return empty/null. Used by RLS policies. Intentionally anon-callable.
--   - client_is_workspace_client — staff dashboard predicate, same reasoning.
--
-- This migration preserves all `authenticated` and `service_role` grants —
-- only `anon` loses access. No legitimate caller is affected: the caller
-- map was verified by `rg "\\.rpc\\('<name>'" src/` for every function in
-- the list and each confirmed to be invoked via either `createClient()`
-- (authenticated) or `getSystemClient()` (service_role).
-- =============================================================================

DO $$
DECLARE
  v_func text;
  v_func_list text[] := ARRAY[
    -- ── Category A ──
    'hybrid_search',
    'search_spine',
    'upsert_memory_embedding',
    'delete_memory_embedding',
    'save_aion_memory',
    'save_aion_message',
    'create_aion_session',
    'update_aion_session_summary',
    'upsert_aion_insight',
    'resolve_aion_insight',
    'dismiss_aion_insight',
    'delete_aion_session',
    'create_draft_invoice_from_proposal',
    'insert_ghost_entity',
    'get_user_id_by_email',
    'get_ghost_entity_by_email',
    'generate_bridge_pairing_code',
    'patch_event_ros_data',
    'create_default_location',
    'seed_workspace_lead_sources',
    'cleanup_webauthn_challenges',
    -- ── Category B ──
    'patch_entity_attributes',
    'patch_relationship_context',
    'upsert_relationship',
    'remove_relationship',
    'add_roster_member',
    'add_catalog_item_assignee',
    'add_catalog_role_assignee',
    'remove_catalog_item_assignee',
    'add_contact_to_ghost_org',
    'add_ghost_member',
    'update_ghost_member',
    'merge_industry_tags',
    'strip_industry_tag',
    'bulk_approve_pending_equipment',
    'review_crew_equipment',
    'regenerate_invite_code',
    'claim_ghost_entity_workspace',
    'complete_onboarding',
    'get_deal_crew_enriched',
    'get_catalog_availability',
    'get_catalog_item_assignees',
    'increment_proposal_view',
    'count_active_shows',
    'count_team_seats',
    'get_workspace_seat_limit',
    'compute_client_session_expiry',
    'check_bridge_pair_rate_limit'
  ];
  v_signature text;
  v_schema text;
BEGIN
  FOREACH v_func IN ARRAY v_func_list LOOP
    -- Iterate every overload of the function name across ops, cortex, and public.
    -- hybrid_search lives in cortex; most others are in public; be permissive.
    FOR v_schema, v_signature IN
      SELECT n.nspname, format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = v_func
        AND n.nspname IN ('public', 'cortex', 'ops', 'directory', 'finance')
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_signature);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_signature);
    END LOOP;
  END LOOP;
END $$;
