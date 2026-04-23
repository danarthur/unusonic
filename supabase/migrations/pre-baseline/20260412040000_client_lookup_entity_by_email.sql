-- §1 Phase B: Email-lookup RPC for client portal magic-link sign-in.
-- Finds a directory.entities row by lower(attributes->>'email') and returns
-- the entity_id, workspace_id, and claimed status. Used by the magic-link
-- route to decide between the Supabase auth path (claimed) and OTP path (ghost).
--
-- Grant: service_role ONLY. The PR 5 event trigger auto-REVOKEs PUBLIC.
-- See: docs/reference/client-portal-magic-link-research.md (R1)

-- 1. Functional index for fast case-insensitive email lookup
CREATE INDEX IF NOT EXISTS entities_primary_email_idx
  ON directory.entities ((lower(attributes->>'email')))
  WHERE attributes ? 'email';

-- 2. Lookup RPC
CREATE OR REPLACE FUNCTION client_lookup_entity_by_email(
  p_email_lower text,
  p_workspace_hint uuid DEFAULT NULL
)
RETURNS TABLE (
  entity_id uuid,
  workspace_id uuid,
  is_claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Return entity matching the email. If workspace_hint is provided, prefer
  -- entities in that workspace; otherwise return the first match by created_at.
  -- LIMIT 1: an email should map to one entity per workspace. If there are
  -- duplicates, the oldest wins (most likely the original ghost).
  RETURN QUERY
    SELECT
      e.id AS entity_id,
      e.owner_workspace_id AS workspace_id,
      (e.claimed_by_user_id IS NOT NULL) AS is_claimed
    FROM directory.entities e
    WHERE lower(e.attributes->>'email') = p_email_lower
    ORDER BY
      -- Prefer the hinted workspace if provided
      CASE WHEN p_workspace_hint IS NOT NULL
           AND e.owner_workspace_id = p_workspace_hint
           THEN 0 ELSE 1 END,
      e.created_at ASC
    LIMIT 1;
END;
$$;

-- 3. Explicit grant posture (belt-and-suspenders with the event trigger)
REVOKE ALL ON FUNCTION client_lookup_entity_by_email(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION client_lookup_entity_by_email(text, uuid) TO service_role;

COMMENT ON FUNCTION client_lookup_entity_by_email IS
  'Client portal magic-link: find entity by email. Service-role only. §1 Phase B.';
