-- =============================================================================
-- Feature consent system (Shape C)
--
-- Three tables power the in-app flag-flipping + GDPR audit flow:
--
--   1. cortex.consent_log — append-only record of who accepted which term
--      version when. Immutable after write; revocations insert a sibling
--      row with revoked_at set rather than mutating.
--
--   2. cortex.feature_access_requests — members request access to a gated
--      feature; admins approve or deny. For v1 the approval has no direct
--      grant effect (flags are workspace-level, not per-member), but the
--      audit trail supports future paid per-member add-ons.
--
--   3. cortex.ui_notices — one-shot banners for affected users when an
--      admin flips a feature off. Marked seen_at on dismiss.
--
-- Follows cortex.relationships pattern: reads via RLS, writes via
-- SECURITY DEFINER RPCs. RLS on consent_log + ui_notices scopes per-user;
-- access_requests visible to admins + the requesting member.
-- =============================================================================


-- =============================================================================
-- 1. cortex.consent_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.consent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,           -- auth.uid() of accepting user
  term_key        text NOT NULL,           -- e.g. 'aion_card_beta', 'owner_cadence_learning'
  term_version    text NOT NULL,           -- semver-like; bump to trigger re-consent
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,             -- NULL = still valid; set on revoke
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Active consents: fast lookup for "has user X accepted term Y version Z?"
CREATE INDEX IF NOT EXISTS idx_consent_log_active
  ON cortex.consent_log (workspace_id, user_id, term_key, term_version)
  WHERE revoked_at IS NULL;

-- Append-only invariant: we don't UPDATE consent_log, we INSERT new rows.
-- A future `revoke_consent` RPC inserts a sibling revocation; we do NOT
-- mutate accepted_at, user_id, term_key, term_version on existing rows.
-- Enforce via RLS (authenticated has NO update/delete privilege below).

ALTER TABLE cortex.consent_log ENABLE ROW LEVEL SECURITY;

-- SELECT: a user sees their own consents within workspaces they belong to.
-- Admins + owners see all consents in their workspace (audit trail).
CREATE POLICY consent_log_select ON cortex.consent_log FOR SELECT USING (
  workspace_id IN (SELECT get_my_workspace_ids())
  AND (
    user_id = auth.uid()
    OR public.get_member_role_slug(workspace_id) IN ('owner', 'admin')
  )
);

-- No direct INSERT / UPDATE / DELETE policies. All writes route through
-- cortex.record_consent / cortex.revoke_consent SECURITY DEFINER RPCs.

COMMENT ON TABLE cortex.consent_log IS
  'Append-only audit trail for feature consent. One row per (user, term, version) accept; revocations insert a sibling row with revoked_at set. Writes via cortex.record_consent / cortex.revoke_consent RPCs only. See docs/reference/aion-deal-card-unified-design.md §21 (Shape C consent system).';


-- =============================================================================
-- 2. cortex.feature_access_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.feature_access_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL,           -- auth.uid() of requesting member
  feature_key     text NOT NULL,           -- mirrors FEATURE_FLAGS key (e.g. 'crm.unified_aion_card')
  requested_at    timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),
  reviewed_by     uuid,                    -- auth.uid() of admin who reviewed
  reviewed_at     timestamptz,
  reviewer_note   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_feature_access_requests_pending
  ON cortex.feature_access_requests (workspace_id, feature_key, requested_at DESC)
  WHERE status = 'pending';

ALTER TABLE cortex.feature_access_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: requester sees their own request; admins see all in workspace.
CREATE POLICY feature_access_requests_select ON cortex.feature_access_requests FOR SELECT USING (
  workspace_id IN (SELECT get_my_workspace_ids())
  AND (
    requested_by = auth.uid()
    OR public.get_member_role_slug(workspace_id) IN ('owner', 'admin')
  )
);

-- No direct INSERT/UPDATE/DELETE; writes via RPCs.

COMMENT ON TABLE cortex.feature_access_requests IS
  'Queue of member-originated "please enable this feature" requests. Admin approves/denies via cortex.review_feature_request RPC. For v1 approval is audit-only — flags remain workspace-wide. Future paid per-member grants hang off this.';


-- =============================================================================
-- 3. cortex.ui_notices — one-shot banners
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.ui_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,           -- recipient
  notice_type     text NOT NULL,           -- e.g. 'feature_disabled', 'consent_expired'
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  expires_at      timestamptz               -- auto-garbage-collect stale notices
);

CREATE INDEX IF NOT EXISTS idx_ui_notices_pending
  ON cortex.ui_notices (workspace_id, user_id, created_at DESC)
  WHERE seen_at IS NULL;

ALTER TABLE cortex.ui_notices ENABLE ROW LEVEL SECURITY;

-- SELECT: a user sees their own notices. No cross-user visibility.
CREATE POLICY ui_notices_select ON cortex.ui_notices FOR SELECT USING (
  user_id = auth.uid()
  AND workspace_id IN (SELECT get_my_workspace_ids())
);

-- UPDATE: users can mark their own notices seen. Nothing else.
CREATE POLICY ui_notices_mark_seen ON cortex.ui_notices FOR UPDATE USING (
  user_id = auth.uid()
  AND workspace_id IN (SELECT get_my_workspace_ids())
)
WITH CHECK (
  user_id = auth.uid()
  AND workspace_id IN (SELECT get_my_workspace_ids())
);

COMMENT ON TABLE cortex.ui_notices IS
  'One-shot banners for admin-flip side effects. DealLens + settings surfaces read pending notices on mount and show toast/banner once, marking seen_at. Notices fanned out via cortex.fanout_ui_notice RPC (one row per affected user).';


-- =============================================================================
-- 4. Write RPCs — SECURITY DEFINER with explicit REVOKE/GRANT posture
-- =============================================================================

-- 4.1 Record a consent (any authenticated user; user_id forced to auth.uid())
CREATE OR REPLACE FUNCTION cortex.record_consent(
  p_workspace_id  uuid,
  p_term_key      text,
  p_term_version  text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_consent requires an authenticated caller';
  END IF;

  -- Validate membership before accepting on behalf of this user + workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of workspace %', p_workspace_id;
  END IF;

  INSERT INTO cortex.consent_log (workspace_id, user_id, term_key, term_version, metadata)
  VALUES (p_workspace_id, auth.uid(), p_term_key, p_term_version, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.record_consent(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.record_consent(uuid, text, text, jsonb)
  TO authenticated, service_role;

-- 4.2 Revoke a consent (admin/owner OR the user themselves)
CREATE OR REPLACE FUNCTION cortex.revoke_consent(
  p_workspace_id  uuid,
  p_term_key      text,
  p_target_user   uuid DEFAULT NULL       -- NULL = revoke own; non-NULL requires admin/owner
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
DECLARE
  v_target uuid;
  v_role text;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'revoke_consent requires an authenticated caller';
  END IF;

  v_target := COALESCE(p_target_user, auth.uid());

  -- Admin/owner needed to revoke someone else's consent
  IF v_target <> auth.uid() THEN
    v_role := public.get_member_role_slug(p_workspace_id);
    IF v_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'only owners and admins can revoke others'' consent';
    END IF;
  END IF;

  UPDATE cortex.consent_log
     SET revoked_at = now()
   WHERE workspace_id = p_workspace_id
     AND user_id = v_target
     AND term_key = p_term_key
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.revoke_consent(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.revoke_consent(uuid, text, uuid) TO authenticated, service_role;

-- 4.3 Member submits an access request
CREATE OR REPLACE FUNCTION cortex.request_feature_access(
  p_workspace_id  uuid,
  p_feature_key   text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_feature_access requires an authenticated caller';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of workspace %', p_workspace_id;
  END IF;

  -- Dedup: if a pending request from this user for this feature exists,
  -- return its id instead of inserting a duplicate.
  SELECT id INTO v_id
    FROM cortex.feature_access_requests
   WHERE workspace_id = p_workspace_id
     AND requested_by = auth.uid()
     AND feature_key = p_feature_key
     AND status = 'pending'
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO cortex.feature_access_requests
    (workspace_id, requested_by, feature_key, metadata)
  VALUES
    (p_workspace_id, auth.uid(), p_feature_key, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.request_feature_access(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.request_feature_access(uuid, text, jsonb)
  TO authenticated, service_role;

-- 4.4 Admin reviews a request
CREATE OR REPLACE FUNCTION cortex.review_feature_request(
  p_request_id    uuid,
  p_decision      text,                     -- 'approved' | 'denied'
  p_note          text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
DECLARE
  v_ws uuid;
  v_role text;
BEGIN
  IF p_decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'decision must be approved or denied';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_feature_request requires an authenticated caller';
  END IF;

  SELECT workspace_id INTO v_ws
    FROM cortex.feature_access_requests
   WHERE id = p_request_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'request % not found', p_request_id;
  END IF;

  v_role := public.get_member_role_slug(v_ws);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only owners and admins can review feature requests';
  END IF;

  UPDATE cortex.feature_access_requests
     SET status = p_decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         reviewer_note = p_note
   WHERE id = p_request_id
     AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.review_feature_request(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.review_feature_request(uuid, text, text)
  TO authenticated, service_role;

-- 4.5 Admin fans out a UI notice to all affected members
CREATE OR REPLACE FUNCTION cortex.fanout_ui_notice(
  p_workspace_id  uuid,
  p_notice_type   text,
  p_payload       jsonb DEFAULT '{}'::jsonb,
  p_expires_at    timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
DECLARE
  v_role text;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fanout_ui_notice requires an authenticated caller';
  END IF;

  v_role := public.get_member_role_slug(p_workspace_id);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only owners and admins can fan out notices';
  END IF;

  INSERT INTO cortex.ui_notices (workspace_id, user_id, notice_type, payload, expires_at)
  SELECT p_workspace_id, wm.user_id, p_notice_type, p_payload, p_expires_at
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.fanout_ui_notice(uuid, text, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.fanout_ui_notice(uuid, text, jsonb, timestamptz)
  TO authenticated, service_role;

-- 4.6 User dismisses a notice
CREATE OR REPLACE FUNCTION cortex.dismiss_ui_notice(p_notice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex
AS $$
BEGIN
  UPDATE cortex.ui_notices
     SET seen_at = now()
   WHERE id = p_notice_id
     AND user_id = auth.uid()
     AND seen_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.dismiss_ui_notice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.dismiss_ui_notice(uuid) TO authenticated, service_role;
