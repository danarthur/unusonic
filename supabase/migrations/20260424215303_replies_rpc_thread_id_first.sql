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
  v_explicit_thread_id uuid  := NULLIF(p_payload->>'thread_id', '')::uuid;
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
  v_is_auto_reply      boolean := COALESCE((p_payload->>'is_auto_reply')::boolean, false);
  v_auto_reply_reason  text  := p_payload->>'auto_reply_reason';

  v_thread_id          uuid;
  v_thread_workspace   uuid;
  v_from_entity_id     uuid;
  v_message_id         uuid;
  v_existing_message_id uuid;
  v_urgency_keyword    text;
  v_needs_resolution   boolean := false;
  v_pending_queue_id   uuid;

  v_urgency_keywords   text[] := ARRAY['deposit', 'confirmed', 'booked', 'cancel', 'decline', 'contract'];
BEGIN
  IF v_workspace_id IS NULL OR v_provider_msg_id IS NULL THEN
    RAISE EXCEPTION 'record_inbound_message: workspace_id and provider_message_id are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_explicit_thread_id IS NULL AND v_provider_thread IS NULL THEN
    RAISE EXCEPTION 'record_inbound_message: one of thread_id or provider_thread_key is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_channel NOT IN ('email', 'sms', 'call_note') THEN
    RAISE EXCEPTION 'record_inbound_message: invalid channel %', v_channel
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT ARRAY(SELECT jsonb_array_elements_text(p_payload->'to_addresses'))
    INTO v_to_addresses;
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'cc_addresses', '[]'::jsonb)))
    INTO v_cc_addresses;

  SELECT id INTO v_existing_message_id
  FROM ops.messages
  WHERE workspace_id = v_workspace_id
    AND provider_message_id = v_provider_msg_id;

  IF v_existing_message_id IS NOT NULL THEN
    RETURN v_existing_message_id;
  END IF;

  IF v_explicit_thread_id IS NOT NULL THEN
    SELECT workspace_id INTO v_thread_workspace
    FROM ops.message_threads
    WHERE id = v_explicit_thread_id;

    IF v_thread_workspace IS NULL THEN
      RAISE EXCEPTION 'record_inbound_message: explicit thread_id % not found', v_explicit_thread_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_thread_workspace != v_workspace_id THEN
      RAISE EXCEPTION 'record_inbound_message: thread_id % belongs to workspace %, payload claims %',
        v_explicit_thread_id, v_thread_workspace, v_workspace_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_thread_id := v_explicit_thread_id;

    UPDATE ops.message_threads
    SET last_message_at = now(),
        deal_id = COALESCE(deal_id, v_deal_id),
        provider_thread_key = COALESCE(provider_thread_key, v_provider_thread)
    WHERE id = v_thread_id;

  ELSE
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
        true
      )
      RETURNING id INTO v_thread_id;
    ELSE
      UPDATE ops.message_threads
      SET last_message_at = now(),
          deal_id = COALESCE(deal_id, v_deal_id)
      WHERE id = v_thread_id;
    END IF;
  END IF;

  IF v_channel = 'email' AND v_from_address IS NOT NULL THEN
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'email' = lower(v_from_address)
    LIMIT 1;
  ELSIF v_channel = 'sms' AND v_from_address IS NOT NULL THEN
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'phone' = v_from_address
    LIMIT 1;
  END IF;

  IF v_from_entity_id IS NULL THEN
    v_needs_resolution := true;
  END IF;

  IF v_from_entity_id IS NOT NULL THEN
    UPDATE ops.message_threads
    SET primary_entity_id = COALESCE(primary_entity_id, v_from_entity_id)
    WHERE id = v_thread_id;
  END IF;

  IF v_needs_resolution OR v_deal_id IS NULL THEN
    UPDATE ops.message_threads
    SET needs_resolution = true
    WHERE id = v_thread_id;
  END IF;

  IF v_body_text IS NOT NULL AND NOT v_is_auto_reply THEN
    SELECT kw INTO v_urgency_keyword
    FROM unnest(v_urgency_keywords) AS kw
    WHERE v_body_text ILIKE '%' || kw || '%'
    LIMIT 1;
  END IF;

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
    urgency_keyword_match,
    is_auto_reply,
    auto_reply_reason
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
    v_urgency_keyword,
    v_is_auto_reply,
    v_auto_reply_reason
  )
  ON CONFLICT (workspace_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    SELECT id INTO v_message_id
    FROM ops.messages
    WHERE workspace_id = v_workspace_id
      AND provider_message_id = v_provider_msg_id;

    IF v_message_id IS NULL THEN
      RAISE EXCEPTION 'record_inbound_message: insert produced no row and no conflict was detected'
        USING ERRCODE = 'internal_error';
    END IF;

    RETURN v_message_id;
  END IF;

  IF v_deal_id IS NOT NULL AND NOT v_is_auto_reply THEN
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
  'Inbound message ingress. Prefers p_payload->>thread_id (authoritative alias match from handler) over provider_thread_key (header-based fallback). Idempotent via partial unique index on (workspace_id, provider_message_id). Skips follow-up auto-resolve when is_auto_reply=true. Returns message id.';

REVOKE EXECUTE ON FUNCTION ops.record_inbound_message(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.record_inbound_message(jsonb) FROM anon;

DO $$
DECLARE
  v_leaky boolean;
BEGIN
  SELECT has_function_privilege('anon', 'ops.record_inbound_message(jsonb)', 'EXECUTE')
    INTO v_leaky;

  IF v_leaky THEN
    RAISE EXCEPTION 'Safety check failed: anon can EXECUTE ops.record_inbound_message after migration';
  END IF;
END $$;
