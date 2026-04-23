-- =============================================================================
-- Grant service_role CRUD on the ops schema.
--
-- Problem discovered 2026-04-10 while verifying client portal Phase B:
-- service_role has USAGE on the ops schema but ZERO grants on any of its 26
-- tables. Every server-side read/write against ops.* through the system
-- client (getSystemClient) silently returns an empty result or a
-- "permission denied" error that most callers don't log.
--
-- This gap is an oversight — when `ops` was created as a custom schema,
-- Supabase's default "GRANT ALL ON ALL TABLES TO service_role" (which only
-- applies to `public`) didn't cascade. Meanwhile `directory`, `finance`,
-- and `public` were all explicitly set up with full service_role grants,
-- so this inconsistency has been sitting quietly since ops was introduced.
--
-- What this fixes immediately:
--   - getClientHomeData can read ops.events and ops.deal_crew (the client
--     portal home page was falling into its empty-state branch because of
--     this).
--   - resolveDealContact's DJ crew fallback (path 3 of the PM card
--     resolution chain) can actually reach ops.deal_crew.
--   - `/client/event/[id]` stub can read ops.events.
--   - Any Aion / webhook / QBO sync / scheduled job that needs to write
--     ops.* rows under service_role (there are several that were likely
--     either broken or routing through ad-hoc RPCs as a workaround).
--
-- Security posture:
--   - service_role already bypasses ALL RLS by definition, so this does
--     not loosen any isolation boundary — it only closes the grant gap
--     that makes the bypass useless in practice.
--   - This change makes ops match directory/finance/public, which all
--     already have full service_role CRUD.
--   - The system client (src/shared/api/supabase/system.ts) is server-only
--     and is the only way to reach this role from app code.
--
-- Default privileges ensure any new tables added to ops in future
-- migrations automatically receive the same grants, so this class of
-- oversight cannot recur for this schema.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops TO service_role;

-- Cover sequences used by SERIAL / IDENTITY columns (none today, but
-- cheap insurance — matches the standard Supabase boilerplate).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops TO service_role;

-- Future tables / sequences inherit the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA ops
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
