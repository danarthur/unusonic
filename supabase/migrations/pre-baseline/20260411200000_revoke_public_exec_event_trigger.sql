-- =============================================================================
-- Event trigger: auto-REVOKE PUBLIC EXECUTE on new functions
--
-- Companion to 20260411190000_default_function_grant_posture.sql.
--
-- Problem: Postgres's hardcoded initial privilege "EXECUTE TO PUBLIC" on new
-- functions cannot be removed via `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE
-- FROM PUBLIC`. The pg_default_acl REVOKE entries only affect EXPLICIT grants,
-- not the system-level implicit PUBLIC grant that every new function gets.
--
-- Verified via smoke test on 2026-04-11:
--   CREATE FUNCTION public._test() ... SECURITY DEFINER
--   → raw_acl = {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--                ^^^ implicit PUBLIC grant, despite the REVOKE in pg_default_acl
--   → anon can still EXECUTE (inherits from PUBLIC)
--
-- Since `anon` and `authenticated` inherit from PUBLIC, every new function
-- in our 5 workspace schemas would remain effectively callable by unauthenticated
-- users — the exact shape that produced the April 2026 `client_*` grant-hole
-- incident. The ALTER DEFAULT PRIVILEGES migration alone is insufficient.
--
-- Fix: install an event trigger that fires after every `CREATE FUNCTION` /
-- `CREATE PROCEDURE` in our 5 workspace schemas, and explicitly REVOKEs
-- EXECUTE FROM PUBLIC on the new function. This runs automatically — no
-- per-migration discipline required.
--
-- ── Safety properties ─────────────────────────────────────────────────────
--
-- 1. SCOPED to public, directory, ops, finance, cortex. Never touches auth.*,
--    storage.*, extensions.*, graphql.*, realtime.*, pgsodium.*, etc.
--
-- 2. BULLETPROOF: the loop body is wrapped in a per-iteration EXCEPTION WHEN
--    OTHERS handler, so a bug in the REVOKE logic for one function can never
--    block other functions in the same migration OR future DDL. Failures
--    surface as RAISE WARNING, not RAISE EXCEPTION.
--
-- 3. SECURITY DEFINER: the trigger function runs with owner privileges so it
--    can REVOKE on any function in the 5 target schemas regardless of the
--    function's creator role.
--
-- 4. SET search_path = '': prevents search-path injection attacks against
--    the trigger function itself.
--
-- 5. Only listens to `CREATE FUNCTION` / `CREATE PROCEDURE` tags. Does NOT
--    interfere with `ALTER FUNCTION`, `DROP FUNCTION`, `GRANT`, etc.
--
-- 6. Per-migration REVOKE lines are still valid and recommended — this
--    trigger is defense in depth, not a replacement for explicit grant
--    hygiene in new migrations.
--
-- ── Existing functions are NOT touched ────────────────────────────────────
-- The trigger only fires on NEW function creation. The 35+ pre-existing
-- anon-executable functions surveyed in the §2.0 audit are unchanged —
-- they're tracked for per-function cleanup separately.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.revoke_public_exec_on_new_function()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  obj record;
  v_target_schemas text[] := ARRAY['public','directory','ops','finance','cortex'];
BEGIN
  FOR obj IN
    SELECT object_identity, schema_name, object_type
    FROM pg_event_trigger_ddl_commands()
    WHERE object_type IN ('function', 'procedure')
      AND schema_name = ANY(v_target_schemas)
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON %s %s FROM PUBLIC',
        CASE obj.object_type
          WHEN 'procedure' THEN 'PROCEDURE'
          ELSE 'FUNCTION'
        END,
        obj.object_identity
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block DDL. Log the failure so it's visible in Postgres logs
      -- and future audits can catch any functions that slipped through.
      RAISE WARNING
        '[revoke_public_exec_on_new_function] failed to revoke PUBLIC on %.%: %',
        obj.schema_name, obj.object_identity, SQLERRM;
    END;
  END LOOP;
END;
$function$;

-- Lock the trigger function itself down — callers have no reason to invoke
-- it directly; only the DDL engine should.
REVOKE ALL ON FUNCTION ops.revoke_public_exec_on_new_function() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.revoke_public_exec_on_new_function() FROM anon, authenticated;

COMMENT ON FUNCTION ops.revoke_public_exec_on_new_function() IS
  'Rescan §2.0 companion: event-trigger helper that auto-REVOKEs EXECUTE ON FUNCTION ... FROM PUBLIC for new functions in public/directory/ops/finance/cortex. Installed by trigger `revoke_public_on_new_function`. Wrapped in EXCEPTION WHEN OTHERS so a bug can never block DDL.';

-- Drop any prior version of the trigger (makes this migration idempotent
-- across re-runs and local db-reset flows).
DROP EVENT TRIGGER IF EXISTS revoke_public_on_new_function;

CREATE EVENT TRIGGER revoke_public_on_new_function
ON ddl_command_end
WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
EXECUTE FUNCTION ops.revoke_public_exec_on_new_function();

COMMENT ON EVENT TRIGGER revoke_public_on_new_function IS
  'Rescan §2.0: fires after every CREATE FUNCTION/PROCEDURE in public/directory/ops/finance/cortex and REVOKEs EXECUTE FROM PUBLIC. Defense in depth — per-migration REVOKE lines are still the canonical pattern, this trigger catches misses. See ops.revoke_public_exec_on_new_function() and migration 20260411200000 for details.';
