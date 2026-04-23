-- =============================================================================
-- Multi-date P0 — _expand_series_rule helper
--
-- Expands a stored series_rule JSONB to its effective date list (rdates minus
-- exdates, deduped and chronologically sorted). The RRULE string field is a
-- display label only and is NEVER read here — JS clients expand the RRULE at
-- creation time via the `rrule` npm package and persist the materialized list
-- in `rdates`. The database is deliberately ignorant of RFC 5545 semantics.
--
-- Returns a setof date so callers can use it in FROM clauses:
--   SELECT * FROM ops.projects p, _expand_series_rule(p.series_rule) d
--   WHERE p.is_series = true;
--
-- Grant posture: SECURITY INVOKER + REVOKE FROM PUBLIC/anon. The function is
-- pure (reads only its argument), but defense-in-depth against anon calls
-- matches the repo convention.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops._expand_series_rule(p_series_rule jsonb)
RETURNS SETOF date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT d::date
  FROM (
    SELECT DISTINCT r::date AS d
    FROM jsonb_array_elements_text(COALESCE(p_series_rule -> 'rdates', '[]'::jsonb)) AS r
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p_series_rule -> 'exdates', '[]'::jsonb)) AS x
      WHERE x = r
    )
  ) s
  ORDER BY d;
$function$;

REVOKE ALL ON FUNCTION ops._expand_series_rule(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops._expand_series_rule(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION ops._expand_series_rule(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION ops._expand_series_rule(jsonb) TO service_role;

COMMENT ON FUNCTION ops._expand_series_rule(jsonb) IS
  'Returns the effective date list of a series_rule (rdates - exdates, sorted). RRULE is NOT expanded — JS clients expand at write time and persist rdates.';
