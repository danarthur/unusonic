-- Give `deals.main_contact_id` the value five readers have been asking for.
--
-- The column had no writer. It was NULL on every deal in production, which left
-- the employee portal's pipeline and a crew member's gig detail showing no
-- client name, and Aion unable to resolve one or match a deal by its client.
--
-- Aion's own lookup carries a comment about the symptom -- "wedding deals
-- typically store the client on main_contact_id, so organization-only
-- resolution left client_name=null on ~half of deals" -- and a fallback written
-- for exactly this that never fired, because the column it falls back to was
-- empty too.
--
-- `organization_id` covers company clients. This is its counterpart for the
-- ones who are people: the primary host, which is already the flag deciding
-- which of two partners a deal is filed under.
--
-- Only fills what is NULL. A value somebody set by hand is not ours to move.

UPDATE public.deals d
SET main_contact_id = h.entity_id
FROM (
  SELECT DISTINCT ON (s.deal_id)
         s.deal_id,
         s.entity_id
  FROM ops.deal_stakeholders s
  WHERE s.role = 'host'
    AND s.entity_id IS NOT NULL
  -- Primary first, then whatever host came first: a deal created before
  -- anything set is_primary still has a first host, and that is the client.
  ORDER BY s.deal_id,
           s.is_primary DESC,
           s.display_order ASC NULLS LAST,
           s.added_at ASC
) h
WHERE d.id = h.deal_id
  AND d.main_contact_id IS NULL;

-- A deal with a host stakeholder should now name its client. Deals with no host
-- (company-only, or created before stakeholders existed) are left alone and
-- keep resolving through organization_id.
DO $$
DECLARE
  v_unfilled int;
BEGIN
  SELECT count(*) INTO v_unfilled
  FROM public.deals d
  WHERE d.main_contact_id IS NULL
    AND EXISTS (
      SELECT 1 FROM ops.deal_stakeholders s
      WHERE s.deal_id = d.id AND s.role = 'host' AND s.entity_id IS NOT NULL
    );

  IF v_unfilled > 0 THEN
    RAISE EXCEPTION '% deals still have a host but no main_contact_id', v_unfilled;
  END IF;
END $$;
