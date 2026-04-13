-- =============================================================================
-- cortex.aion_insights — Proactive triggers for Aion
--
-- Rule-based conditions evaluated by the daily cron. Each row = one actionable
-- insight surfaced in the Aion chat greeting or via the get_proactive_insights tool.
--
-- Trigger evaluation is SQL-based (never LLM). Titles are pre-formatted.
-- Follows cortex write protection: SELECT via RLS, writes via SECURITY DEFINER RPCs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.aion_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  context jsonb DEFAULT '{}',
  priority int DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'surfaced', 'dismissed', 'resolved')),
  surfaced_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active insight per trigger+entity (pending or surfaced only)
CREATE UNIQUE INDEX idx_aion_insights_active
  ON cortex.aion_insights (trigger_type, entity_id)
  WHERE status IN ('pending', 'surfaced');

CREATE INDEX idx_aion_insights_workspace ON cortex.aion_insights (workspace_id, status, priority DESC);

ALTER TABLE cortex.aion_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY insights_select ON cortex.aion_insights FOR SELECT USING (
  workspace_id IN (SELECT get_my_workspace_ids())
);

-- ── Write RPCs ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cortex.upsert_aion_insight(
  p_workspace_id uuid,
  p_trigger_type text,
  p_entity_type text,
  p_entity_id text,
  p_title text,
  p_context jsonb DEFAULT '{}',
  p_priority int DEFAULT 0,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Try to update existing active insight for this trigger+entity
  UPDATE cortex.aion_insights
    SET title = p_title,
        context = p_context,
        priority = p_priority,
        expires_at = p_expires_at
    WHERE workspace_id = p_workspace_id
      AND trigger_type = p_trigger_type
      AND entity_id = p_entity_id
      AND status IN ('pending', 'surfaced')
    RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Insert new insight
  INSERT INTO cortex.aion_insights (
    workspace_id, trigger_type, entity_type, entity_id,
    title, context, priority, expires_at
  )
  VALUES (
    p_workspace_id, p_trigger_type, p_entity_type, p_entity_id,
    p_title, p_context, p_priority, p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION cortex.dismiss_aion_insight(
  p_insight_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  UPDATE cortex.aion_insights
    SET status = 'dismissed', dismissed_at = now()
    WHERE id = p_insight_id AND status IN ('pending', 'surfaced');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION cortex.resolve_aion_insight(
  p_trigger_type text,
  p_entity_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  UPDATE cortex.aion_insights
    SET status = 'resolved', resolved_at = now()
    WHERE trigger_type = p_trigger_type
      AND entity_id = p_entity_id
      AND status IN ('pending', 'surfaced');
  RETURN FOUND;
END;
$$;
