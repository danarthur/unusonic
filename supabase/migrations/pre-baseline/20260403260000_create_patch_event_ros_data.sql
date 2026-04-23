-- Atomic JSONB merge for ops.events.run_of_show_data.
-- Prevents read-modify-write race conditions when multiple crew members
-- (e.g. a DJ and a band) save prep data to the same event concurrently.
-- Uses jsonb_concat (||) which is atomic at the row level.

CREATE OR REPLACE FUNCTION ops.patch_event_ros_data(
  p_event_id uuid,
  p_patch jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops
AS $$
BEGIN
  UPDATE ops.events
  SET run_of_show_data = COALESCE(run_of_show_data, '{}'::jsonb) || p_patch,
      updated_at = now()
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION ops.patch_event_ros_data(uuid, jsonb) TO authenticated;
