-- =============================================================================
-- Replies — Phase 1 P0 #2
--
-- Three SECURITY DEFINER RPCs that own all writes to ops.messages,
-- ops.message_threads, and ops.follow_up_queue / ops.follow_up_log when a
-- reply arrives. See docs/reference/replies-design.md §4.2.
--
--   • ops.record_inbound_message            — the inbound webhook ingress
--   • ops.record_outbound_message_draft     — outbound insert-first step
--   • ops.stamp_outbound_provider_id        — stamps provider_message_id after send
--   • ops.resolve_follow_up_on_reply        — auto-resolution primitive
--
-- Every function REVOKEs EXECUTE from PUBLIC and anon. The sev-zero bug class
-- that leaked 14 client_* RPCs to anon last quarter does not ship again. See
-- memory note feedback_postgres_function_grants.md.
-- =============================================================================


-- =============================================================================
-- 0. Extend ops.follow_up_log.action_type CHECK to allow 'reply_received'.
--
-- The original constraint (migration 20260330120000) did not anticipate
-- reply-driven auto-resolution. Extending the allowed set here keeps the
-- RPC semantically explicit (we log WHY the queue item flipped to acted,
-- not a shoehorned 'system_queued').
-- =============================================================================

ALTER TABLE ops.follow_up_log
  DROP CONSTRAINT IF EXISTS follow_up_log_action_type_check;

ALTER TABLE ops.follow_up_log
  ADD CONSTRAINT follow_up_log_action_type_check
  CHECK (action_type IN (
    'email_sent', 'sms_sent', 'call_logged', 'snoozed', 'dismissed', 'note_added',
    'system_queued', 'system_removed', 'reply_received'
  ));


-- =============================================================================
-- 1. ops.resolve_follow_up_on_reply
--
-- Called by record_inbound_message when an inbound reply arrives on a deal
-- with a pending follow_up_queue row. Flips the queue row to 'acted', logs
-- the resolution, and supersedes any sibling pending rows on the same deal.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.resolve_follow_up_on_reply(
  p_queue_item_id uuid,
  p_message_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id uuid;
  v_deal_id      uuid;
BEGIN
  -- Look up the queue item's workspace + deal. If it doesn't exist or is
  -- already acted/dismissed, no-op (caller may race with another resolver).
  SELECT workspace_id, deal_id INTO v_workspace_id, v_deal_id
  FROM ops.follow_up_queue
  WHERE id = p_queue_item_id AND status = 'pending';

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  -- Flip the queue row to acted. acted_by=NULL signals reply-auto-resolved.
  UPDATE ops.follow_up_queue
  SET status  = 'acted',
      acted_at = now(),
      acted_by = NULL,
      escalation_count = 0
  WHERE id = p_queue_item_id;

  -- Log the auto-resolution.
  INSERT INTO ops.follow_up_log (
    workspace_id,
    deal_id,
    actor_user_id,
    action_type,
    channel,
    summary,
    content,
    queue_item_id
  ) VALUES (
    v_workspace_id,
    v_deal_id,
    NULL,
    'reply_received',
    'email',
    'Auto-resolved by inbound reply',
    p_message_id::text,
    p_queue_item_id
  );

  -- Supersede sibling pending rows on the same deal. They're now redundant
  -- because the client responded.
  UPDATE ops.follow_up_queue
  SET status = 'dismissed',
      dismissal_reason = 'superseded_by_reply',
      superseded_at = now()
  WHERE deal_id = v_deal_id
    AND status = 'pending'
    AND id != p_queue_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.resolve_follow_up_on_reply(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.resolve_follow_up_on_reply(uuid, uuid) FROM anon;


-- =============================================================================
-- 2. ops.record_inbound_message
--
-- Called by /api/webhooks/resend (and later /api/webhooks/twilio) after
-- signature verification. Idempotent on provider_message_id.
--
-- Payload shape (jsonb, pre-parsed by the webhook handler):
-- {
--   "workspace_id":         uuid,          -- resolved from the Reply-To alias
--   "provider_message_id":  text,          -- Resend email_id or Twilio sid
--   "provider_thread_key":  text,          -- RFC2822 Message-ID root or Twilio conv sid
--   "channel":              text,          -- 'email' | 'sms'
--   "subject":              text,          -- optional (NULL for SMS)
--   "from_address":         text,
--   "to_addresses":         text[],
--   "cc_addresses":         text[],
--   "body_text":            text,
--   "body_html":            text,          -- optional
--   "attachments":          jsonb,         -- [{storage_path,filename,mime,size}]
--   "deal_id":              uuid,          -- optional — caller may know from alias
--   "in_reply_to_message_id": uuid         -- optional — resolved from References header
-- }
--
-- Returns the ops.messages.id of the newly-inserted (or existing, on retry)
-- row. Caller uses it for push notification + logging.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.record_inbound_message(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, directory
AS $$
DECLARE
  v_workspace_id       uuid  := (p_payload->>'workspace_id')::uuid;
  v_provider_msg_id    text  := p_payload->>'provider_message_id';
  v_provider_thread    text  := p_payload->>'provider_thread_key';
  v_channel            text  := p_payload->>'channel';
  v_subject            text  := p_payload->>'subject';
  v_from_address       text  := p_payload->>'from_address';
  v_to_addresses       text[];
  v_cc_addresses       text[];
  v_body_text          text  := p_payload->>'body_text';
  v_body_html          text  := p_payload->>'body_html';
  v_attachments        jsonb := COALESCE(p_payload->'attachments', '[]'::jsonb);
  v_deal_id            uuid  := NULLIF(p_payload->>'deal_id', '')::uuid;
  v_in_reply_to        uuid  := NULLIF(p_payload->>'in_reply_to_message_id', '')::uuid;

  v_thread_id          uuid;
  v_from_entity_id     uuid;
  v_message_id         uuid;
  v_existing_message_id uuid;
  v_urgency_keyword    text;
  v_needs_resolution   boolean := false;
  v_pending_queue_id   uuid;

  -- Keyword heuristic set. Phase 1.5 moves this to a workspace-configurable
  -- urgency_keywords column on public.workspaces.
  v_urgency_keywords   text[] := ARRAY['deposit', 'confirmed', 'booked', 'cancel', 'decline', 'contract'];
BEGIN
  IF v_workspace_id IS NULL OR v_provider_msg_id IS NULL OR v_provider_thread IS NULL THEN
    RAISE EXCEPTION 'record_inbound_message: workspace_id, provider_message_id, and provider_thread_key are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_channel NOT IN ('email', 'sms', 'call_note') THEN
    RAISE EXCEPTION 'record_inbound_message: invalid channel %', v_channel
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Array coercion — jsonb arrays → text[].
  SELECT ARRAY(SELECT jsonb_array_elements_text(p_payload->'to_addresses'))
    INTO v_to_addresses;
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'cc_addresses', '[]'::jsonb)))
    INTO v_cc_addresses;

  -- ── IDEMPOTENCY ────────────────────────────────────────────────────────
  -- If this provider_message_id already landed, return the existing row.
  SELECT id INTO v_existing_message_id
  FROM ops.messages
  WHERE provider_message_id = v_provider_msg_id;

  IF v_existing_message_id IS NOT NULL THEN
    RETURN v_existing_message_id;
  END IF;

  -- ── THREAD MATCH OR CREATE ─────────────────────────────────────────────
  SELECT id INTO v_thread_id
  FROM ops.message_threads
  WHERE workspace_id = v_workspace_id
    AND provider_thread_key = v_provider_thread;

  IF v_thread_id IS NULL THEN
    INSERT INTO ops.message_threads (
      workspace_id,
      provider_thread_key,
      channel,
      subject,
      deal_id,
      last_message_at,
      needs_resolution
    ) VALUES (
      v_workspace_id,
      v_provider_thread,
      v_channel,
      v_subject,
      v_deal_id,
      now(),
      false   -- flipped below if sender match fails
    )
    RETURNING id INTO v_thread_id;
  ELSE
    -- Update last_message_at on existing thread.
    UPDATE ops.message_threads
    SET last_message_at = now(),
        -- If the thread had deal_id=NULL but this message arrived with one, adopt it.
        deal_id = COALESCE(deal_id, v_deal_id)
    WHERE id = v_thread_id;
  END IF;

  -- ── SENDER → ENTITY MATCH ──────────────────────────────────────────────
  -- Exact email equality only. Fuzzy matching is out of scope for Phase 1
  -- per docs/reference/replies-design.md §5.9.
  IF v_channel = 'email' AND v_from_address IS NOT NULL THEN
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'email' = lower(v_from_address)
    LIMIT 1;
  ELSIF v_channel = 'sms' AND v_from_address IS NOT NULL THEN
    -- Phone match. Assumes incoming in E.164 normalized by the webhook.
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'phone' = v_from_address
    LIMIT 1;
  END IF;

  IF v_from_entity_id IS NULL THEN
    v_needs_resolution := true;
  END IF;

  -- If we matched a sender, set primary_entity_id on the thread (first-win).
  IF v_from_entity_id IS NOT NULL THEN
    UPDATE ops.message_threads
    SET primary_entity_id = COALESCE(primary_entity_id, v_from_entity_id)
    WHERE id = v_thread_id;
  END IF;

  -- Flip needs_resolution on thread if sender didn't match or we couldn't bind to a deal.
  IF v_needs_resolution OR v_deal_id IS NULL THEN
    UPDATE ops.message_threads
    SET needs_resolution = true
    WHERE id = v_thread_id;
  END IF;

  -- ── URGENCY KEYWORD HEURISTIC ─────────────────────────────────────────
  -- Phase 1: match first keyword in the body. Case-insensitive.
  IF v_body_text IS NOT NULL THEN
    SELECT kw INTO v_urgency_keyword
    FROM unnest(v_urgency_keywords) AS kw
    WHERE v_body_text ILIKE '%' || kw || '%'
    LIMIT 1;
  END IF;

  -- ── INSERT THE MESSAGE ROW ────────────────────────────────────────────
  INSERT INTO ops.messages (
    workspace_id,
    thread_id,
    direction,
    channel,
    provider_message_id,
    in_reply_to,
    from_entity_id,
    from_address,
    to_addresses,
    cc_addresses,
    body_text,
    body_html,
    attachments,
    urgency_keyword_match
  ) VALUES (
    v_workspace_id,
    v_thread_id,
    'inbound',
    v_channel,
    v_provider_msg_id,
    v_in_reply_to,
    v_from_entity_id,
    v_from_address,
    v_to_addresses,
    v_cc_addresses,
    v_body_text,
    v_body_html,
    v_attachments,
    v_urgency_keyword
  )
  RETURNING id INTO v_message_id;

  -- ── FOLLOW-UP AUTO-RESOLUTION ─────────────────────────────────────────
  IF v_deal_id IS NOT NULL THEN
    SELECT id INTO v_pending_queue_id
    FROM ops.follow_up_queue
    WHERE deal_id = v_deal_id
      AND workspace_id = v_workspace_id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_queue_id IS NOT NULL THEN
      PERFORM ops.resolve_follow_up_on_reply(v_pending_queue_id, v_message_id);
    END IF;
  END IF;

  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION ops.record_inbound_message(jsonb) IS
  'Inbound message ingress. Idempotent on provider_message_id. Matches thread, resolves sender, flips follow_up_queue, runs urgency heuristics. Returns message id.';

REVOKE EXECUTE ON FUNCTION ops.record_inbound_message(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.record_inbound_message(jsonb) FROM anon;


-- =============================================================================
-- 3. ops.record_outbound_message_draft
--
-- Insert-first-then-send pattern. Composer calls this BEFORE Resend send,
-- gets back message_id, then sends via Resend, then calls stamp_outbound
-- with the provider_message_id Resend returned.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.record_outbound_message_draft(
  p_workspace_id     uuid,
  p_thread_id        uuid,
  p_channel          text,
  p_to_addresses     text[],
  p_cc_addresses     text[],
  p_subject          text,
  p_body_text        text,
  p_body_html        text,
  p_attachments      jsonb,
  p_sent_by_user_id  uuid,
  p_in_reply_to      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_thread_workspace uuid;
  v_from_address     text;
  v_message_id       uuid;
BEGIN
  -- Verify the thread belongs to the claimed workspace.
  SELECT workspace_id INTO v_thread_workspace
  FROM ops.message_threads
  WHERE id = p_thread_id;

  IF v_thread_workspace IS NULL OR v_thread_workspace != p_workspace_id THEN
    RAISE EXCEPTION 'record_outbound_message_draft: thread not found or workspace mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Outbound from-address is the thread's per-thread alias. For Phase 1 email:
  -- thread-{thread_id}@replies.unusonic.com. The caller can override via
  -- future versions; for now it's deterministic.
  v_from_address := 'thread-' || p_thread_id::text || '@replies.unusonic.com';

  INSERT INTO ops.messages (
    workspace_id,
    thread_id,
    direction,
    channel,
    provider_message_id,
    in_reply_to,
    from_entity_id,
    from_address,
    to_addresses,
    cc_addresses,
    body_text,
    body_html,
    attachments,
    sent_by_user_id
  ) VALUES (
    p_workspace_id,
    p_thread_id,
    'outbound',
    p_channel,
    NULL,               -- stamped by stamp_outbound_provider_id after send
    p_in_reply_to,
    NULL,
    v_from_address,
    COALESCE(p_to_addresses, '{}'),
    COALESCE(p_cc_addresses, '{}'),
    p_body_text,
    p_body_html,
    COALESCE(p_attachments, '[]'::jsonb),
    p_sent_by_user_id
  )
  RETURNING id INTO v_message_id;

  -- Update thread's last_message_at so it sorts correctly in the Replies card.
  UPDATE ops.message_threads
  SET last_message_at = now(),
      subject = COALESCE(subject, p_subject)
  WHERE id = p_thread_id;

  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION ops.record_outbound_message_draft(uuid, uuid, text, text[], text[], text, text, text, jsonb, uuid, uuid) IS
  'Insert-first step of the outbound pipeline. Composer calls this BEFORE Resend send, stamps provider_message_id after via stamp_outbound_provider_id.';

REVOKE EXECUTE ON FUNCTION ops.record_outbound_message_draft(uuid, uuid, text, text[], text[], text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.record_outbound_message_draft(uuid, uuid, text, text[], text[], text, text, text, jsonb, uuid, uuid) FROM anon;


-- =============================================================================
-- 4. ops.stamp_outbound_provider_id
--
-- Called by the composer after Resend returns the provider message ID.
-- Completes the insert-first-then-send handshake.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.stamp_outbound_provider_id(
  p_message_id          uuid,
  p_provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
BEGIN
  UPDATE ops.messages
  SET provider_message_id = p_provider_message_id
  WHERE id = p_message_id
    AND direction = 'outbound'
    AND provider_message_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stamp_outbound_provider_id: no matching unstamped outbound message %', p_message_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.stamp_outbound_provider_id(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.stamp_outbound_provider_id(uuid, text) FROM anon;


-- =============================================================================
-- 5. Safety audit
--
-- Verifies no SECURITY DEFINER function in the messaging path is executable
-- by anon. This is the same audit pattern called out in
-- feedback_postgres_function_grants.md — the sev-zero bug we are NOT shipping
-- again.
-- =============================================================================

DO $$
DECLARE
  v_leaky_fn text;
BEGIN
  SELECT string_agg(proname, ', ')
  INTO v_leaky_fn
  FROM pg_proc
  WHERE pronamespace = 'ops'::regnamespace
    AND prosecdef
    AND proname IN (
      'record_inbound_message',
      'record_outbound_message_draft',
      'stamp_outbound_provider_id',
      'resolve_follow_up_on_reply'
    )
    AND has_function_privilege('anon', oid, 'EXECUTE');

  IF v_leaky_fn IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration audit failed: SECURITY DEFINER function(s) still executable by anon: %. REVOKE required.',
      v_leaky_fn;
  END IF;
END $$;
