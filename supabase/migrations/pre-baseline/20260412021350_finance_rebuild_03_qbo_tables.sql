-- =============================================================================
-- Finance Rebuild — Migration 3 of 5: QBO Integration Tables
--
-- Creates the QuickBooks Online integration layer:
--   - finance.qbo_connections: per-workspace OAuth state, tokens via Supabase Vault
--   - finance.qbo_entity_map: universal local↔QBO ID joiner with sync token
--   - finance.qbo_sync_log: append-only audit of every QBO API call
--   - finance.sync_jobs: queue/worker state for the push pipeline
--   - finance.get_fresh_qbo_token: advisory-lock-protected token refresh
--
-- Token storage uses supabase_vault.create_secret() which wraps pgsodium with
-- managed keys — verified available 2026-04-11. Plan §3.4 originally proposed
-- raw pgsodium; Vault is the recommended Supabase pattern.
--
-- The advisory lock pattern in get_fresh_qbo_token was verified 2026-04-11
-- against the production DB: pg_advisory_xact_lock + reentrant acquire works
-- inside a single SECURITY DEFINER function call. PostgREST holds one
-- transaction per RPC, so the lock survives the duration of the request.
-- =============================================================================

BEGIN;

-- ===========================================================================
-- finance.qbo_connections — one realm per workspace (Field Expert)
-- ===========================================================================
CREATE TABLE finance.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,

  realm_id text NOT NULL,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'sandbox')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconsent', 'revoked')),

  -- Token storage via Supabase Vault. We store SECRET IDs here, never the raw
  -- secrets. Vault handles encryption, key management, and access control.
  -- Use vault.decrypted_secrets view to read; vault.create_secret/update_secret to write.
  access_token_secret_id uuid NOT NULL,
  refresh_token_secret_id uuid NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  last_refreshed_at timestamptz NULL,

  -- Default mappings created during OAuth wizard (5 items per item_kind, not one)
  default_item_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_tax_code_id text NULL,
  default_income_account_id text NULL,
  default_deposit_account_id text NULL,

  -- Audit
  connected_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz NULL,
  last_sync_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finance_qbo_connections_set_updated_at
  BEFORE UPDATE ON finance.qbo_connections
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.qbo_connections IS
  'One QuickBooks realm per workspace. Tokens stored via Supabase Vault — only the secret IDs live here. Documented limitation: multi-book production companies (LLC + S-corp) must create a second Unusonic workspace.';

COMMENT ON COLUMN finance.qbo_connections.default_item_ids IS
  'JSONB map of item_kind → QBO Item.Id. Populated by OAuth wizard with 5 default items (service, rental, talent, fee, discount). Linda gets 5 meaningful Sales by Item rows on day one, not one collapsed row.';

-- ===========================================================================
-- finance.qbo_entity_map — universal local↔QBO joiner
-- ===========================================================================
CREATE TABLE finance.qbo_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  local_type text NOT NULL CHECK (local_type IN ('entity', 'invoice', 'payment', 'item', 'tax_rate', 'bill', 'bill_payment')),
  local_id uuid NOT NULL,

  qbo_type text NOT NULL CHECK (qbo_type IN ('Customer', 'Invoice', 'Payment', 'Item', 'TaxCode', 'Bill', 'BillPayment')),
  qbo_id text NOT NULL,
  qbo_sync_token text NOT NULL,

  -- Skip no-op pushes by hashing the last payload
  last_hash text NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Both directions of lookup must be unique within a workspace
  UNIQUE (workspace_id, local_type, local_id),
  UNIQUE (workspace_id, qbo_type, qbo_id)
);

CREATE INDEX idx_finance_qbo_entity_map_workspace_local ON finance.qbo_entity_map(workspace_id, local_type, local_id);
CREATE INDEX idx_finance_qbo_entity_map_workspace_qbo ON finance.qbo_entity_map(workspace_id, qbo_type, qbo_id);

CREATE TRIGGER finance_qbo_entity_map_set_updated_at
  BEFORE UPDATE ON finance.qbo_entity_map
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.qbo_entity_map IS
  'Universal join between Unusonic entities and QBO objects. Customer mapping never uses fuzzy matching — only exact display_name match for auto-link, otherwise explicit user choice (modal for ambiguous, chip for unmatched). Prevents the HoneyBook duplicate-customer trap.';

-- ===========================================================================
-- finance.qbo_sync_log — append-only audit of every API call
-- ===========================================================================
CREATE TABLE finance.qbo_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  local_type text NOT NULL,
  local_id uuid NOT NULL,
  qbo_type text NULL,
  qbo_id text NULL,

  operation text NOT NULL CHECK (operation IN ('create', 'update', 'void', 'delete', 'query', 'oauth_refresh')),
  direction text NOT NULL DEFAULT 'push' CHECK (direction IN ('push', 'pull')),

  -- Deterministic Intuit RequestId — non-negotiable per Field Expert
  request_id text NOT NULL,

  qbo_response_status int NULL,
  qbo_response_body jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  duration_ms int NULL,

  attempt_number int NOT NULL DEFAULT 1,

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX idx_finance_qbo_sync_log_workspace_started ON finance.qbo_sync_log(workspace_id, started_at DESC);
CREATE INDEX idx_finance_qbo_sync_log_local ON finance.qbo_sync_log(workspace_id, local_type, local_id, started_at DESC);
CREATE INDEX idx_finance_qbo_sync_log_failed ON finance.qbo_sync_log(workspace_id, started_at DESC) WHERE error_message IS NOT NULL;

COMMENT ON TABLE finance.qbo_sync_log IS
  'Append-only audit log of every QBO API call. This is Linda''s debugging lifeline. Clickable from the sync status chip on any invoice. 1-year rolling retention via cleanup cron added in Wave 2.';

COMMENT ON COLUMN finance.qbo_sync_log.request_id IS
  'Deterministic Intuit RequestId derived from sha256(workspace_id || local_type || local_id || operation || attempt_version). Same RequestId on retry causes Intuit to return cached response — single most important defense against duplicate-invoice creation.';

-- ===========================================================================
-- finance.sync_jobs — worker queue
-- ===========================================================================
CREATE TABLE finance.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  job_kind text NOT NULL CHECK (job_kind IN (
    'push_customer', 'push_item', 'push_tax_code',
    'push_invoice', 'push_payment', 'void_invoice', 'refund_payment',
    'oauth_refresh', 'backfill_retry'
  )),
  local_id uuid NOT NULL,

  state text NOT NULL DEFAULT 'queued' CHECK (state IN (
    'queued', 'in_progress', 'succeeded', 'failed', 'dead_letter', 'pending_mapping'
  )),
  attempt_number int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),

  last_error text NULL,
  request_id text NULL,

  -- For "push customer first, then invoice" dependency chains
  depends_on_job_id uuid NULL REFERENCES finance.sync_jobs(id) ON DELETE SET NULL,

  -- Lease for worker concurrency safety
  leased_by text NULL,
  leased_until timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_sync_jobs_dispatch ON finance.sync_jobs(workspace_id, state, next_attempt_at)
  WHERE state IN ('queued', 'failed');
CREATE INDEX idx_finance_sync_jobs_dependency ON finance.sync_jobs(depends_on_job_id) WHERE depends_on_job_id IS NOT NULL;

CREATE TRIGGER finance_sync_jobs_set_updated_at
  BEFORE UPDATE ON finance.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.sync_jobs IS
  'QBO push worker queue. Per-workspace concurrency limit (1 in-flight job per workspace) prevents Intuit rate-limit collisions. Exponential backoff [1m, 5m, 30m, 2h, 12h]. Attempt 6+ enters dead_letter state with persistent dashboard banner and admin email.';

-- ===========================================================================
-- finance.get_fresh_qbo_token — advisory-lock-protected token refresh
--
-- Critical implementation rule: every QBO-touching code path calls this
-- function exactly ONCE per operation, then holds the returned access token
-- in a local variable. Never split read-and-refresh across multiple client
-- round-trips — that would defeat the per-workspace mutex.
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid)
RETURNS TABLE(access_token text, realm_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, vault, public, pg_temp
AS $$
DECLARE
  v_lock_key bigint;
  v_access_token_secret_id uuid;
  v_refresh_token_secret_id uuid;
  v_access_token_expires_at timestamptz;
  v_realm_id text;
  v_status text;
  v_access_token text;
BEGIN
  -- Per-workspace lock. xact_lock releases on transaction end (= end of this
  -- RPC call when invoked via PostgREST). PostgREST holds one transaction
  -- per request, so concurrent invocations from different Edge Function
  -- instances will serialize correctly through this gate.
  v_lock_key := hashtext('qbo_refresh_' || p_workspace_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Read connection state.
  SELECT
    access_token_secret_id,
    refresh_token_secret_id,
    access_token_expires_at,
    realm_id,
    status
  INTO
    v_access_token_secret_id,
    v_refresh_token_secret_id,
    v_access_token_expires_at,
    v_realm_id,
    v_status
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No QBO connection for workspace %', p_workspace_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'QBO connection for workspace % is %, not active', p_workspace_id, v_status
      USING ERRCODE = 'P0002';
  END IF;

  -- If still valid for at least 5 minutes, return current access token.
  IF v_access_token_expires_at > now() + interval '5 minutes' THEN
    SELECT decrypted_secret INTO v_access_token
    FROM vault.decrypted_secrets
    WHERE id = v_access_token_secret_id;

    RETURN QUERY SELECT v_access_token, v_realm_id;
    RETURN;
  END IF;

  -- Refresh path. The actual HTTP call to Intuit's refresh endpoint must be
  -- performed by the caller (Edge Function). This function only manages the
  -- lock + read-current-state pattern. The caller, after fetching new tokens,
  -- calls finance.persist_refreshed_qbo_tokens() inside the SAME RPC chain
  -- (which extends the same transaction and the same advisory lock).
  --
  -- For now we return the current (possibly-stale) token and signal via a
  -- flag column added to the connection. The full refresh choreography is
  -- implemented in PR-CLIENT-5 alongside the OAuth flow.
  SELECT decrypted_secret INTO v_access_token
  FROM vault.decrypted_secrets
  WHERE id = v_access_token_secret_id;

  -- Mark connection as needing refresh — caller will see this and act.
  UPDATE finance.qbo_connections
  SET last_sync_error = 'Access token expired or near expiry; caller must refresh'
  WHERE workspace_id = p_workspace_id;

  RETURN QUERY SELECT v_access_token, v_realm_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.get_fresh_qbo_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.get_fresh_qbo_token(uuid) TO service_role;

COMMENT ON FUNCTION finance.get_fresh_qbo_token(uuid) IS
  'Advisory-lock-protected token reader. Holds pg_advisory_xact_lock on hashtext(qbo_refresh_<workspace>) for the duration of the RPC call. Service role only. The full refresh-and-persist flow is completed in PR-CLIENT-5 — this function ships in Migration 3 to lock in the lock pattern and column shape.';

-- ===========================================================================
-- finance.persist_refreshed_qbo_tokens — companion writer
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.persist_refreshed_qbo_tokens(
  p_workspace_id uuid,
  p_new_access_token text,
  p_new_refresh_token text,
  p_access_expires_in_seconds int,
  p_refresh_expires_in_seconds int DEFAULT 8640000  -- 100 days
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, vault, public, pg_temp
AS $$
DECLARE
  v_lock_key bigint;
  v_access_token_secret_id uuid;
  v_refresh_token_secret_id uuid;
BEGIN
  -- Same lock key as get_fresh_qbo_token — caller is expected to invoke both
  -- in the same transaction so the lock is held throughout.
  v_lock_key := hashtext('qbo_refresh_' || p_workspace_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT access_token_secret_id, refresh_token_secret_id
  INTO v_access_token_secret_id, v_refresh_token_secret_id
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id;

  -- Update both Vault secrets in place.
  PERFORM vault.update_secret(v_access_token_secret_id, p_new_access_token);
  PERFORM vault.update_secret(v_refresh_token_secret_id, p_new_refresh_token);

  UPDATE finance.qbo_connections
  SET access_token_expires_at = now() + (p_access_expires_in_seconds || ' seconds')::interval,
      refresh_token_expires_at = now() + (p_refresh_expires_in_seconds || ' seconds')::interval,
      last_refreshed_at = now(),
      last_sync_error = NULL
  WHERE workspace_id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.persist_refreshed_qbo_tokens(uuid, text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.persist_refreshed_qbo_tokens(uuid, text, text, int, int) TO service_role;

-- ===========================================================================
-- Sanity checks
-- ===========================================================================
DO $$
DECLARE
  v_table_count int;
  v_func_count int;
BEGIN
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'finance'
    AND table_name IN ('qbo_connections', 'qbo_entity_map', 'qbo_sync_log', 'sync_jobs');

  IF v_table_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 finance QBO tables, found %', v_table_count;
  END IF;

  SELECT count(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'finance'
    AND p.proname IN ('get_fresh_qbo_token', 'persist_refreshed_qbo_tokens');

  IF v_func_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 QBO functions, found %', v_func_count;
  END IF;

  -- REVOKE posture check for the new functions
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'finance'
      AND p.prosecdef
      AND p.proname IN ('get_fresh_qbo_token', 'persist_refreshed_qbo_tokens')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'New SECURITY DEFINER QBO function has anon EXECUTE — REVOKE missing';
  END IF;
END $$;

COMMIT;
