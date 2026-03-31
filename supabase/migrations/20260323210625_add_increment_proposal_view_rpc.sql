-- Atomic proposal view increment to prevent race condition when multiple
-- tabs open simultaneously (read-then-write would cause lost increments).
-- Called from track-proposal-view.ts via system client.

CREATE OR REPLACE FUNCTION public.increment_proposal_view(
  p_proposal_id  uuid,
  p_now          timestamptz,
  p_set_first    boolean,   -- true when first_viewed_at is currently null
  p_was_sent     boolean    -- true when status is 'sent' (transitions to 'viewed')
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.proposals
  SET
    view_count      = view_count + 1,
    last_viewed_at  = p_now,
    first_viewed_at = CASE WHEN p_set_first THEN p_now ELSE first_viewed_at END,
    status          = CASE WHEN p_was_sent THEN 'viewed' ELSE status END
  WHERE id = p_proposal_id;
$$;
