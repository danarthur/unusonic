-- =============================================================================
-- Schema-level default function grant posture — rescan §2.0, R2 Makerkit pattern
--
-- Context: Postgres's default `CREATE FUNCTION` grants `EXECUTE TO PUBLIC`,
-- which in Supabase resolves to anon/authenticated. This is the exact shape
-- that produced the April 2026 `client_*` RPC grant-hole incident — 14
-- SECURITY DEFINER RPCs were silently callable by anon because nobody
-- REVOKEd the default grant.
--
-- R2 research (docs/reference/multi-step-create-patterns-research.md, §5)
-- identified the fix: adopt Makerkit's schema-level `ALTER DEFAULT PRIVILEGES`
-- posture. This migration applies that pattern for future functions.
--
-- SCOPE: this migration ONLY affects functions created AFTER it runs.
-- Existing functions are untouched — an audit query is provided in the
-- comments below for the separate per-function cleanup pass.
--
-- ---------------------------------------------------------------------------
-- Pre-flight audit (2026-04-11, via Supabase MCP):
--
-- Functions currently callable by anon across target schemas:
--   public:    35 SECURITY DEFINER functions (almost all legitimate RLS
--              helpers: get_my_workspace_ids, member_has_permission,
--              is_workspace_member, etc., plus trigger functions)
--   directory: 0
--   finance:   0
--   cortex:    1 non-SECURITY-DEFINER (match_memory — Aion RAG search,
--              subject to RLS on cortex.memory)
--   ops:       7 non-SECURITY-DEFINER trigger functions (set_*_updated_at,
--              guard_crew_equipment_verification_columns)
--
-- These 43 existing functions are NOT modified here. Most are legitimate
-- (RLS helpers run with the querying user's role, trigger functions don't
-- need anon access at all but the grant is harmless). Per-function cleanup
-- is a separate audit outside the scope of this migration.
-- ---------------------------------------------------------------------------
--
-- TWO-ROLE COVERAGE NOTE:
-- Migrations in this repo can be applied by either `postgres` (MCP-applied)
-- or `supabase_admin` (Supabase CLI `db push`). Each role's default_acl
-- entries are independent — a new function's ACL is derived from the
-- CREATOR's default_acl, not a global setting.
--
-- Postgres role membership is one-way: `supabase_admin` inherits from
-- `postgres`, but NOT the reverse. That means when running as `postgres`
-- (this MCP session), we can only set `ALTER DEFAULT PRIVILEGES FOR ROLE
-- postgres`. The `FOR ROLE supabase_admin` version lives at the bottom of
-- this file as commented-out SQL — apply it separately via the Supabase
-- Dashboard SQL Editor (which has supabase_admin access) or via
-- `supabase db push` when the CLI is next configured with superuser creds.
-- =============================================================================

-- ── public schema ─────────────────────────────────────────────────────────
-- Current state: explicit default ACL grants EXECUTE to anon/authenticated.
-- Revoke those grants so future functions don't inherit broad access.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- service_role stays — it's the backend escape hatch for system flows.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── directory schema ──────────────────────────────────────────────────────
-- Current state: no explicit default ACL → Postgres's implicit EXECUTE TO
-- PUBLIC default applies. Add explicit REVOKE so new functions don't inherit.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA directory
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA directory
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── ops schema ────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── finance schema ────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── cortex schema ─────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA cortex
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA cortex
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- =============================================================================
-- FOLLOW-UP: supabase_admin default privileges
--
-- The block below cannot be applied from the `postgres` session (permission
-- denied — postgres is not a member of supabase_admin). Apply ONE of:
--   1. Paste into the Supabase Dashboard SQL Editor (runs as supabase_admin)
--   2. Run `supabase db push` locally with superuser credentials
--   3. Contact Supabase support to run it on our behalf
--
-- Until applied, functions created via `supabase db push` (CLI migrations
-- applied as supabase_admin) will still inherit the current broad default.
-- In practice, this repo applies most migrations via MCP (running as
-- postgres), so the postgres-role coverage above handles the common path.
-- =============================================================================

/*
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA directory
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA directory
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA ops
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA ops
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA finance
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA finance
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cortex
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cortex
  GRANT EXECUTE ON FUNCTIONS TO service_role;
*/

-- =============================================================================
-- Reusable audit query — copy into a scheduled check or CI.
--
-- Surfaces any SECURITY DEFINER function in the 5 target schemas that anon
-- can execute. Every hit should be reviewed: either a legitimate RLS helper
-- (leave alone) or an illegitimate RPC (explicit REVOKE in its own migration).
--
--   SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname IN ('public','directory','ops','finance','cortex')
--     AND p.prosecdef = true
--     AND has_function_privilege('anon', p.oid, 'EXECUTE') = true
--   ORDER BY n.nspname, p.proname;
--
-- Pre-migration baseline: 35 rows (all in public, mostly RLS helpers).
-- Post-migration: same 35 rows — existing functions are untouched. New
-- drift from this point forward will be a visible delta in the audit.
-- =============================================================================
