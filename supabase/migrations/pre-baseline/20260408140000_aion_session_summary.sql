-- =============================================================================
-- Add conversation summary columns to cortex.aion_sessions
--
-- Rolling summary of older messages, compressed by Haiku.
-- Full message history stays in cortex.aion_messages (non-destructive).
-- =============================================================================

ALTER TABLE cortex.aion_sessions
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS summarized_up_to text;

-- Update the save RPC to accept summary updates
CREATE OR REPLACE FUNCTION cortex.update_aion_session_summary(
  p_session_id uuid,
  p_summary text,
  p_summarized_up_to text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  UPDATE cortex.aion_sessions
    SET conversation_summary = p_summary,
        summarized_up_to = p_summarized_up_to,
        updated_at = now()
    WHERE id = p_session_id;
END;
$$;
