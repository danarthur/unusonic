-- Drop the edge vocabulary nothing ever used.
--
-- REPRESENTS, BOOKS_FOR and BILLS_FOR shipped alongside CO_HOST in the P0
-- client-field redesign: validated context shapes, two SECURITY DEFINER RPCs,
-- an edge-type enum. CO_HOST went on to be written by `create_deal_complete`
-- every time a couple books a show. The other three were never written and
-- never read -- zero rows of each in production, and zero callers in the app.
--
-- They also duplicate roles that already exist on ops.deal_stakeholders, and
-- for the one concept where both shapes were available, the per-deal shape is
-- the one that got used:
--
--   REPRESENTS  <-> stakeholder role 'representative' / 'principal'   0 rows
--   BOOKS_FOR   <-> stakeholder role 'booker'                         0 rows
--   BILLS_FOR   <-> stakeholder role 'bill_to'                       11 rows
--
-- A vocabulary that claims the graph knows something it does not is worse than
-- no vocabulary. It is why nothing displayed a couple for months: CO_HOST was
-- being written the whole time and every reader assumed the graph was empty.
-- Two places for one fact, neither holding any, is the thing to remove.
--
-- Nothing here is destructive to data -- there is none. The function bodies stay
-- in git history at
-- supabase/migrations/pre-baseline/20260420020000_co_host_represents_edge_rpcs.sql
-- if the standing-relationship idea comes back, and it would want to pre-fill
-- the deal role rather than sit beside it.
--
-- BILLS_FOR never had an RPC at all, so there is nothing to drop for it.

DROP FUNCTION IF EXISTS public.add_represents_edge(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.add_books_for_edge(uuid, uuid, uuid, text);

-- Fail rather than leave a dead SECURITY DEFINER function that authenticated
-- users can still call.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('add_represents_edge', 'add_books_for_edge')
  ) THEN
    RAISE EXCEPTION 'an unused edge RPC survived the drop';
  END IF;

  -- Paranoia: never drop the vocabulary out from under stored data.
  IF EXISTS (
    SELECT 1 FROM cortex.relationships
    WHERE relationship_type IN ('REPRESENTS', 'BOOKS_FOR', 'BILLS_FOR')
  ) THEN
    RAISE EXCEPTION 'edges exist for a type this migration assumes is unused';
  END IF;
END $$;
