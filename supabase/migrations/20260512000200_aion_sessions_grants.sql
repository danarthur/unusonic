-- =============================================================================
-- Grant table access on cortex.aion_sessions + cortex.aion_messages.
--
-- Original migration 20260408120000 created these tables without table-level
-- grants; existing app code worked because it only reached them via SECURITY
-- DEFINER RPCs (create_aion_session, save_aion_message, delete_aion_session,
-- update_aion_session_summary). The new scope-aware chat path reads
-- aion_sessions directly to resolve scope_type + scope_entity_id for the
-- system-prompt context block, so the missing grants surface now as 42501
-- permission_denied.
--
-- RLS stays authoritative — the existing SELECT policy already restricts
-- authenticated reads to user_id = auth.uid(). service_role bypasses RLS as
-- expected and is used by server-side chat/cron paths.
-- =============================================================================

GRANT SELECT ON cortex.aion_sessions TO authenticated, service_role;
GRANT SELECT ON cortex.aion_messages TO authenticated, service_role;
