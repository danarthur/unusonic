-- Move 1 of 3 (cortex scope-creep cleanup, Wk 16) — referrals → finance.
--
-- Referrals are commission/incoming-deal tracking. They belong in finance, not
-- cortex. cortex's scope per CLAUDE.md is graph edges + AI memory + Aion data
-- substrate; referrals fit none of those.
--
-- ALTER TABLE SET SCHEMA preserves indexes, RLS policies, and grants. Functions
-- have to be CREATE-then-DROP because their bodies reference cortex.referrals
-- explicitly — ALTER FUNCTION SET SCHEMA would orphan those references.

-- ── Step 1: move the table ────────────────────────────────────────────────
ALTER TABLE cortex.referrals SET SCHEMA finance;

-- ── Step 2: recreate functions in finance with bodies pointing at the new
-- table location. SECURITY DEFINER + workspace-member gate preserved.

CREATE OR REPLACE FUNCTION finance.log_referral(
  p_workspace_id uuid,
  p_direction text,
  p_counterparty_entity_id uuid,
  p_client_name text DEFAULT NULL,
  p_client_entity_id uuid DEFAULT NULL,
  p_related_deal_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'finance', 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_direction NOT IN ('received', 'sent') THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Counterparty must live in the same workspace.
  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_counterparty_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Optional client_entity must live in the same workspace if provided.
  IF p_client_entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_client_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Optional deal must live in the same workspace if provided.
  IF p_related_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_related_deal_id AND workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  INSERT INTO finance.referrals (
    workspace_id, direction, counterparty_entity_id,
    client_name, client_entity_id, related_deal_id, note,
    created_by
  ) VALUES (
    p_workspace_id, p_direction, p_counterparty_entity_id,
    NULLIF(p_client_name, ''), p_client_entity_id, p_related_deal_id,
    NULLIF(p_note, ''),
    v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION finance.delete_referral(p_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'finance', 'public'
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_workspace uuid;
  v_created_by uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, created_by INTO v_workspace, v_created_by
    FROM finance.referrals WHERE id = p_referral_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  -- Must be a workspace member. Any member can delete — referrals are shared.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  DELETE FROM finance.referrals WHERE id = p_referral_id;
  RETURN TRUE;
END;
$$;

-- ── Step 3: drop the cortex versions (now orphaned)
DROP FUNCTION cortex.log_referral(uuid, text, uuid, text, uuid, uuid, text);
DROP FUNCTION cortex.delete_referral(uuid);

-- ── Step 4: grants on the new finance functions
REVOKE EXECUTE ON FUNCTION finance.log_referral(uuid, text, uuid, text, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finance.log_referral(uuid, text, uuid, text, uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION finance.log_referral(uuid, text, uuid, text, uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION finance.delete_referral(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finance.delete_referral(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION finance.delete_referral(uuid) TO authenticated, service_role;

-- ── Step 5: safety audit
DO $$
BEGIN
  IF has_function_privilege('anon', 'finance.log_referral(uuid, text, uuid, text, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: anon has EXECUTE on finance.log_referral';
  END IF;
  IF has_function_privilege('anon', 'finance.delete_referral(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: anon has EXECUTE on finance.delete_referral';
  END IF;
  -- Verify table moved
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'finance' AND c.relname = 'referrals') THEN
    RAISE EXCEPTION 'Schema move failed: finance.referrals does not exist';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cortex' AND c.relname = 'referrals') THEN
    RAISE EXCEPTION 'Schema move failed: cortex.referrals still exists';
  END IF;
END $$;
